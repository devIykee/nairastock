#!/usr/bin/env node
/**
 * Marks dist/esm as an ES module tree.
 *
 * The package root has no `"type"` field, so Node and bundlers would otherwise
 * read `dist/esm/*.js` as CommonJS and choke on the `export` statements. A
 * one-line nested package.json flips the interpretation for that subtree only,
 * leaving the CJS build at dist/ untouched.
 *
 * Why two builds at all: the API is NestJS and needs CommonJS for decorator
 * metadata, while Vite/Rollup cannot trace named exports through the CJS
 * `__exportStar` helper that `export *` compiles into — importing
 * `getChainMeta` from the CJS build fails at bundle time. Each consumer gets the
 * format it can actually read, from one set of sources.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const esmDir = resolve(here, '..', 'dist', 'esm');

await mkdir(esmDir, { recursive: true });
await writeFile(resolve(esmDir, 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`, 'utf8');
