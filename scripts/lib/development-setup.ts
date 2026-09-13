export function developmentOwnerUrl(env: Record<string, string | undefined>): string {
  if (env.NODE_ENV !== 'development') throw new Error('Setup is restricted to development');
  if (!env.SUPABASE_DATABASE_PASSWORD) throw new Error('SUPABASE_DATABASE_PASSWORD is required');
  const url = new URL('postgresql://postgres@db.zsejplglpfcmcikcydgb.supabase.co:5432/postgres');
  url.password = env.SUPABASE_DATABASE_PASSWORD;
  return url.toString();
}
