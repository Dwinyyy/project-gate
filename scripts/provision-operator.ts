import { readFile } from 'node:fs/promises';
import { prepareOperatorStatusChange } from './lib/operator-provisioning.js';

// Preparation only: the reviewed output is executed through the authorized owner transport.
try {
  const [requestFile, ...extra] = process.argv.slice(2);
  if (!requestFile || extra.length > 0) throw new Error('request-file-required');
  const request: unknown = JSON.parse(await readFile(requestFile, 'utf8'));
  process.stdout.write(prepareOperatorStatusChange(request));
} catch {
  console.error(
    'Operator preparation failed. Supply one valid request JSON file; no access changed.',
  );
  process.exitCode = 1;
}
