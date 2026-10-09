import { createHash, randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  profileRuleVersion,
  type CivilianProfileResponse,
  type OwnerProfileResponse,
  type UpdateMyProfileInput,
  type IssueProfileInvitationInput,
  type RevokeProfileInvitationInput,
  type WithdrawProfileDisclosureInput,
  type ResolveProfileInvitationInput,
  type ProfileMutationResponse,
  type IssueProfileInvitationResponse,
  type ResolveProfileInvitationResponse,
  type ProfileOperationKind,
  type ProfileOperationReceipt,
  type IssuedInvitationMetadata,
} from '@hunter-world/contracts';
import { authorizeCharacterOperation } from './character-authority.js';
import {
  authorizeLockedProfileAction,
  lockProfileActor,
  profileCharacterColumns,
  profileRevisionPattern,
  profileUuidPattern,
  type LockedProfileCharacter,
} from './profile-authority.js';
import { withTransaction } from './index.js';

export type ProfileFailureKind =
  | 'operator_only'
  | 'auth_ineligible'
  | 'account_restricted'
  | 'profile_unavailable'
  | 'sharing_unavailable'
  | 'character_unavailable'
  | 'stale_revision'
  | 'operation_conflict'
  | 'invitation_exists'
  | 'invitation_missing'
  | 'invalid_request';
export type ProfileStoreResult<T> = { kind: 'success'; value: T } | { kind: ProfileFailureKind };
export interface ProfileStore {
  getOwner(authUserId: string): Promise<ProfileStoreResult<OwnerProfileResponse>>;
  update(
    authUserId: string,
    input: UpdateMyProfileInput,
    operationId: string,
  ): Promise<ProfileStoreResult<ProfileMutationResponse>>;
  issue(
    authUserId: string,
    input: IssueProfileInvitationInput,
    operationId: string,
  ): Promise<ProfileStoreResult<IssueProfileInvitationResponse>>;
  revoke(
    authUserId: string,
    input: RevokeProfileInvitationInput,
    operationId: string,
  ): Promise<ProfileStoreResult<ProfileMutationResponse>>;
  withdraw(
    authUserId: string,
    input: WithdrawProfileDisclosureInput,
    operationId: string,
  ): Promise<ProfileStoreResult<ProfileMutationResponse>>;
  getPublic(
    authUserId: string,
    publicReference: string,
  ): Promise<ProfileStoreResult<CivilianProfileResponse>>;
  resolve(
    authUserId: string,
    input: ResolveProfileInvitationInput,
  ): Promise<ProfileStoreResult<ResolveProfileInvitationResponse>>;
}
interface InvitationRow {
  id: string;
  scope: 'profile.view';
  issued_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  disclosure_revision: string;
}
interface ReceiptRow {
  operation_id: string;
  request_digest: Buffer;
  operation: ProfileOperationKind;
  rule_version: typeof profileRuleVersion;
  committed_at: Date;
  affected_profile_count: number;
  character_id: string | null;
  character_revision: string | null;
  disclosure_revision: string | null;
  invitation_id: string | null;
  issued_at: Date | null;
  expires_at: Date | null;
}
type MutationInput =
  | UpdateMyProfileInput
  | IssueProfileInvitationInput
  | RevokeProfileInvitationInput
  | WithdrawProfileDisclosureInput;
type InternalMutationResponse = ProfileMutationResponse & {
  tokenDelivery: IssueProfileInvitationResponse['tokenDelivery'];
};
type OutwardSnapshot = { profile: CivilianProfileResponse; expiresAt: string | null };
const tokenPattern = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
function exact(value: unknown, keys: readonly string[]): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function valid(kind: ProfileOperationKind, input: MutationInput, operationId: string): boolean {
  if (typeof operationId !== 'string' || !profileUuidPattern.test(operationId)) return false;
  if (kind === 'profile.disclosure.withdraw')
    return exact(input, ['scope']) && 'scope' in input && input.scope === 'all-owned-profiles';
  const keys =
    kind === 'profile.update'
      ? [
          'characterId',
          'expectedRevision',
          'visibility',
          'showFictionalAvatar',
          'showRegistrationDate',
        ]
      : kind === 'profile.invitation.revoke'
        ? ['characterId', 'expectedRevision']
        : ['characterId', 'expectedRevision', 'scope', 'mode'];
  if (
    !exact(input, keys) ||
    !('characterId' in input) ||
    typeof input.characterId !== 'string' ||
    !profileUuidPattern.test(input.characterId) ||
    typeof input.expectedRevision !== 'string' ||
    !profileRevisionPattern.test(input.expectedRevision)
  )
    return false;
  if (kind === 'profile.update')
    return (
      'visibility' in input &&
      ['private', 'limited', 'public'].includes(input.visibility) &&
      typeof input.showFictionalAvatar === 'boolean' &&
      typeof input.showRegistrationDate === 'boolean'
    );
  if (kind === 'profile.invitation.revoke') return true;
  return (
    'scope' in input &&
    input.scope === 'profile.view' &&
    'mode' in input &&
    input.mode === (kind === 'profile.invitation.generate' ? 'generate' : 'replace')
  );
}
function digest(kind: ProfileOperationKind, input: MutationInput): Buffer {
  return createHash('sha256')
    .update(
      JSON.stringify([
        profileRuleVersion,
        kind,
        'characterId' in input ? input.characterId.toLowerCase() : null,
        'expectedRevision' in input ? input.expectedRevision : null,
        'visibility' in input ? input.visibility : null,
        'showFictionalAvatar' in input ? input.showFictionalAvatar : null,
        'showRegistrationDate' in input ? input.showRegistrationDate : null,
        'scope' in input ? input.scope : null,
        'mode' in input ? input.mode : null,
      ]),
    )
    .digest();
}
function projection(row: LockedProfileCharacter): CivilianProfileResponse {
  return {
    schemaVersion: 1,
    displayAlias: row.displayAlias,
    identityLabel: 'Civilian',
    ...(row.showFictionalAvatar ? { appearance: row.appearance } : {}),
    ...(row.showRegistrationDate
      ? { registrationDate: row.createdAt.toISOString().slice(0, 10) }
      : {}),
  };
}
function metadata(row: InvitationRow): IssuedInvitationMetadata {
  return {
    invitationId: row.id,
    scope: row.scope,
    issuedAt: row.issued_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  };
}
function receipt(row: ReceiptRow): ProfileOperationReceipt {
  const base = {
    operationId: row.operation_id,
    ruleVersion: row.rule_version,
    committedAt: row.committed_at.toISOString(),
  };
  if (row.operation === 'profile.disclosure.withdraw')
    return {
      ...base,
      operation: row.operation,
      subject: 'account',
      affectedProfileCount: row.affected_profile_count,
      character: null,
      invitation: null,
    };
  if (
    row.character_id === null ||
    row.character_revision === null ||
    row.disclosure_revision === null
  )
    throw new Error('Invalid character receipt');
  const character = {
    characterId: row.character_id,
    characterRevision: row.character_revision,
    disclosureRevision: row.disclosure_revision,
  };
  if (row.operation === 'profile.update' || row.operation === 'profile.invitation.revoke')
    return {
      ...base,
      operation: row.operation,
      subject: 'character',
      affectedProfileCount: 1,
      character,
      invitation: null,
    };
  if (row.invitation_id === null || row.issued_at === null || row.expires_at === null)
    throw new Error('Invalid invitation receipt');
  return {
    ...base,
    operation: row.operation,
    subject: 'character',
    affectedProfileCount: 1,
    character,
    invitation: {
      invitationId: row.invitation_id,
      scope: 'profile.view',
      issuedAt: row.issued_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
    },
  };
}
async function ownerSnapshot(
  client: PoolClient,
  authUserId: string,
  accountId: string | null,
): Promise<OwnerProfileResponse> {
  const account = (
    await client.query<{
      access_state: 'active' | 'restricted';
      character_creation_not_before: Date | null;
    }>('SELECT access_state,character_creation_not_before FROM game.accounts WHERE id=$1::uuid', [
      accountId,
    ])
  ).rows[0];
  const rows = (
    await client.query<LockedProfileCharacter>(
      `SELECT ${profileCharacterColumns} FROM game.characters WHERE account_id=$1::uuid ORDER BY id`,
      [accountId],
    )
  ).rows;
  const living = rows.find((row) => row.lifeState !== 'dead');
  const gate =
    (
      await client.query<{ profile_disclosure: boolean }>(
        'SELECT profile_disclosure FROM ops.feature_controls WHERE singleton',
      )
    ).rows[0]?.profile_disclosure === true;
  const pilot =
    (
      await client.query<{ enabled: boolean }>(
        'SELECT enabled FROM ops.character_pilot_access WHERE auth_user_id=$1::uuid',
        [authUserId],
      )
    ).rows[0]?.enabled === true;
  const supported = living?.awakeningState === 'unawakened';
  const ordinary = account?.access_state === 'active' && living?.lifeState === 'alive';
  const controls = {
    canUpdate: !!(ordinary && supported && gate && pilot),
    canIssue: !!(ordinary && supported && gate && pilot && living.visibility !== 'private'),
    canRevoke: !!ordinary,
    canWithdraw: rows.length > 0,
    sharingAvailable: !!(supported && gate && pilot),
  };
  const mode =
    account?.access_state === 'restricted'
      ? 'restricted'
      : living
        ? living.lifeState === 'alive'
          ? 'active'
          : 'incapacitated'
        : rows.length || account?.character_creation_not_before
          ? 'observer'
          : 'onboarding';
  if (!living)
    return {
      schemaVersion: 1,
      ruleVersion: profileRuleVersion,
      mode,
      status: 'no_living_profile',
      profile: null,
      controls,
    };
  if (!supported)
    return {
      schemaVersion: 1,
      ruleVersion: profileRuleVersion,
      mode,
      status: 'unsupported_official_id',
      profile: null,
      controls,
    };
  const invitation = (
    await client.query<InvitationRow>(
      'SELECT id,scope,issued_at,expires_at,revoked_at,disclosure_revision::text FROM game.profile_invitations WHERE character_id=$1::uuid ORDER BY issued_at DESC,id DESC LIMIT 1',
      [living.characterId],
    )
  ).rows[0];
  const unexpired = invitation
    ? (
        await client.query<{ unexpired: boolean }>(
          'SELECT expires_at > clock_timestamp() AS unexpired FROM game.profile_invitations WHERE id=$1::uuid',
          [invitation.id],
        )
      ).rows[0]?.unexpired === true
    : false;
  const policy = {
    showFictionalAvatar: living.showFictionalAvatar,
    showRegistrationDate: living.showRegistrationDate,
    characterId: living.characterId,
    characterRevision: living.characterRevision,
    disclosureRevision: living.disclosureRevision,
    preview: projection(living),
    invitation: invitation
      ? {
          ...metadata(invitation),
          status: invitation.revoked_at
            ? ('revoked' as const)
            : unexpired
              ? ('valid' as const)
              : ('expired' as const),
        }
      : null,
  };
  return {
    schemaVersion: 1,
    ruleVersion: profileRuleVersion,
    mode,
    status: 'available',
    profile:
      living.visibility === 'public'
        ? { ...policy, visibility: 'public', publicReference: living.publicReference }
        : { ...policy, visibility: living.visibility, publicReference: null },
    controls,
  };
}
async function lookupReceipt(
  client: PoolClient,
  accountId: string,
  operationId: string,
): Promise<ReceiptRow | undefined> {
  return (
    await client.query<ReceiptRow>(
      'SELECT operation_id,request_digest,operation,rule_version,committed_at,affected_profile_count,character_id,character_revision::text,disclosure_revision::text,invitation_id,issued_at,expires_at FROM game.profile_operation_receipts WHERE account_id=$1::uuid AND operation_id=$2::uuid',
      [accountId, operationId],
    )
  ).rows[0];
}

export function createProfileStore(pool: Pool): ProfileStore {
  async function response(
    client: PoolClient,
    authUserId: string,
    accountId: string,
    row: ReceiptRow,
    replayed: boolean,
    token?: string,
  ): Promise<ProfileStoreResult<InternalMutationResponse>> {
    return {
      kind: 'success',
      value: {
        schemaVersion: 1,
        receipt: receipt(row),
        replayed,
        current: await ownerSnapshot(client, authUserId, accountId),
        tokenDelivery: token ? { status: 'delivered', token } : { status: 'unavailable' },
      },
    };
  }
  async function mutate(
    authUserId: string,
    input: MutationInput,
    operationId: string,
    kind: ProfileOperationKind,
  ): Promise<ProfileStoreResult<InternalMutationResponse>> {
    if (!valid(kind, input, operationId)) return { kind: 'invalid_request' };
    const requestDigest = digest(kind, input);
    // End the read transaction completely before attempting write authority.
    const preflight = await withTransaction(pool, async (client) => {
      const locked = await lockProfileActor(client, authUserId, {
        accountLock: 'share',
        sharingGate: 'none',
        pilotGrant: 'none',
      });
      if (locked.kind === 'denied')
        return { kind: locked.reason } as ProfileStoreResult<InternalMutationResponse>;
      const row = await lookupReceipt(client, locked.actor.accountId, operationId);
      if (!row) return null;
      if (!row.request_digest.equals(requestDigest)) return { kind: 'operation_conflict' } as const;
      return response(client, authUserId, locked.actor.accountId, row, true);
    });
    if (preflight) return preflight;
    return withTransaction(pool, async (client) => {
      const sharing =
        kind === 'profile.update' ||
        kind === 'profile.invitation.generate' ||
        kind === 'profile.invitation.replace';
      const locked = await lockProfileActor(client, authUserId, {
        accountLock: 'update',
        sharingGate: sharing ? 'share' : 'none',
        pilotGrant: sharing ? 'share' : 'none',
      });
      if (locked.kind === 'denied') return { kind: locked.reason };
      const actor = locked.actor;
      const oldReceipt = await lookupReceipt(client, actor.accountId, operationId);
      if (oldReceipt)
        return oldReceipt.request_digest.equals(requestDigest)
          ? response(client, authUserId, actor.accountId, oldReceipt, true)
          : { kind: 'operation_conflict' };
      const action = await authorizeLockedProfileAction(
        client,
        actor,
        kind === 'profile.disclosure.withdraw'
          ? { operation: 'account.disclosure.withdraw' }
          : {
              operation:
                kind === 'profile.update'
                  ? 'character.profile.update'
                  : kind === 'profile.invitation.revoke'
                    ? 'character.profile.invitation.revoke'
                    : 'character.profile.invitation.issue',
              characterId: (input as RevokeProfileInvitationInput).characterId,
              expectedRevision: (input as RevokeProfileInvitationInput).expectedRevision,
            },
      );
      if (action.kind === 'denied') return { kind: action.reason };
      const characters =
        action.subject.kind === 'account' ? action.subject.characters : [action.subject.character];
      const invitations = (
        await client.query<InvitationRow>(
          'SELECT id,scope,issued_at,expires_at,revoked_at,disclosure_revision::text FROM game.profile_invitations WHERE character_id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [characters.map((c) => c.characterId)],
        )
      ).rows;
      let token: string | undefined;
      let issued: InvitationRow | undefined;
      if (kind === 'profile.invitation.generate' || kind === 'profile.invitation.replace') {
        const previous = invitations.find((row) => !row.revoked_at);
        const unexpired = previous
          ? (
              await client.query<{ unexpired: boolean }>(
                'SELECT expires_at > clock_timestamp() AS unexpired FROM game.profile_invitations WHERE id=$1::uuid',
                [previous.id],
              )
            ).rows[0]?.unexpired === true
          : false;
        if (kind === 'profile.invitation.generate' && previous && unexpired)
          return { kind: 'invitation_exists' };
        if (kind === 'profile.invitation.replace' && !previous)
          return { kind: 'invitation_missing' };
        token = randomBytes(32).toString('base64url');
      }
      await client.query(
        'UPDATE game.profile_invitations SET revoked_at=clock_timestamp() WHERE character_id=ANY($1::uuid[]) AND revoked_at IS NULL',
        [characters.map((c) => c.characterId)],
      );
      const changed: LockedProfileCharacter[] = [];
      for (const character of characters) {
        const update = kind === 'profile.update' ? (input as UpdateMyProfileInput) : null;
        const withdrawal = kind === 'profile.disclosure.withdraw';
        const rotate =
          withdrawal ||
          kind === 'profile.invitation.revoke' ||
          (update !== null && update.visibility !== character.visibility);
        changed.push(
          (
            await client.query<LockedProfileCharacter>(
              `UPDATE game.characters SET revision=revision+1,disclosure_revision=disclosure_revision+1,
          profile_visibility=$2,show_fictional_avatar=$3,show_registration_date=$4,public_reference=CASE WHEN $5 THEN gen_random_uuid() ELSE public_reference END
          WHERE id=$1::uuid RETURNING ${profileCharacterColumns}`,
              [
                character.characterId,
                withdrawal ? 'private' : (update?.visibility ?? character.visibility),
                withdrawal ? false : (update?.showFictionalAvatar ?? character.showFictionalAvatar),
                withdrawal
                  ? false
                  : (update?.showRegistrationDate ?? character.showRegistrationDate),
                rotate,
              ],
            )
          ).rows[0]!,
        );
      }
      if (token) {
        issued = (
          await client.query<InvitationRow>(
            `INSERT INTO game.profile_invitations(account_id,character_id,scope,token_digest,disclosure_revision,issued_at,expires_at,operation_id,rule_version)
          SELECT $1::uuid,$2::uuid,'profile.view',$3,$4::bigint,t,t+interval '10 minutes',$5::uuid,$6 FROM (SELECT clock_timestamp() AS t) AS issuance
          RETURNING id,scope,issued_at,expires_at,revoked_at,disclosure_revision::text`,
            [
              actor.accountId,
              changed[0]!.characterId,
              createHash('sha256').update(token).digest(),
              changed[0]!.disclosureRevision,
              operationId,
              profileRuleVersion,
            ],
          )
        ).rows[0]!;
      }
      const subject = kind === 'profile.disclosure.withdraw' ? null : changed[0]!;
      await client.query(
        `INSERT INTO game.profile_operation_receipts(account_id,operation_id,request_digest,operation,character_id,rule_version,affected_profile_count,character_revision,disclosure_revision,invitation_id,issued_at,expires_at)
        SELECT $1::uuid,$2::uuid,$3,$4,$5::uuid,$6,$7,$8::bigint,$9::bigint,$10::uuid,i.issued_at,i.expires_at
        FROM (SELECT 1) AS singleton LEFT JOIN game.profile_invitations i ON i.id=$10::uuid`,
        [
          actor.accountId,
          operationId,
          requestDigest,
          kind,
          subject?.characterId ?? null,
          profileRuleVersion,
          changed.length,
          subject?.characterRevision ?? null,
          subject?.disclosureRevision ?? null,
          issued?.id ?? null,
        ],
      );
      return response(
        client,
        authUserId,
        actor.accountId,
        (await lookupReceipt(client, actor.accountId, operationId))!,
        false,
        token,
      );
    });
  }
  async function outward(
    authUserId: string,
    reference: string | null,
    token: string | null,
  ): Promise<ProfileStoreResult<OutwardSnapshot>> {
    if (typeof authUserId !== 'string' || !profileUuidPattern.test(authUserId))
      return { kind: 'auth_ineligible' };
    return withTransaction(pool, async (client) => {
      const candidate = (
        await client.query<{
          character_id: string;
          account_id: string;
          auth_user_id: string | null;
          invitation_id: string | null;
        }>(
          token
            ? `SELECT c.id AS character_id,c.account_id,a.auth_user_id,i.id AS invitation_id FROM game.profile_invitations i JOIN game.characters c ON c.id=i.character_id JOIN game.accounts a ON a.id=c.account_id WHERE i.token_digest=$1`
            : `SELECT c.id AS character_id,c.account_id,a.auth_user_id,NULL::uuid AS invitation_id FROM game.characters c JOIN game.accounts a ON a.id=c.account_id WHERE c.public_reference=$1::uuid`,
          [token ? createHash('sha256').update(token).digest() : reference],
        )
      ).rows[0];
      const identities = [
        ...new Set([
          authUserId.toLowerCase(),
          ...(candidate?.auth_user_id ? [candidate.auth_user_id] : []),
        ]),
      ].sort();
      for (const identity of identities)
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended('operator-account:' || $1::uuid::text,0))",
          [identity],
        );
      const gate =
        (
          await client.query<{ profile_disclosure: boolean }>(
            'SELECT profile_disclosure FROM ops.feature_controls WHERE singleton FOR SHARE',
          )
        ).rows[0]?.profile_disclosure === true;
      const operators = new Set(
        (
          await client.query<{ auth_user_id: string }>(
            'SELECT auth_user_id FROM ops.operator_accounts WHERE auth_user_id=ANY($1::uuid[])',
            [identities],
          )
        ).rows.map((row) => row.auth_user_id),
      );
      const eligible = new Map<string, boolean>();
      for (const identity of identities)
        eligible.set(
          identity,
          (
            await client.query<{ eligible: boolean }>(
              'SELECT game.lock_eligible_auth_user($1::uuid) AS eligible',
              [identity],
            )
          ).rows[0]?.eligible === true,
        );
      const accounts = (
        await client.query<{ id: string; auth_user_id: string }>(
          'SELECT id,auth_user_id FROM game.accounts WHERE auth_user_id=ANY($1::uuid[]) ORDER BY id FOR SHARE',
          [identities],
        )
      ).rows;
      if (operators.has(authUserId.toLowerCase())) return { kind: 'operator_only' };
      if (!eligible.get(authUserId.toLowerCase())) return { kind: 'auth_ineligible' };
      if (
        !candidate ||
        !candidate.auth_user_id ||
        !gate ||
        operators.has(candidate.auth_user_id) ||
        !eligible.get(candidate.auth_user_id) ||
        !accounts.some(
          (a) => a.id === candidate.account_id && a.auth_user_id === candidate.auth_user_id,
        )
      )
        return { kind: 'profile_unavailable' };
      const character = (
        await client.query<LockedProfileCharacter>(
          `SELECT ${profileCharacterColumns} FROM game.characters WHERE id=$1::uuid FOR SHARE`,
          [candidate.character_id],
        )
      ).rows[0];
      if (
        !character ||
        character.accountId !== candidate.account_id ||
        character.lifeState === 'dead' ||
        character.awakeningState !== 'unawakened' ||
        character.visibility === 'private'
      )
        return { kind: 'profile_unavailable' };
      if (!token) {
        if (
          character.visibility !== 'public' ||
          character.publicReference !== reference?.toLowerCase()
        )
          return { kind: 'profile_unavailable' };
        return {
          kind: 'success',
          value: {
            profile: projection(character),
            expiresAt: null,
          },
        };
      }
      const invitation = (
        await client.query<InvitationRow>(
          'SELECT id,scope,issued_at,expires_at,revoked_at,disclosure_revision::text FROM game.profile_invitations WHERE id=$1::uuid AND character_id=$2::uuid AND account_id=$3::uuid AND token_digest=$4 FOR SHARE',
          [
            candidate.invitation_id,
            character.characterId,
            character.accountId,
            createHash('sha256').update(token).digest(),
          ],
        )
      ).rows[0];
      const unexpired = invitation
        ? (
            await client.query<{ unexpired: boolean }>(
              'SELECT expires_at > clock_timestamp() AS unexpired FROM game.profile_invitations WHERE id=$1::uuid',
              [invitation.id],
            )
          ).rows[0]?.unexpired === true
        : false;
      if (
        !invitation ||
        invitation.scope !== 'profile.view' ||
        invitation.revoked_at ||
        !unexpired ||
        invitation.disclosure_revision !== character.disclosureRevision
      )
        return { kind: 'profile_unavailable' };
      return {
        kind: 'success',
        value: {
          profile: projection(character),
          expiresAt: invitation.expires_at.toISOString(),
        },
      };
    });
  }
  function strip(
    result: ProfileStoreResult<InternalMutationResponse>,
  ): ProfileStoreResult<ProfileMutationResponse> {
    if (result.kind !== 'success') return result;
    const { schemaVersion, receipt, replayed, current } = result.value;
    return { kind: 'success', value: { schemaVersion, receipt, replayed, current } };
  }
  return {
    async getOwner(authUserId) {
      return withTransaction(pool, async (client) => {
        const authority = await authorizeCharacterOperation(client, {
          authUserId,
          operation: 'account.records.read',
        });
        if (authority.kind === 'denied')
          return {
            kind: authority.reason === 'operator_only' ? 'operator_only' : 'auth_ineligible',
          };
        return {
          kind: 'success',
          value: await ownerSnapshot(client, authUserId, authority.accountId),
        };
      });
    },
    async update(authUserId, input, operationId) {
      return strip(await mutate(authUserId, input, operationId, 'profile.update'));
    },
    async issue(authUserId, input, operationId) {
      const result = await mutate(
        authUserId,
        input,
        operationId,
        input?.mode === 'replace' ? 'profile.invitation.replace' : 'profile.invitation.generate',
      );
      if (result.kind !== 'success') return result;
      const row = result.value.receipt;
      if (
        (row.operation !== 'profile.invitation.generate' &&
          row.operation !== 'profile.invitation.replace') ||
        row.invitation === null ||
        row.character === null
      )
        throw new Error('Invalid issuance receipt');
      const issueReceipt = {
        ...row,
        operation: row.operation,
        subject: 'character' as const,
        affectedProfileCount: 1 as const,
        character: row.character,
        invitation: row.invitation,
      };
      if (result.value.tokenDelivery.status === 'delivered') {
        if (result.value.replayed) throw new Error('Replay cannot deliver invitation');
        return {
          kind: 'success',
          value: {
            ...result.value,
            receipt: issueReceipt,
            replayed: false,
            tokenDelivery: result.value.tokenDelivery,
          },
        };
      }
      return {
        kind: 'success',
        value: { ...result.value, receipt: issueReceipt, tokenDelivery: { status: 'unavailable' } },
      };
    },
    async revoke(authUserId, input, operationId) {
      return strip(await mutate(authUserId, input, operationId, 'profile.invitation.revoke'));
    },
    async withdraw(authUserId, input, operationId) {
      return strip(await mutate(authUserId, input, operationId, 'profile.disclosure.withdraw'));
    },
    async getPublic(authUserId, publicReference) {
      if (typeof publicReference !== 'string' || !profileUuidPattern.test(publicReference))
        return { kind: 'invalid_request' };
      const result = await outward(authUserId, publicReference.toLowerCase(), null);
      return result.kind === 'success' ? { kind: 'success', value: result.value.profile } : result;
    },
    async resolve(authUserId, input) {
      if (
        !exact(input, ['token']) ||
        typeof input.token !== 'string' ||
        !tokenPattern.test(input.token)
      )
        return { kind: 'invalid_request' };
      const result = await outward(authUserId, null, input.token);
      if (result.kind !== 'success') return result;
      if (result.value.expiresAt === null) throw new Error('Missing invitation expiry');
      return {
        kind: 'success',
        value: {
          schemaVersion: 1,
          profile: result.value.profile,
          invitation: { scope: 'profile.view', expiresAt: result.value.expiresAt },
        },
      };
    },
  };
}
