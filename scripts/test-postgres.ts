import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Disposable PostgreSQL tests cannot run in production.');
}

const cacheRoot = resolve('.cache/postgres-tests');
await mkdir(cacheRoot, { recursive: true });
const runDirectory = await mkdtemp(resolve(cacheRoot, 'run-'));
const tempDirectory = resolve(runDirectory, 'tmp');
await mkdir(tempDirectory);
// embedded-postgres writes initdb's temporary password file through os.tmpdir().
// Keep that file, database files, and logs inside this disposable workspace run.
process.env.TEMP = tempDirectory;
process.env.TMP = tempDirectory;
process.env.TMPDIR = tempDirectory;
const { default: EmbeddedPostgres } = await import('embedded-postgres');

const port = await new Promise<number>((resolvePort, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') return reject(new Error('No test port.'));
    server.close((error) => (error ? reject(error) : resolvePort(address.port)));
  });
});
const password = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir: resolve(runDirectory, 'data'),
  user: 'postgres',
  password,
  port,
  authMethod: 'scram-sha-256',
  persistent: true,
  createPostgresUser: false,
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => undefined,
  onError: () => console.error('Disposable PostgreSQL process reported an error.'),
});

let testExitCode: number;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('hunter_test');
  const connectionString = `postgresql://postgres:${password}@127.0.0.1:${port}/hunter_test`;
  console.log('Real PostgreSQL started in workspace; running integration tests.');
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    const child = spawn(
      process.execPath,
      ['node_modules/vitest/vitest.mjs', 'run', 'tests/integration', ...process.argv.slice(2)],
      {
        stdio: 'inherit',
        windowsHide: true,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          TEST_DATABASE_URL: connectionString,
          MIGRATION_DATABASE_URL: connectionString,
        },
      },
    );
    child.once('error', reject);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
  testExitCode = exitCode;
} catch {
  console.error('Disposable PostgreSQL setup or test process failed.');
  testExitCode = 1;
} finally {
  await postgres.stop();
}
// embedded-postgres's beforeExit hook otherwise replaces process.exitCode with 0.
process.exit(testExitCode);
