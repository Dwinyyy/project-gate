import type { PoolClient } from 'pg';

export type CharacterOperation =
  | 'account.records.read'
  | 'public.content.read'
  | 'character.create'
  | 'character.profile.update'
  | 'character.rescue.respond';

export type CharacterAuthorityInput =
  | {
      authUserId: string;
      operation: 'account.records.read' | 'public.content.read' | 'character.create';
    }
  | {
      authUserId: string;
      operation: 'character.profile.update' | 'character.rescue.respond';
      characterId: string;
      expectedRevision: string;
    };

export type CharacterAuthorityResult =
  | { kind: 'allowed'; accountId: string | null; charactersEnabled: boolean | null }
  | {
      kind: 'denied';
      reason:
        | 'operator_only'
        | 'auth_ineligible'
        | 'account_restricted'
        | 'character_missing'
        | 'stale_revision'
        | 'incapacitated'
        | 'dead_or_observer'
        | 'rescue_unavailable';
    };

interface AccountRow {
  id: string;
  access_state: string;
}

interface CharacterRow {
  life_state: string;
  revision: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const revisionPattern = /^(0|[1-9][0-9]*)$/;

// The caller must keep this client inside the transaction that commits its action.
export async function authorizeCharacterOperation(
  client: PoolClient,
  input: CharacterAuthorityInput,
): Promise<CharacterAuthorityResult> {
  const operation = input?.operation;
  if (
    operation !== 'account.records.read' &&
    operation !== 'public.content.read' &&
    operation !== 'character.create' &&
    operation !== 'character.profile.update' &&
    operation !== 'character.rescue.respond'
  ) {
    return { kind: 'denied', reason: 'auth_ineligible' };
  }
  if (typeof input.authUserId !== 'string' || !uuidPattern.test(input.authUserId)) {
    return { kind: 'denied', reason: 'auth_ineligible' };
  }
  // Match the audited operator assignment's canonical UUID-text advisory key.
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('operator-account:' || $1::uuid::text, 0))",
    [input.authUserId],
  );
  const operator = await client.query(
    'SELECT 1 FROM ops.operator_accounts WHERE auth_user_id = $1::uuid',
    [input.authUserId],
  );
  if (operator.rowCount) return { kind: 'denied', reason: 'operator_only' };

  let charactersEnabled: boolean | null = null;
  if (operation === 'character.create') {
    const controls = await client.query<{ characters: boolean }>(
      'SELECT characters FROM ops.feature_controls WHERE singleton FOR SHARE',
    );
    if (!controls.rows[0]) throw new Error('Feature controls are missing');
    charactersEnabled = controls.rows[0].characters;
  }

  const auth = await client.query<{ eligible: boolean }>(
    'SELECT game.lock_eligible_auth_user($1::uuid) AS eligible',
    [input.authUserId],
  );
  if (auth.rows[0]?.eligible !== true) return { kind: 'denied', reason: 'auth_ineligible' };

  const account = await client.query<AccountRow>(
    `SELECT id, access_state FROM game.accounts WHERE auth_user_id = $1::uuid
     ${operation === 'character.create' ? 'FOR UPDATE' : 'FOR SHARE'}`,
    [input.authUserId],
  );
  const accountRow = account.rows[0];
  const accountId = accountRow?.id ?? null;
  if (operation === 'account.records.read' || operation === 'public.content.read') {
    return { kind: 'allowed', accountId, charactersEnabled: null };
  }
  if (accountRow && accountRow.access_state !== 'active') {
    return { kind: 'denied', reason: 'account_restricted' };
  }
  if (operation === 'character.create') {
    return { kind: 'allowed', accountId, charactersEnabled };
  }
  if (
    !accountId ||
    !('characterId' in input) ||
    typeof input.characterId !== 'string' ||
    !uuidPattern.test(input.characterId)
  ) {
    return { kind: 'denied', reason: 'character_missing' };
  }
  if (
    !('expectedRevision' in input) ||
    typeof input.expectedRevision !== 'string' ||
    !revisionPattern.test(input.expectedRevision)
  ) {
    return { kind: 'denied', reason: 'stale_revision' };
  }

  const character = await client.query<CharacterRow>(
    'SELECT life_state, revision FROM game.characters WHERE id = $1::uuid AND account_id = $2::uuid FOR SHARE',
    [input.characterId, accountId],
  );
  const characterRow = character.rows[0];
  if (!characterRow) return { kind: 'denied', reason: 'character_missing' };
  if (characterRow.life_state === 'incapacitated') {
    return { kind: 'denied', reason: 'incapacitated' };
  }
  if (characterRow.life_state !== 'alive') {
    return { kind: 'denied', reason: 'dead_or_observer' };
  }
  if (characterRow.revision !== input.expectedRevision) {
    return { kind: 'denied', reason: 'stale_revision' };
  }
  if (operation === 'character.rescue.respond') {
    return { kind: 'denied', reason: 'rescue_unavailable' };
  }
  return { kind: 'allowed', accountId, charactersEnabled: null };
}
