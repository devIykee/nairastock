#!/usr/bin/env node
/**
 * Blocks until Postgres and Redis are reachable, so `pnpm db:migrate` right
 * after `docker compose up -d` doesn't race the container's startup and fail
 * with a raw ECONNREFUSED from Prisma.
 */
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readEnv() {
  const out = {};
  for (const file of ['.env', '.env.example']) {
    try {
      const raw = readFileSync(path.join(ROOT, file), 'utf8');
      for (const line of raw.split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (m && out[m[1]] === undefined) out[m[1]] = m[2].trim();
      }
    } catch {
      /* file may not exist yet, fall through to the next one */
    }
  }
  return { ...out, ...process.env };
}

function hostPortFromUrl(url, fallbackPort) {
  try {
    const u = new URL(url);
    return { host: u.hostname || '127.0.0.1', port: Number(u.port) || fallbackPort };
  } catch {
    return { host: '127.0.0.1', port: fallbackPort };
  }
}

function probe({ host, port }, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function waitFor(name, target, attempts = 40) {
  for (let i = 1; i <= attempts; i += 1) {
    if (await probe(target)) {
      console.log(`  ✓ ${name} ready on ${target.host}:${target.port}`);
      return true;
    }
    if (i === 1) console.log(`  … waiting for ${name} on ${target.host}:${target.port}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`  ✗ ${name} never came up on ${target.host}:${target.port}`);
  return false;
}

const env = readEnv();
const pg = hostPortFromUrl(env.DATABASE_URL, Number(env.POSTGRES_HOST_PORT) || 5433);
const redis = hostPortFromUrl(env.REDIS_URL, Number(env.REDIS_HOST_PORT) || 6380);

const ok = (await waitFor('postgres', pg)) && (await waitFor('redis', redis));
process.exit(ok ? 0 : 1);
