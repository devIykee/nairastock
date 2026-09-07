import { feedAnswerToUsd, ngnToUsd, nextSimulatedPrice, percentChange, usdToNgn, valueOfHolding } from './pricing-math';
import { parseAmount } from '@nairastock/shared';

/**
 * Price conversions. These produce the hero number on the dashboard, so the
 * assertions are about exactness rather than approximate agreement, a float
 * bug here shows up as a portfolio value that's subtly wrong and hard to notice.
 */
describe('pricing math', () => {
  describe('feedAnswerToUsd', () => {
    it('scales a Chainlink 8-decimal answer to a decimal string', () => {
      expect(feedAnswerToUsd(23_140_000_000n)).toBe('231.4');
      expect(feedAnswerToUsd(61_275_000_000n)).toBe('612.75');
      expect(feedAnswerToUsd(1n)).toBe('0.00000001');
    });

    it('honours a non-standard feed decimal count', () => {
      expect(feedAnswerToUsd(231_400_000_000_000_000_000n, 18)).toBe('231.4');
    });

    it('rejects a non-positive answer rather than showing $0', () => {
      // A Chainlink feed reporting <= 0 is a broken feed, not a free stock.
      expect(() => feedAnswerToUsd(0n)).toThrow(/non-positive/);
      expect(() => feedAnswerToUsd(-100n)).toThrow(/non-positive/);
    });
  });

  describe('usdToNgn / ngnToUsd', () => {
    it('converts at the configured rate', () => {
      expect(usdToNgn('231.4', 1600)).toBe('370240');
      expect(usdToNgn('1', 1600)).toBe('1600');
    });

    it('round-trips within rounding tolerance', () => {
      const usd = '231.4';
      const back = ngnToUsd(usdToNgn(usd, 1600), 1600);
      expect(Number(back)).toBeCloseTo(Number(usd), 10);
    });

    it('handles fractional cents without float drift', () => {
      // 0.1 + 0.2 territory: exact decimal arithmetic, not IEEE754.
      expect(usdToNgn('0.03', 1600)).toBe('48');
    });

    it('rejects a zero rate instead of returning Infinity', () => {
      expect(() => ngnToUsd('1600', 0)).toThrow(/cannot be zero/);
    });
  });

  describe('valueOfHolding', () => {
    it('multiplies quantity by unit price at 2dp', () => {
      // 2.691398377170462969 AAPLc × ₦370,240 = ₦996,463.3403…, rounded to 2dp.
      expect(valueOfHolding(parseAmount('2.691398377170462969', 18), 18, '370240')).toBe('996463.34');
    });

    it('values a zero balance as zero', () => {
      expect(valueOfHolding(0n, 18, '370240')).toBe('0');
    });

    it('keeps full precision on a dust balance', () => {
      expect(valueOfHolding(1n, 18, '370240')).toBe('0');
      expect(valueOfHolding(parseAmount('0.000001', 18), 18, '370240')).toBe('0.37');
    });

    it('does not lose precision on a large position', () => {
      // 1,000,000 shares, well past 2^53 in base units.
      expect(valueOfHolding(parseAmount('1000000', 18), 18, '370240')).toBe('370240000000');
    });
  });

  describe('percentChange', () => {
    it('computes a signed 2dp percentage', () => {
      expect(percentChange('100', '101.5')).toBe('1.5');
      expect(percentChange('100', '98.58')).toBe('-1.42');
      expect(percentChange('231.4', '231.4')).toBe('0');
    });

    it('returns null when the baseline is zero', () => {
      expect(percentChange('0', '100')).toBeNull();
    });

    it('handles a large move', () => {
      expect(percentChange('100', '200')).toBe('100');
      expect(percentChange('100', '0.5')).toBe('-99.5');
    });
  });

  describe('nextSimulatedPrice, the testnet stand-in for a live Chainlink feed', () => {
    const SEED = 23_140_000_000n; // $231.40 at 8dp

    it('moves the price when the walk is off-centre', () => {
      const next = nextSimulatedPrice(SEED, SEED, { random: () => 0.9 });
      expect(next).not.toBe(SEED);
    });

    it('keeps a single step small, under 0.3% at the default volatility', () => {
      for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
        const next = nextSimulatedPrice(SEED, SEED, { random: () => r });
        const movePct = Number(((next - SEED) * 10_000n) / SEED) / 100;
        expect(Math.abs(movePct)).toBeLessThan(0.3);
      }
    });

    it('pulls back toward the seed price from above', () => {
      const high = (SEED * 130n) / 100n;
      // random() = 0.5 gives zero shock, isolating the reversion term.
      const next = nextSimulatedPrice(high, SEED, { random: () => 0.5 });
      expect(next).toBeLessThan(high);
      expect(next).toBeGreaterThan(SEED);
    });

    it('pulls back toward the seed price from below', () => {
      const low = (SEED * 70n) / 100n;
      const next = nextSimulatedPrice(low, SEED, { random: () => 0.5 });
      expect(next).toBeGreaterThan(low);
      expect(next).toBeLessThan(SEED);
    });

    it('stays within ±40% of seed over a long run', () => {
      let price = SEED;
      const floor = (SEED * 60n) / 100n;
      const ceiling = (SEED * 140n) / 100n;

      // 2,880 ticks ≈ 24h at a 30s cadence.
      for (let i = 0; i < 2_880; i += 1) {
        price = nextSimulatedPrice(price, SEED);
        expect(price).toBeGreaterThanOrEqual(floor);
        expect(price).toBeLessThanOrEqual(ceiling);
      }
    });

    it('never reaches zero even under a relentless downward walk', () => {
      let price = SEED;
      for (let i = 0; i < 500; i += 1) {
        price = nextSimulatedPrice(price, SEED, { random: () => 0 });
      }
      expect(price).toBeGreaterThan(0n);
      // Mean reversion dominates a one-sided shock, so it settles below seed
      // rather than collapsing.
      expect(price).toBeGreaterThan((SEED * 60n) / 100n - 1n);
    });

    it('respects an explicit volatility override', () => {
      const calm = nextSimulatedPrice(SEED, SEED, { random: () => 1, volatilityBps: 1 });
      const wild = nextSimulatedPrice(SEED, SEED, { random: () => 1, volatilityBps: 500 });
      expect(wild - SEED).toBeGreaterThan(calm - SEED);
    });
  });
});
