/**
 * Deploys the demo venue and folds the resulting addresses into the repo-root
 * `.env`, so `pnpm db:seed` and the API pick them up with no manual copying.
 *
 *   pnpm chain:deploy                 # whatever RPC_URL points at (anvil by default)
 *   pnpm chain:deploy:sepolia         # same, with a Sepolia-appropriate .env
 *
 * The only stateful side effect outside the chain is a rewrite of the KEY=VALUE
 * lines this script owns; every other line in `.env` is preserved verbatim.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// tsx may load this as CJS (where import.meta.dirname is undefined) or ESM, so
// resolve from __dirname when available and fall back to the module URL.
const SCRIPT_DIR =
  typeof __dirname === 'string' ? __dirname : path.dirname(new URL(import.meta.url).pathname);

const CONTRACTS_DIR = path.resolve(SCRIPT_DIR, '..');
const ROOT_DIR = path.resolve(CONTRACTS_DIR, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');

interface Deployment {
  chainId: number;
  deployer: string;
  ngnUsdRate: number;
  multicall3: string;
  factory: string;
  router: string;
  cngn: string;
  symbols: string[];
  tokens: string[];
  feeds: string[];
  poolCngn: string[];
}

function fail(message: string): never {
  console.error(`\x1b[31m✗ ${message}\x1b[0m`);
  process.exit(1);
}

if (!existsSync(ENV_PATH)) {
  fail(`no .env at ${ENV_PATH} — run \`cp .env.example .env\` first (or \`pnpm setup\`)`);
}

dotenv.config({ path: ENV_PATH, quiet: true });

const rpcUrl = process.env.RPC_URL;
const faucetKey = process.env.FAUCET_PRIVATE_KEY;
if (!rpcUrl) fail('RPC_URL is not set in .env');
if (!faucetKey) fail('FAUCET_PRIVATE_KEY is not set in .env');
if (!/^0x[0-9a-fA-F]{64}$/.test(faucetKey)) {
  fail('FAUCET_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string');
}

console.log(`\x1b[36m→ deploying demo venue to ${rpcUrl}\x1b[0m`);

const forgeArgs = [
  'script',
  'script/Deploy.s.sol:Deploy',
  '--rpc-url',
  rpcUrl,
  '--broadcast',
  // Sepolia's public RPC rate-limits parallel sends; serial is slower but reliable.
  '--slow',
  '-vv',
];

const forge = spawnSync('forge', forgeArgs, {
  cwd: CONTRACTS_DIR,
  stdio: 'inherit',
  env: { ...process.env },
});

if (forge.error) {
  fail(`could not run forge (${forge.error.message}). Install Foundry: https://getfoundry.sh`);
}
if (forge.status !== 0) {
  fail(`forge script exited with code ${forge.status}. Is a chain listening on ${rpcUrl}?`);
}

// The script writes deployments/<chainid>.json; discover which by asking the node.
const chainIdRes = spawnSync('cast', ['chain-id', '--rpc-url', rpcUrl], { cwd: CONTRACTS_DIR, encoding: 'utf8' });
if (chainIdRes.status !== 0) fail(`cast chain-id failed: ${chainIdRes.stderr?.trim()}`);
const chainId = Number(chainIdRes.stdout.trim());

const deploymentPath = path.join(CONTRACTS_DIR, 'deployments', `${chainId}.json`);
if (!existsSync(deploymentPath)) {
  fail(`expected deployment output at ${deploymentPath} but it is missing`);
}

const deployment = JSON.parse(readFileSync(deploymentPath, 'utf8')) as Deployment;

const symbolToEnvKey: Record<string, { address: string; feed: string }> = {
  AAPLc: { address: 'AAPLC_ADDRESS', feed: 'AAPLC_FEED_ADDRESS' },
  NVDAc: { address: 'NVDAC_ADDRESS', feed: 'NVDAC_FEED_ADDRESS' },
  METAc: { address: 'METAC_ADDRESS', feed: 'METAC_FEED_ADDRESS' },
  GOOGLc: { address: 'GOOGLC_ADDRESS', feed: 'GOOGLC_FEED_ADDRESS' },
};

const updates: Record<string, string> = {
  CHAIN_ID: String(chainId),
  MULTICALL3_ADDRESS: deployment.multicall3,
  DEX_FACTORY_ADDRESS: deployment.factory,
  DEX_ROUTER_ADDRESS: deployment.router,
  CNGN_ADDRESS: deployment.cngn,
};

deployment.symbols.forEach((symbol, i) => {
  const keys = symbolToEnvKey[symbol];
  if (!keys) {
    console.warn(`  ! deployment contains unrecognised symbol "${symbol}" — not written to .env`);
    return;
  }
  updates[keys.address] = deployment.tokens[i];
  updates[keys.feed] = deployment.feeds[i];
});

/** Replaces the keys we own in place; appends any that were absent. */
function applyEnvUpdates(contents: string, values: Record<string, string>): string {
  let out = contents;
  const appended: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^(\\s*)${key}\\s*=.*$`, 'm');
    if (pattern.test(out)) {
      out = out.replace(pattern, `$1${key}=${value}`);
    } else {
      appended.push(`${key}=${value}`);
    }
  }

  if (appended.length > 0) {
    out = `${out.replace(/\s*$/, '')}\n\n# Written by contracts/scripts/deploy.ts\n${appended.join('\n')}\n`;
  }
  return out;
}

writeFileSync(ENV_PATH, applyEnvUpdates(readFileSync(ENV_PATH, 'utf8'), updates));

console.log(`\n\x1b[32m✓ deployed to chain ${chainId}\x1b[0m and wrote addresses into .env:`);
for (const [key, value] of Object.entries(updates)) {
  console.log(`  ${key.padEnd(22)} ${value}`);
}
console.log(`\n  liquidity seeded per pool (cNGN side):`);
deployment.symbols.forEach((symbol, i) => {
  const whole = (BigInt(deployment.poolCngn[i]) / 10n ** 18n).toLocaleString('en-US');
  console.log(`  ${symbol.padEnd(8)} ₦${whole}`);
});
console.log('\nNext:  pnpm db:seed  &&  pnpm dev');
