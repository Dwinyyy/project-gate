export interface ServerEnvironment {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl?: string;
  databaseSsl: boolean;
  databaseSslCaPath?: string;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  revision?: string;
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
  const databaseSslCaPath = source.DATABASE_SSL_CA_PATH?.trim();
  if (databaseSslCaPath && !databaseSsl) throw new Error('Database CA requires TLS');
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
  const rawSupabaseUrl = source.SUPABASE_URL?.trim();
  const supabasePublishableKey = source.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (Boolean(rawSupabaseUrl) !== Boolean(supabasePublishableKey)) {
    throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured together');
  }
  if (nodeEnv === 'production' && (!rawSupabaseUrl || !supabasePublishableKey)) {
    throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required in production');
  }
  let supabaseUrl: string | undefined;
  if (rawSupabaseUrl) {
    let url: URL;
    try {
      url = new URL(rawSupabaseUrl);
    } catch {
      throw new Error('SUPABASE_URL must be an absolute URL');
    }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
      throw new Error('SUPABASE_URL must use HTTPS unless it targets loopback development');
    }
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('SUPABASE_URL must contain only the Supabase project origin');
    }
    supabaseUrl = url.origin;
  }
  const host = source.HOST ?? '127.0.0.1';
  if (!host.trim()) throw new Error('HOST must not be empty');
  const revision = source.RENDER_GIT_COMMIT;
  if (revision !== undefined && !/^[0-9a-f]{40}$/i.test(revision)) {
    throw new Error('RENDER_GIT_COMMIT must be a full Git commit SHA');
  }
  return {
    nodeEnv,
    host,
    port,
    databaseSsl,
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(databaseSslCaPath ? { databaseSslCaPath } : {}),
    ...(supabaseUrl ? { supabaseUrl } : {}),
    ...(supabasePublishableKey ? { supabasePublishableKey } : {}),
    ...(revision ? { revision } : {}),
  };
}
