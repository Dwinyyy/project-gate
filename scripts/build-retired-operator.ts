import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIN_SITE_SIGN_IN, writeRetiredOperatorEntry } from './lib/retired-operator-entry.ts';

const appRoot = process.argv.includes('--app-root');
const output = fileURLToPath(
  new URL(appRoot ? '../apps/operator/dist/' : '../dist/operator/', import.meta.url),
);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const expected = resolve(projectRoot, appRoot ? 'apps/operator/dist' : 'dist/operator');
if (resolve(output) !== resolve(expected)) throw new Error('Unexpected retired entry output path');

await rm(output, { recursive: true, force: true });
await writeRetiredOperatorEntry(output, MAIN_SITE_SIGN_IN, '/redirect.js');
