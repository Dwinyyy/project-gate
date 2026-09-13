import { readdir, readFile } from 'node:fs/promises';
import { inspectPublicSource } from './lib/boundaries.js';

const errors: string[] = [];
async function inspect(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await inspect(file);
    else if (/\.[cm]?[jt]sx?$/.test(file))
      errors.push(...inspectPublicSource(file, await readFile(file, 'utf8')));
    else if (
      /\.css$/.test(file) &&
      /(?:content\/private|packages\/server|packages\/database)/.test(await readFile(file, 'utf8'))
    )
      errors.push(`${file}: private asset reference`);
  }
}
for (const root of [
  'apps/player',
  'apps/operator',
  'packages/client',
  'packages/contracts',
  'packages/ui',
])
  await inspect(`${root}/src`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log('Public import boundaries verified.');
