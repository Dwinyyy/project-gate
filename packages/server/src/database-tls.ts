import { readFile } from 'node:fs/promises';
import type { ConnectionOptions } from 'node:tls';
import type { ServerEnvironment } from './environment.js';

export async function databaseTls(
  environment: ServerEnvironment,
): Promise<false | ConnectionOptions> {
  if (!environment.databaseSsl) return false;
  return {
    rejectUnauthorized: true,
    ...(environment.databaseSslCaPath
      ? { ca: await readFile(environment.databaseSslCaPath, 'utf8') }
      : {}),
  };
}
