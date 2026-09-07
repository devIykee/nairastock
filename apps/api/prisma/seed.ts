/**
 * Seeds the tradeable universe and a pre-funded demo user.
 *
 *   pnpm db:seed
 *
 * Idempotent — safe to re-run after a redeploy, which is the common case: new
 * contract addresses land in .env, and the token rows need to follow.
 *
 * Reads addresses from the repo-root .env (written by `pnpm chain:deploy`). If a
 * token's address is missing the row is skipped with a warning rather than
 * seeding a placeholder that would fail on first read.
 */
import { CustodyMode, PrismaClient, TokenKind } from '@prisma/client';
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import * as bip39 from 'bip39';
import { ethers } from 'ethers';
import { CNGN_REFERENCE, PRICE_FEED_DECIMALS, STOCK_REFERENCES } from '@nairastock/shared';

const prisma = new PrismaClient();

const CHAIN_ID = Number(process.env.CHAIN_ID ?? 31337);
const NGN_USD_RATE = Number(process.env.NGN_USD_RATE ?? 1600);
/** Opening balance for the demo user so a walkthrough never starts at zero. */
const DEMO_NGN_FLOAT = '5000000';

function env(key: string): string | null {
  const value = process.env[key];
  if (!value || value.trim() === '') return null;
  return value.trim();
}

/**
 * Same AES-256-GCM + scrypt envelope as CryptoVaultService. Duplicated here
 * rather than imported because the seed runs outside the Nest DI container, and
 * pulling the container up just to encrypt one string is worse. The envelope
 * format is what has to match, and it does.
 */
function encryptMnemonic(plaintext: string, secret: string): string {
  const salt = randomBytes(32);
  const key = scryptSync(secret, salt, 32, { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  return JSON.stringify({
    v: 1,
    kdf: 'scrypt',
    n: 32_768,
    r: 8,
    p: 1,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    ct: ct.toString('hex'),
  });
}

async function seedTokens(): Promise<{ seeded: string[]; skipped: string[] }> {
  const seeded: string[] = [];
  const skipped: string[] = [];

  const cngnAddress = env(CNGN_REFERENCE.addressEnvKey);
  if (cngnAddress) {
    await prisma.token.upsert({
      where: { symbol_chainId: { symbol: CNGN_REFERENCE.symbol, chainId: CHAIN_ID } },
      create: {
        symbol: CNGN_REFERENCE.symbol,
        name: CNGN_REFERENCE.name,
        kind: TokenKind.STABLECOIN,
        address: ethers.getAddress(cngnAddress),
        chainId: CHAIN_ID,
        decimals: CNGN_REFERENCE.decimals,
        logoUrl: CNGN_REFERENCE.logoUrl,
        isTestnetMock: CHAIN_ID !== 8453,
        sortOrder: 0,
        blurb:
          'cNGN is a naira-pegged stablecoin issued by the Africa Stablecoin Consortium. It is the settlement ' +
          'asset here: you fund in naira, hold cNGN, and swap it for tokenized stock.',
      },
      update: {
        address: ethers.getAddress(cngnAddress),
        decimals: CNGN_REFERENCE.decimals,
        isTestnetMock: CHAIN_ID !== 8453,
        isActive: true,
      },
    });
    seeded.push(CNGN_REFERENCE.symbol);
  } else {
    skipped.push(CNGN_REFERENCE.symbol);
  }

  for (const [index, reference] of STOCK_REFERENCES.entries()) {
    const address = env(reference.addressEnvKey);
    if (!address) {
      skipped.push(reference.symbol);
      continue;
    }
    const feedAddress = env(reference.feedEnvKey);

    await prisma.token.upsert({
      where: { symbol_chainId: { symbol: reference.symbol, chainId: CHAIN_ID } },
      create: {
        symbol: reference.symbol,
        name: reference.name,
        kind: TokenKind.STOCK,
        address: ethers.getAddress(address),
        chainId: CHAIN_ID,
        decimals: reference.decimals,
        logoUrl: reference.logoUrl,
        chainlinkFeedAddress: feedAddress ? ethers.getAddress(feedAddress) : null,
        underlyingSymbol: reference.underlyingSymbol,
        blurb: reference.blurb,
        // TESTNET_MOCK: the Coinbase B20 series is mainnet-only, so anything
        // that isn't Base mainnet is a mock ERC20 with matching decimals.
        isTestnetMock: CHAIN_ID !== 8453,
        sortOrder: index + 1,
      },
      update: {
        address: ethers.getAddress(address),
        chainlinkFeedAddress: feedAddress ? ethers.getAddress(feedAddress) : null,
        decimals: reference.decimals,
        blurb: reference.blurb,
        isTestnetMock: CHAIN_ID !== 8453,
        isActive: true,
      },
    });
    seeded.push(reference.symbol);
  }

  return { seeded, skipped };
}

/**
 * One snapshot per stock at its seed price, so the chart has a first point.
 *
 * "Already seeded" means a snapshot inside the chart's 24h window, not any
 * snapshot ever: re-seeding a database that was last touched days ago has to
 * write a fresh opening point, or the chart renders empty until the first poll.
 */
const CHART_WINDOW_HOURS = 24;

async function seedInitialPrices(): Promise<number> {
  const tokens = await prisma.token.findMany({ where: { chainId: CHAIN_ID, kind: TokenKind.STOCK } });
  const since = new Date(Date.now() - CHART_WINDOW_HOURS * 60 * 60 * 1000);
  let written = 0;

  for (const token of tokens) {
    const existing = await prisma.priceSnapshot.count({
      where: { tokenId: token.id, timestamp: { gte: since } },
    });
    if (existing > 0) continue;

    const reference = STOCK_REFERENCES.find((r) => r.symbol === token.symbol);
    if (!reference) continue;

    const priceUsd = reference.seedPriceUsd;
    const priceNgn = (Number(priceUsd) * NGN_USD_RATE).toFixed(2);

    await prisma.priceSnapshot.create({
      data: {
        tokenId: token.id,
        priceUsd,
        priceNgn,
        ngnUsdRate: String(NGN_USD_RATE),
        roundId: '1',
        simulated: token.isTestnetMock,
      },
    });
    written += 1;
  }
  void PRICE_FEED_DECIMALS; // documents where the 8dp feed scale is enforced
  return written;
}

/**
 * Creates the demo user with a deterministic mnemonic, so a fresh clone always
 * lands on the same address and the same pre-funded state. The phrase is the
 * well-known Hardhat/anvil test mnemonic — public by design, and its derived
 * address is anvil account #1.
 */
const DEMO_MNEMONIC = 'test test test test test test test test test test test junk';
const DEMO_ACCOUNT_INDEX = 1;

async function seedDemoUser(): Promise<{ address: string; created: boolean }> {
  // Absolute path passed to fromPhrase — see WalletService.deriveWallet for why
  // chaining .derivePath() off fromPhrase would give a non-standard address.
  const wallet = ethers.HDNodeWallet.fromPhrase(
    DEMO_MNEMONIC,
    undefined,
    `m/44'/60'/0'/0/${DEMO_ACCOUNT_INDEX}`,
  );
  const address = ethers.getAddress(wallet.address);

  const encryptionKey = env('WALLET_ENCRYPTION_KEY');
  if (!encryptionKey) {
    throw new Error('WALLET_ENCRYPTION_KEY is not set — copy .env.example to .env before seeding.');
  }

  const existing = await prisma.user.findUnique({ where: { walletAddress: address } });
  if (existing) {
    return { address, created: false };
  }

  await prisma.user.create({
    data: {
      walletAddress: address,
      custodyMode: CustodyMode.DEMO_CUSTODIAL,
      encryptedMnemonic: encryptMnemonic(DEMO_MNEMONIC, encryptionKey),
      derivationPath: `m/44'/60'/0'/0/${DEMO_ACCOUNT_INDEX}`,
      mnemonicBackedUp: true,
      isDemoUser: true,
      wallets: { create: { address, chainId: CHAIN_ID, accountIndex: DEMO_ACCOUNT_INDEX, label: 'Demo' } },
    },
  });

  return { address, created: true };
}

/**
 * Mints the demo user's opening cNGN balance and sends gas. Requires a live RPC;
 * skipped with a warning when the chain isn't up, since the DB rows are still
 * useful without it.
 */
async function fundDemoUser(address: string): Promise<void> {
  const rpcUrl = env('RPC_URL');
  const faucetKey = env('FAUCET_PRIVATE_KEY');
  const cngnAddress = env(CNGN_REFERENCE.addressEnvKey);

  if (!rpcUrl || !faucetKey || !cngnAddress) {
    console.warn('  ! RPC_URL / FAUCET_PRIVATE_KEY / CNGN_ADDRESS incomplete — skipping demo funding');
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl, { chainId: CHAIN_ID, name: 'seed' }, { staticNetwork: true });
  const faucet = new ethers.Wallet(faucetKey, provider);

  const cngn = new ethers.Contract(
    cngnAddress,
    [
      'function balanceOf(address) view returns (uint256)',
      'function mint(address to, uint256 amount)',
      'function minter() view returns (address)',
      'function decimals() view returns (uint8)',
    ],
    faucet,
  );

  const decimals = Number(await cngn.decimals());
  const target = ethers.parseUnits(DEMO_NGN_FLOAT, decimals);
  const current = (await cngn.balanceOf(address)) as bigint;

  if (current < target) {
    const minter = (await cngn.minter()) as string;
    if (ethers.getAddress(minter) !== ethers.getAddress(faucet.address)) {
      console.warn(`  ! faucet is not the cNGN minter (${minter}) — skipping cNGN mint`);
    } else {
      const tx = await cngn.mint(address, target - current);
      await tx.wait();
      console.log(`  ✓ minted ₦${DEMO_NGN_FLOAT} cNGN to ${address}`);
    }
  } else {
    console.log(`  · demo wallet already holds ≥ ₦${DEMO_NGN_FLOAT} cNGN`);
  }

  const gas = await provider.getBalance(address);
  if (gas < ethers.parseEther('0.01')) {
    const tx = await faucet.sendTransaction({ to: address, value: ethers.parseEther('0.05') });
    await tx.wait();
    console.log(`  ✓ sent 0.05 ETH gas to ${address}`);
  }
}

async function main(): Promise<void> {
  console.log(`\nseeding NairaStock on chain ${CHAIN_ID} (₦${NGN_USD_RATE}/$1)\n`);

  const { seeded, skipped } = await seedTokens();
  console.log(`  ✓ tokens: ${seeded.join(', ') || '(none)'}`);
  if (skipped.length > 0) {
    console.warn(`  ! skipped (no address in .env): ${skipped.join(', ')}`);
    console.warn('    run `pnpm chain:deploy` first, then re-run `pnpm db:seed`');
  }

  const prices = await seedInitialPrices();
  if (prices > 0) console.log(`  ✓ seeded ${prices} opening price snapshots`);

  const demo = await seedDemoUser();
  console.log(`  ${demo.created ? '✓ created' : '·'} demo user ${demo.address}`);

  await fundDemoUser(demo.address).catch((error: unknown) => {
    console.warn(`  ! demo funding failed: ${(error as Error).message}`);
    console.warn('    is a chain listening on RPC_URL? try `pnpm chain:up`');
  });

  console.log('\nseed complete\n');
}

main()
  .catch((error: unknown) => {
    console.error('\nseed failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
