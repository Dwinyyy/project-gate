import 'dotenv/config';
import { createDatabase } from '@hunter-world/database';
import { createWorker, databaseTls, parseEnvironment } from '@hunter-world/server';

async function main() {
  const environment = parseEnvironment(process.env);
  if (!environment.databaseUrl) throw new Error('Worker requires DATABASE_URL');
  const database = createDatabase({
    connectionString: environment.databaseUrl,
    ssl: await databaseTls(environment),
  });
  const worker = createWorker(database);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await worker.stop();
    } finally {
      await database.close();
    }
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void stop();
    });
  try {
    await worker.start();
  } catch {
    await stop();
    throw new Error('Worker could not start');
  }
}

main().catch(() => {
  process.stderr.write('Worker startup failed. Check database readiness and migrations.\n');
  process.exitCode = 1;
});
