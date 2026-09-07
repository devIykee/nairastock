import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Env is read from the repo root, not apps/web — one .env drives the API, the
 * contracts deploy script, and the frontend, so an address written by
 * `pnpm chain:deploy` is picked up here without a second copy.
 */
export default defineConfig(({ mode }) => {
  const repoRoot = resolve(import.meta.dirname, '..', '..');
  const env = loadEnv(mode, repoRoot, 'VITE_');

  return {
    plugins: [react()],
    envDir: repoRoot,
    resolve: {
      alias: {
        '@': resolve(import.meta.dirname, 'src'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // Dev-only proxy so the browser talks to one origin and CORS never
        // becomes the reason a demo doesn't load.
        '/api': {
          target: env.VITE_API_PROXY_TARGET ?? 'http://localhost:4010',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
