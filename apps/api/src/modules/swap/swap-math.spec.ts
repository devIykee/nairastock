import {
  AmmMathError,
  applySlippage,
  getAmountIn,
  getAmountOut,
  getPriceImpactBps,
  getSpotPrice,
  parseAmount,
} from '@nairastock/shared';

/**
 * Constant-product quote math.
 *
 * This is the arithmetic behind every number on the trade screen, and it has to
 * match the router's on-chain math exactly, a mismatch shows up as a swap that
 * reverts after the user has already confirmed. Reserve fixtures below are the
 * genesis state the deploy script seeds: 5,000 AAPLc against ₦1,851,200,000
 * (5,000 × $231.40 × ₦1,600).
 */
describe('AMM quote math', () => {
  const RESERVES = {
    reserveIn: parseAmount('1851200000', 18), // cNGN
    reserveOut: parseAmount('5000', 18), // AAPLc
  };

  describe('getAmountOut', () => {
    it('matches the UniswapV2 formula with a 30 bps input fee', () => {
      const amountIn = parseAmount('1000000', 18);

      // Recomputed independently here, exactly as UniswapV2Library does it.
      const amountInWithFee = amountIn * 9_970n;
      const expected =
        (amountInWithFee * RESERVES.reserveOut) / (RESERVES.reserveIn * 10_000n + amountInWithFee);

      expect(getAmountOut(amountIn, RESERVES)).toBe(expected);
    });

    it('prices ₦1,000,000 at roughly 2.7 AAPLc', () => {
      const out = getAmountOut(parseAmount('1000000', 18), RESERVES);
      // ₦1m ÷ ₦370,240/share = 2.7009…, less the 30 bps fee and impact.
      expect(Number(out) / 1e18).toBeCloseTo(2.6914, 3);
    });

    it('charges the fee: output is strictly below the constant-product ideal', () => {
      const amountIn = parseAmount('1000000', 18);
      const feeless = (amountIn * RESERVES.reserveOut) / (RESERVES.reserveIn + amountIn);
      expect(getAmountOut(amountIn, RESERVES)).toBeLessThan(feeless);
    });

    it('is monotonic in amountIn', () => {
      const small = getAmountOut(parseAmount('1000', 18), RESERVES);
      const medium = getAmountOut(parseAmount('10000', 18), RESERVES);
      const large = getAmountOut(parseAmount('100000', 18), RESERVES);
      expect(small).toBeLessThan(medium);
      expect(medium).toBeLessThan(large);
    });

    it('never returns more than the output reserve', () => {
      const absurd = getAmountOut(parseAmount('1000000000000', 18), RESERVES);
      expect(absurd).toBeLessThan(RESERVES.reserveOut);
    });

    it('rejects a zero or negative input', () => {
      expect(() => getAmountOut(0n, RESERVES)).toThrow(AmmMathError);
      expect(() => getAmountOut(-1n, RESERVES)).toThrow(/greater than zero/);
    });

    it('rejects an empty pool with a liquidity error', () => {
      expect(() => getAmountOut(1n, { reserveIn: 0n, reserveOut: 100n })).toThrow(
        expect.objectContaining({ code: 'INSUFFICIENT_LIQUIDITY' }),
      );
      expect(() => getAmountOut(1n, { reserveIn: 100n, reserveOut: 0n })).toThrow(
        expect.objectContaining({ code: 'INSUFFICIENT_LIQUIDITY' }),
      );
    });
  });

  describe('getAmountIn', () => {
    it('inverts getAmountOut to within the rounding increment', () => {
      const desiredOut = parseAmount('2', 18);
      const requiredIn = getAmountIn(desiredOut, RESERVES);
      const actualOut = getAmountOut(requiredIn, RESERVES);

      // The +1 rounding makes getAmountIn conservative, never under-quote.
      expect(actualOut).toBeGreaterThanOrEqual(desiredOut);
    });

    it('rejects an output at or above the reserve', () => {
      expect(() => getAmountIn(RESERVES.reserveOut, RESERVES)).toThrow(
        expect.objectContaining({ code: 'INSUFFICIENT_LIQUIDITY' }),
      );
    });

    it('rejects a non-positive output', () => {
      expect(() => getAmountIn(0n, RESERVES)).toThrow(AmmMathError);
    });
  });

  describe('getPriceImpactBps', () => {
    it('reports roughly the fee alone for a dust trade', () => {
      const amountIn = parseAmount('100', 18);
      const amountOut = getAmountOut(amountIn, RESERVES);
      const impact = getPriceImpactBps(amountIn, amountOut, RESERVES);
      // Impact includes the 30 bps fee, which is what a trader actually feels.
      expect(impact).toBeGreaterThanOrEqual(29);
      expect(impact).toBeLessThan(35);
    });

    it('grows with trade size', () => {
      // Sizes chosen to span the range where curve movement dominates. Below
      // ~₦1m the impact on this pool rounds to the 30 bps fee alone, so a
      // strict-increase assertion there would be testing integer truncation.
      const sizes = ['1000000', '10000000', '100000000', '500000000'];
      const impacts = sizes.map((size) => {
        const amountIn = parseAmount(size, 18);
        return getPriceImpactBps(amountIn, getAmountOut(amountIn, RESERVES), RESERVES);
      });
      for (let i = 1; i < impacts.length; i += 1) {
        expect(impacts[i]).toBeGreaterThan(impacts[i - 1]);
      }
    });

    it('never decreases with size, even where truncation flattens it', () => {
      const sizes = ['1', '100', '1000', '100000', '1000000', '100000000'];
      const impacts = sizes.map((size) => {
        const amountIn = parseAmount(size, 18);
        return getPriceImpactBps(amountIn, getAmountOut(amountIn, RESERVES), RESERVES);
      });
      for (let i = 1; i < impacts.length; i += 1) {
        expect(impacts[i]).toBeGreaterThanOrEqual(impacts[i - 1]);
      }
    });

    it('keeps a ₦2,000,000 trade under 1% on the seeded pool', () => {
      const amountIn = parseAmount('2000000', 18);
      const impact = getPriceImpactBps(amountIn, getAmountOut(amountIn, RESERVES), RESERVES);
      expect(impact).toBeLessThan(100);
    });

    it('returns 0 rather than throwing on degenerate input', () => {
      expect(getPriceImpactBps(0n, 0n, RESERVES)).toBe(0);
      expect(getPriceImpactBps(1n, 1n, { reserveIn: 0n, reserveOut: 0n })).toBe(0);
    });
  });

  describe('getSpotPrice', () => {
    it('equals the seeded price of ₦370,240 per share', () => {
      const spot = getSpotPrice(RESERVES);
      expect(Number(spot) / 1e18).toBeCloseTo(1 / 370_240, 12);
    });

    it('returns 0 for an empty input reserve instead of dividing by zero', () => {
      expect(getSpotPrice({ reserveIn: 0n, reserveOut: 5n })).toBe(0n);
    });
  });

  describe('applySlippage, the guard the router enforces', () => {
    it('subtracts the tolerance in bps', () => {
      const amountOut = parseAmount('100', 18);
      expect(applySlippage(amountOut, 100)).toBe(parseAmount('99', 18));
      expect(applySlippage(amountOut, 50)).toBe(parseAmount('99.5', 18));
      expect(applySlippage(amountOut, 5_000)).toBe(parseAmount('50', 18));
    });

    it('is a no-op at zero tolerance', () => {
      const amountOut = parseAmount('42.5', 18);
      expect(applySlippage(amountOut, 0)).toBe(amountOut);
    });

    it('always yields a floor at or below the quote', () => {
      const amountOut = parseAmount('7.123456789', 18);
      for (const bps of [1, 10, 100, 300, 1_000]) {
        expect(applySlippage(amountOut, bps)).toBeLessThanOrEqual(amountOut);
      }
    });

    it('rejects a negative tolerance', () => {
      expect(() => applySlippage(parseAmount('1', 18), -1)).toThrow(AmmMathError);
    });

    /**
     * The reason the guard exists: if the pool moves against the user between
     * quote and execution, the realised output can fall below the quote. A
     * tolerance narrower than the move must reject; wider must fill.
     */
    it('rejects a move larger than the tolerance and admits a smaller one', () => {
      const amountIn = parseAmount('1000000', 18);
      const quoted = getAmountOut(amountIn, RESERVES);
      const minOut = applySlippage(quoted, 100); // 1%

      // Someone buys ₦40m of AAPLc first, lifting the price ~2.2%.
      const frontRun = parseAmount('40000000', 18);
      const taken = getAmountOut(frontRun, RESERVES);
      const moved = {
        reserveIn: RESERVES.reserveIn + frontRun,
        reserveOut: RESERVES.reserveOut - taken,
      };

      const afterMove = getAmountOut(amountIn, moved);
      expect(afterMove).toBeLessThan(minOut); // 1% would revert on-chain
      expect(afterMove).toBeGreaterThan(applySlippage(quoted, 500)); // 5% would fill
    });
  });
});
