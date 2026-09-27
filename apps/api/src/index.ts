import 'dotenv/config';
import {
  createCharacterStore,
  createDatabase,
  createOperatorAccessStore,
} from '@hunter-world/database';
import { createSupabaseAuthVerifier, databaseTls, parseEnvironment } from '@hunter-world/server';
import { buildApp } from './app.js';

async function main() {
  const environment = parseEnvironment(process.env);
  const database = environment.databaseUrl
    ? createDatabase({
        connectionString: environment.databaseUrl,
        ssl: await databaseTls(environment),
      })
    : undefined;
  const auth =
    environment.supabaseUrl && environment.supabasePublishableKey
      ? {
          publicConfig: {
            supabaseUrl: environment.supabaseUrl,
            supabasePublishableKey: environment.supabasePublishableKey,
          },
          verifier: createSupabaseAuthVerifier({
            supabaseUrl: environment.supabaseUrl,
            publishableKey: environment.supabasePublishableKey,
          }),
        }
      : undefined;
  const app = buildApp({
    logger: true,
    ...(environment.revision ? { revision: environment.revision } : {}),
    ...(database ? { database } : {}),
    ...(auth ? { auth } : {}),
    ...(database ? { operators: createOperatorAccessStore(database.pool) } : {}),
    ...(database ? { characters: createCharacterStore(database.pool) } : {}),
  });
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
