import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const failures: string[] = [];
for (const file of files) {
  if (/\.pdf$/.test(file)) continue;
  if (/(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.example')) {
    failures.push(file);
    continue;
  }
  const contents = await readFile(file, 'utf8');
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(contents) ||
    /\b(?:sb_secret_|sk_live_)[A-Za-z0-9_-]{20,}\b/.test(contents) ||
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b/.test(contents)
  )
    failures.push(file);
}
if (failures.length) {
  console.error(`Potential credentials in: ${failures.join(', ')}`);
  process.exitCode = 1;
} else console.log('Credential-pattern scan passed (not a substitute for review).');
