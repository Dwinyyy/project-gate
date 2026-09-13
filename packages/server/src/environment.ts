export interface ServerEnvironment {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl?: string;
  databaseSsl: boolean;
}

function booleanSetting(source: Record<string, string | undefined>, key: string): boolean {
  const value = source[key];
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error(`${key} must be true or false`);
}

export function parseEnvironment(source: Record<string, string | undefined>): ServerEnvironment {
  const nodeEnv = source.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  const rawPort = source.PORT ?? '3001';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const databaseUrl = source.DATABASE_URL;
  const databaseSsl = booleanSetting(source, 'DATABASE_SSL');
  const simulator = booleanSetting(source, 'ENABLE_LOCATION_SIMULATOR');
  if (nodeEnv === 'production' && simulator)
    throw new Error('Production location simulator is forbidden');
  if (nodeEnv === 'production' && !databaseUrl)
    throw new Error('DATABASE_URL is required in production');
  if (nodeEnv === 'production' && !databaseSsl)
    throw new Error('Production database requires verified TLS');
  if (databaseUrl) {
    let url: URL;
    try {
      url = new URL(databaseUrl);
    } catch {
      throw new Error('DATABASE_URL must be a PostgreSQL URL');
    }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
      throw new Error('DATABASE_URL must be a PostgreSQL URL');
    }
    // URL SSL options can override node-postgres ssl configuration. One authority only.
    if (['sslmode', 'sslcert', 'sslkey', 'sslrootcert'].some((key) => url.searchParams.has(key))) {
      throw new Error('Use DATABASE_SSL instead of SSL query parameters in DATABASE_URL');
    }
  }
  const host = source.HOST ?? '127.0.0.1';
  if (!host.trim()) throw new Error('HOST must not be empty');
  return { nodeEnv, host, port, databaseSsl, ...(databaseUrl ? { databaseUrl } : {}) };
}
