import type { PoolClient } from 'pg';
import type { AppearanceChoice, ProfileVisibility } from '@hunter-world/contracts';
import type { ProfileFailureKind } from './profile-disclosure.js';

export type ProfileOperation =
  | 'character.profile.update'
  | 'character.profile.invitation.issue'
  | 'character.profile.invitation.revoke'
  | 'account.disclosure.withdraw';
export type ProfileActionInput =
  | {
      operation: Exclude<ProfileOperation, 'account.disclosure.withdraw'>;
      characterId: string;
      expectedRevision: string;
    }
  | { operation: 'account.disclosure.withdraw' };
export type ProfileActorLockOptions = {
  accountLock: 'share' | 'update';
  sharingGate: 'none' | 'share';
  pilotGrant: 'none' | 'share';
};
export type LockedProfileActor = {
  authUserId: string;
  accountId: string;
  accessState: 'active' | 'restricted';
  accountLock: 'share' | 'update';
  profileDisclosureEnabled: boolean | null;
  pilotGrantEnabled: boolean | null;
};
export type LockedProfileActorResult =
  | { kind: 'allowed'; actor: LockedProfileActor }
  | { kind: 'denied'; reason: 'operator_only' | 'auth_ineligible' | 'profile_unavailable' };
export type LockedProfileCharacter = {
  characterId: string;
  accountId: string;
  displayAlias: string;
  appearance: AppearanceChoice;
  lifeState: 'alive' | 'incapacitated' | 'dead';
  awakeningState: 'unawakened' | 'awakened';
  visibility: ProfileVisibility;
  showFictionalAvatar: boolean;
  showRegistrationDate: boolean;
  characterRevision: string;
  disclosureRevision: string;
  publicReference: string;
  createdAt: Date;
};
export type ProfileAuthorityResult =
  | { kind: 'allowed'; subject: { kind: 'character'; character: LockedProfileCharacter } }
  | { kind: 'allowed'; subject: { kind: 'account'; characters: readonly LockedProfileCharacter[] } }
  | { kind: 'denied'; reason: ProfileFailureKind };
export const profileUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const profileRevisionPattern = /^(0|[1-9][0-9]*)$/;
export const profileCharacterColumns = `id AS "characterId",account_id AS "accountId",display_alias AS "displayAlias",
  json_build_object('catalogVersion',catalog_version,'presetId',preset_id,'skinToneId',skin_tone_id,'hairStyleId',hair_style_id,'hairColorId',hair_color_id) AS appearance,
  life_state AS "lifeState",awakening_state AS "awakeningState",profile_visibility AS visibility,
  show_fictional_avatar AS "showFictionalAvatar",show_registration_date AS "showRegistrationDate",
  revision::text AS "characterRevision",disclosure_revision::text AS "disclosureRevision",public_reference AS "publicReference",created_at AS "createdAt"`;

/** Transaction-local ownership only; gate/grant/action policy follows receipt lookup. */
export async function lockProfileActor(
  client: PoolClient,
  authUserId: string,
  options: ProfileActorLockOptions,
): Promise<LockedProfileActorResult> {
  if (typeof authUserId !== 'string' || !profileUuidPattern.test(authUserId))
    return { kind: 'denied', reason: 'auth_ineligible' };
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('operator-account:' || $1::uuid::text,0))",
    [authUserId],
  );
  if (
    (
      await client.query('SELECT 1 FROM ops.operator_accounts WHERE auth_user_id=$1::uuid', [
        authUserId,
      ])
    ).rowCount
  )
    return { kind: 'denied', reason: 'operator_only' };
  let gate: boolean | null = null;
  let grant: boolean | null = null;
  if (options.sharingGate === 'share') {
    const result = await client.query<{ profile_disclosure: boolean }>(
      'SELECT profile_disclosure FROM ops.feature_controls WHERE singleton FOR SHARE',
    );
    if (!result.rows[0]) throw new Error('Feature controls are missing');
    gate = result.rows[0].profile_disclosure;
  }
  if (
    (
      await client.query<{ eligible: boolean }>(
        'SELECT game.lock_eligible_auth_user($1::uuid) AS eligible',
        [authUserId],
      )
    ).rows[0]?.eligible !== true
  )
    return { kind: 'denied', reason: 'auth_ineligible' };
  if (options.pilotGrant === 'share')
    grant =
      (
        await client.query<{ enabled: boolean }>(
          'SELECT ops.lock_character_pilot_access($1::uuid) AS enabled',
          [authUserId],
        )
      ).rows[0]?.enabled === true;
  const row = (
    await client.query<{ id: string; access_state: 'active' | 'restricted' }>(
      `SELECT id,access_state FROM game.accounts WHERE auth_user_id=$1::uuid FOR ${options.accountLock === 'update' ? 'UPDATE' : 'SHARE'}`,
      [authUserId],
    )
  ).rows[0];
  if (!row) return { kind: 'denied', reason: 'profile_unavailable' };
  return {
    kind: 'allowed',
    actor: {
      authUserId: authUserId.toLowerCase(),
      accountId: row.id,
      accessState: row.access_state,
      accountLock: options.accountLock,
      profileDisclosureEnabled: gate,
      pilotGrantEnabled: grant,
    },
  };
}
export async function authorizeLockedProfileAction(
  client: PoolClient,
  actor: LockedProfileActor,
  input: ProfileActionInput,
): Promise<ProfileAuthorityResult> {
  if (
    actor.accountLock !== 'update' ||
    !input ||
    ![
      'character.profile.update',
      'character.profile.invitation.issue',
      'character.profile.invitation.revoke',
      'account.disclosure.withdraw',
    ].includes(input.operation)
  )
    return { kind: 'denied', reason: 'invalid_request' };
  if (input.operation === 'account.disclosure.withdraw') {
    const rows = await client.query<LockedProfileCharacter>(
      `SELECT ${profileCharacterColumns} FROM game.characters WHERE account_id=$1::uuid ORDER BY id FOR UPDATE`,
      [actor.accountId],
    );
    return rows.rows.length
      ? { kind: 'allowed', subject: { kind: 'account', characters: rows.rows } }
      : { kind: 'denied', reason: 'profile_unavailable' };
  }
  if (
    !profileUuidPattern.test(input.characterId) ||
    typeof input.expectedRevision !== 'string' ||
    !profileRevisionPattern.test(input.expectedRevision)
  )
    return { kind: 'denied', reason: 'invalid_request' };
  const character = (
    await client.query<LockedProfileCharacter>(
      `SELECT ${profileCharacterColumns} FROM game.characters WHERE account_id=$1::uuid AND id=$2::uuid FOR UPDATE`,
      [actor.accountId, input.characterId],
    )
  ).rows[0];
  if (!character) return { kind: 'denied', reason: 'character_unavailable' };
  if (actor.accessState !== 'active') return { kind: 'denied', reason: 'account_restricted' };
  if (character.lifeState !== 'alive') return { kind: 'denied', reason: 'character_unavailable' };
  if (character.characterRevision !== input.expectedRevision)
    return { kind: 'denied', reason: 'stale_revision' };
  if (input.operation !== 'character.profile.invitation.revoke') {
    if (character.awakeningState !== 'unawakened')
      return { kind: 'denied', reason: 'character_unavailable' };
    if (actor.profileDisclosureEnabled !== true || actor.pilotGrantEnabled !== true)
      return { kind: 'denied', reason: 'sharing_unavailable' };
    if (
      input.operation === 'character.profile.invitation.issue' &&
      character.visibility === 'private'
    )
      return { kind: 'denied', reason: 'character_unavailable' };
  }
  return { kind: 'allowed', subject: { kind: 'character', character } };
}
