import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Finds the repo-root `.env` by walking upward from a start directory.
 *
 * A fixed relative path is fragile here: `nest start` runs from
 * `apps/api/dist/src/`, `ts-node` from `apps/api/src/`, and jest from
 * `apps/api/`. Walking up until a marker is found works in all three, and
 * returns every candidate so ConfigModule can take the first that exists.
 */
export function findRepoEnvFiles(): string[] {
  const candidates = new Set<string>();

  for (const start of [__dirname, process.cwd()]) {
    let current = resolve(start);

    // Bounded walk, deep enough for dist/src/config, short enough not to escape
    // into the user's home directory looking for a stray .env.
    for (let depth = 0; depth < 8; depth += 1) {
      const envPath = join(current, '.env');
      // pnpm-workspace.yaml marks the monorepo root unambiguously.
      if (existsSync(join(current, 'pnpm-workspace.yaml')) && existsSync(envPath)) {
        candidates.add(envPath);
        break;
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  // Also accept a local .env inside apps/api, for anyone who prefers per-app env.
  const local = join(process.cwd(), '.env');
  if (existsSync(local)) candidates.add(local);

  return [...candidates];
}
