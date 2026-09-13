import 'dotenv/config';
import { createDatabase } from '@hunter-world/database';
import { createWorker, databaseTls, parseEnvironment } from '@hunter-world/server';
import { buildApp } from '../apps/api/src/app.js';

async function verify() {
  const environment = parseEnvironment(process.env);
  if (environment.nodeEnv !== 'development' || !environment.databaseUrl)
    throw new Error('Development configuration required');
  const database = createDatabase({
    connectionString: environment.databaseUrl,
    ssl: await databaseTls(environment),
  });
  const app = buildApp({ database });
  const worker = createWorker(database);
  try {
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    if (response.statusCode !== 200) throw new Error('API readiness failed');
    await worker.start();
    console.log(
      'Managed API readiness and worker startup passed using restricted runtime and verified TLS.',
    );
  } finally {
    await worker.stop();
    await app.close();
    await database.close();
  }
}
verify().catch(() => {
  console.error('Development verification failed. Credential values are not logged.');
  process.exitCode = 1;
});
