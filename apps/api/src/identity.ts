import type { AuthIdentity, AuthVerifier } from '@hunter-world/server';

export function bearerToken(authorization: string | undefined): string | null {
  if (!authorization || authorization.length > 8192) return null;
  const match = /^Bearer ([^\s,]+)$/.exec(authorization);
  return match?.[1] ?? null;
}

export type StandardIdentityResult =
  | { kind: 'invalid' }
  | { kind: 'recovery' }
  | { kind: 'restricted' }
  | { kind: 'standard'; identity: AuthIdentity };

export async function verifyStandardIdentity(
  authorization: string | undefined,
  verifier: AuthVerifier,
): Promise<StandardIdentityResult> {
  const token = bearerToken(authorization);
  if (!token) return { kind: 'invalid' };
  const identity = await verifier.verify(token);
  if (!identity) return { kind: 'invalid' };
  if (identity.accessMode === 'recovery') return { kind: 'recovery' };
  if (identity.accessMode !== 'standard') return { kind: 'restricted' };
  return { kind: 'standard', identity };
}
