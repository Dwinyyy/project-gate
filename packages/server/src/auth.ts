import type { AuthConfig } from '@hunter-world/contracts';

export interface AuthIdentity {
  authUserId: string;
  email: string | null;
  emailVerified: boolean;
  hasVerifiedTotp: boolean;
  totpAuthenticated: boolean;
  sessionId: string | null;
  aal: 'aal1' | 'aal2';
  accessMode: 'standard' | 'recovery' | 'restricted';
}

export interface AuthVerifier {
  verify(accessToken: string): Promise<AuthIdentity | null>;
}

export interface SupabaseAuthVerifierOptions {
  supabaseUrl: AuthConfig['supabaseUrl'];
  publishableKey: AuthConfig['supabasePublishableKey'];
  fetch?: typeof globalThis.fetch;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AccessTokenClaims {
  sub: string;
  exp: number;
  aal: 'aal1' | 'aal2';
  sessionId: string | null;
  accessMode: AuthIdentity['accessMode'];
  totpAuthenticated: boolean;
}

function authenticationMethods(amr: unknown): string[] | null {
  if (!Array.isArray(amr) || amr.length === 0) return null;
  if (amr.every((entry) => typeof entry === 'string')) {
    const methods = amr as string[];
    return methods.every((method) => method.length > 0 && method.length <= 64) ? methods : null;
  }
  if (
    amr.every((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const record = entry as Record<string, unknown>;
      return (
        typeof record.method === 'string' &&
        record.method.length > 0 &&
        record.method.length <= 64 &&
        typeof record.timestamp === 'number' &&
        Number.isSafeInteger(record.timestamp) &&
        record.timestamp >= 0
      );
    })
  ) {
    return (amr as Array<{ method: string }>).map((entry) => entry.method);
  }
  return null;
}

function parseAccessTokenClaims(accessToken: string): AccessTokenClaims | null {
  const parts = accessToken.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object') return null;
    const claims = value as Record<string, unknown>;
    if (typeof claims.sub !== 'string' || !uuidPattern.test(claims.sub)) return null;
    if (
      typeof claims.exp !== 'number' ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= Math.floor(Date.now() / 1000)
    )
      return null;
    if (claims.aal !== 'aal1' && claims.aal !== 'aal2') return null;
    const methods = authenticationMethods(claims.amr);
    if (!methods) return null;
    const sessionId = claims.session_id;
    if (sessionId !== undefined && (typeof sessionId !== 'string' || !uuidPattern.test(sessionId)))
      return null;
    return {
      sub: claims.sub,
      exp: claims.exp,
      aal: claims.aal,
      sessionId: sessionId ?? null,
      // Email verification can issue OTP AMR even for recovery links. Only a
      // password-authenticated session may enter ordinary application routes.
      accessMode: methods.includes('recovery')
        ? 'recovery'
        : methods.includes('password')
          ? 'standard'
          : 'restricted',
      totpAuthenticated: methods.includes('totp'),
    };
  } catch {
    return null;
  }
}

export function createSupabaseAuthVerifier(options: SupabaseAuthVerifierOptions): AuthVerifier {
  const fetchAuth = options.fetch ?? globalThis.fetch;
  const userEndpoint = new URL('/auth/v1/user', options.supabaseUrl);
  return {
    async verify(accessToken) {
      const claims = parseAccessTokenClaims(accessToken);
      if (!claims) return null;
      try {
        const response = await fetchAuth(userEndpoint, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            apikey: options.publishableKey,
            Authorization: `Bearer ${accessToken}`,
          },
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) return null;
        const value: unknown = await response.json();
        if (!value || typeof value !== 'object') return null;
        const user = value as Record<string, unknown>;
        if (user.id !== claims.sub) return null;
        if (user.email !== undefined && typeof user.email !== 'string') return null;
        if (
          user.email_confirmed_at !== undefined &&
          user.email_confirmed_at !== null &&
          typeof user.email_confirmed_at !== 'string'
        )
          return null;
        if (user.factors !== undefined && !Array.isArray(user.factors)) return null;
        const factors = (user.factors ?? []) as unknown[];
        if (
          !factors.every((factor) =>
            factor !== null &&
            typeof factor === 'object' &&
            typeof (factor as Record<string, unknown>).factor_type === 'string' &&
            typeof (factor as Record<string, unknown>).status === 'string',
          )
        ) return null;
        return {
          authUserId: claims.sub,
          email: user.email ?? null,
          emailVerified:
            typeof user.email_confirmed_at === 'string' && user.email_confirmed_at.length > 0,
          hasVerifiedTotp: factors.some((factor) => {
            const current = factor as Record<string, unknown>;
            return current.factor_type === 'totp' && current.status === 'verified';
          }),
          totpAuthenticated: claims.totpAuthenticated,
          sessionId: claims.sessionId,
          aal: claims.aal,
          accessMode: claims.accessMode,
        };
      } catch {
        return null;
      }
    },
  };
}
