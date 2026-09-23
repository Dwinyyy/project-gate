import { cp, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const operatorConfig = fileURLToPath(new URL('../apps/operator/vite.config.ts', import.meta.url));
const playerConfig = fileURLToPath(new URL('../apps/player/vite.config.ts', import.meta.url));
const appRoot = process.argv.includes('--app-root');
const operatorOutput = fileURLToPath(new URL('../.cache/operator-embedded-build/', import.meta.url));
const playerOutput = fileURLToPath(
  new URL(appRoot ? '../apps/player/dist/' : '../dist/player/', import.meta.url),
);

await build({
  configFile: operatorConfig,
  base: '/operator/',
  build: { outDir: operatorOutput, emptyOutDir: true },
});
await build({
  configFile: playerConfig,
  build: { outDir: playerOutput, emptyOutDir: true },
});
await mkdir(playerOutput, { recursive: true });
const embeddedOutput = join(playerOutput, 'operator');
await cp(operatorOutput, embeddedOutput, {
  recursive: true,
  force: true,
});
const entries = await readdir(embeddedOutput);
if (!entries.includes('index.html') || !entries.includes('assets')) {
  throw new Error(`The operator entry is missing from the player build at ${embeddedOutput}`);
}
