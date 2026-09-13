import 'dotenv/config';
import { createDatabase } from '@hunter-world/database';
import { parseEnvironment } from '@hunter-world/server';
import { buildApp } from './app.js';

async function main() {
  const environment = parseEnvironment(process.env);
  const database = environment.databaseUrl
    ? createDatabase({ connectionString: environment.databaseUrl, ssl: environment.databaseSsl })
    : undefined;
  const app = buildApp({ logger: true, ...(database ? { database } : {}) });
  if (database) app.addHook('onClose', () => database.close());
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void app.close();
    });
  }
  try {
    await app.listen({ host: environment.host, port: environment.port });
  } catch {
    await app.close();
    throw new Error('API could not start');
  }
}

main().catch(() => {
  // Do not print driver/configuration errors that could include credentials.
  process.stderr.write('API startup failed. Check environment and port configuration.\n');
  process.exitCode = 1;
});
