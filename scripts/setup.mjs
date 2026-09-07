#!/usr/bin/env node
/**
 * One-shot local bootstrap: `pnpm setup`
 *
 *   1. cp .env.example .env   (only if .env is absent, never clobbers)
 *   2. docker compose up -d + wait for postgres/redis
 *   3. prisma migrate deploy
 *   4. forge build + deploy demo contracts to the configured RPC, writing the
 *      resulting addresses back into .env
 *   5. prisma db seed
 *
 * Step 4 needs a chain listening on RPC_URL. For the default local target that
 * means `pnpm chain:up` (anvil) in another terminal; the script says so rather
 * than failing with an ethers connection dump.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const step = (n, msg) => console.log(`\n\x1b[36m[${n}/5]\x1b[0m ${msg}`);

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: false, ...opts });
  if (res.status !== 0) {
    console.error(`\n\x1b[31m✗ failed:\x1b[0m ${cmd} ${args.join(' ')}`);
    process.exit(res.status ?? 1);
  }
}

function envValue(key) {
  try {
    const raw = readFileSync(path.join(ROOT, '.env'), 'utf8');
    const m = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm').exec(raw);
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

function reachable(url) {
  return new Promise((resolve) => {
    let host = '127.0.0.1';
    let port = 8545;
    try {
      const u = new URL(url);
      host = u.hostname;
      port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
    } catch {
      /* keep defaults */
    }
    const s = net.connect({ host, port });
    const done = (ok) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(2500);
    s.once('connect', () => done(true));
    s.once('timeout', () => done(false));
    s.once('error', () => done(false));
  });
}

step(1, 'env file');
if (existsSync(path.join(ROOT, '.env'))) {
  console.log('  .env already exists, leaving it alone');
} else {
  copyFileSync(path.join(ROOT, '.env.example'), path.join(ROOT, '.env'));
  console.log('  created .env from .env.example');
}

step(2, 'postgres + redis');
run('docker', ['compose', 'up', '-d']);
run('node', ['scripts/wait-for-infra.mjs']);

step(3, 'database migrations');
run('pnpm', ['-F', '@nairastock/api', 'prisma:deploy']);

step(4, 'demo contracts');
const rpc = envValue('RPC_URL') ?? 'http://127.0.0.1:8545';
if (await reachable(rpc)) {
  run('pnpm', ['-F', '@nairastock/contracts', 'deploy:local']);
} else {
  console.log(`  ! no chain listening on ${rpc}, skipping contract deploy.`);
  console.log('    Start one with:  pnpm chain:up      (in another terminal)');
  console.log('    Then finish with: pnpm chain:deploy && pnpm db:seed');
  process.exit(0);
}

step(5, 'seed data');
run('pnpm', ['-F', '@nairastock/api', 'prisma:seed']);

console.log('\n\x1b[32m✓ setup complete\x1b[0m, start the app with:  pnpm dev');
console.log('  api    http://localhost:4010/api');
console.log('  docs   http://localhost:4010/api/docs');
console.log('  web    http://localhost:5173');
