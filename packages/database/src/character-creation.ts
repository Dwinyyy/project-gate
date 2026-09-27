import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { withTransaction } from './index.js';

export type CreationStatus = 'available' | 'occupied' | 'cooldown' | 'feature_disabled';

export type MeResult =
  | { kind: 'operator_only' | 'auth_ineligible' }
  | {
      kind: 'player';
      schemaVersion: 1;
      character: {
        id: string;
        displayAlias: string;
        lifeState: 'alive' | 'incapacitated';
        awakeningState: 'unawakened' | 'awakened';
        presenceState: 'sheltered' | 'active' | 'committed';
        profileVisibility: 'private' | 'limited' | 'public';
        createdAt: string;
      } | null;
      creation: { status: CreationStatus; notBefore: string | null };
    };

export type CreateCharacterResult =
  | {
      kind: 'created';
      characterId: string;
      operationId: string;
      createdAt: string;
      replayed: boolean;
    }
  | { kind: 'operator_only' | 'auth_ineligible' | 'disabled' | 'occupied' | 'operation_conflict' }
  | { kind: 'cooldown'; notBefore: string };

export interface CharacterStore {
  getMe(authUserId: string): Promise<MeResult>;
  create(
    authUserId: string,
    displayAlias: string,
    operationId: string,
  ): Promise<CreateCharacterResult>;
}

interface AccountRow {
  id: string;
  character_creation_not_before: Date | null;
}

interface CharacterRow {
  id: string;
  display_alias: string;
  life_state: 'alive' | 'incapacitated';
  awakening_state: 'unawakened' | 'awakened';
  presence_state: 'sheltered' | 'active' | 'committed';
  profile_visibility: 'private' | 'limited' | 'public';
  created_at: Date;
}

interface ReceiptRow {
  character_id: string;
  request_fingerprint: Buffer;
  created_at: Date;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

async function hasOperatorRow(client: PoolClient, authUserId: string): Promise<boolean> {
  const result = await client.query(
    'SELECT 1 FROM ops.operator_accounts WHERE auth_user_id = $1::uuid',
    [authUserId],
  );
  return (result.rowCount ?? 0) > 0;
}

async function eligibleAuthUser(client: PoolClient, authUserId: string): Promise<boolean> {
  const result = await client.query<{ eligible: boolean }>(
    'SELECT game.lock_eligible_auth_user($1::uuid) AS eligible',
    [authUserId],
  );
  return result.rows[0]?.eligible === true;
}

async function livingCharacter(
  client: PoolClient,
  accountId: string,
): Promise<CharacterRow | null> {
  const result = await client.query<CharacterRow>(
    `SELECT id, display_alias, life_state, awakening_state, presence_state,
            profile_visibility, created_at
       FROM game.characters
      WHERE account_id = $1::uuid AND life_state IN ('alive', 'incapacitated')`,
    [accountId],
  );
  return result.rows[0] ?? null;
}

export function createCharacterStore(pool: Pool): CharacterStore {
  return {
    async getMe(authUserId) {
      if (!isUuid(authUserId)) return { kind: 'auth_ineligible' };
      return withTransaction(pool, async (client) => {
        if (await hasOperatorRow(client, authUserId)) return { kind: 'operator_only' };
        if (!(await eligibleAuthUser(client, authUserId))) return { kind: 'auth_ineligible' };
        const controls = await client.query<{ characters: boolean }>(
          'SELECT characters FROM ops.feature_controls WHERE singleton',
        );
        if (!controls.rows[0]) throw new Error('Feature controls are missing');
        const account = await client.query<AccountRow>(
          'SELECT id, character_creation_not_before FROM game.accounts WHERE auth_user_id = $1::uuid',
          [authUserId],
        );
        const row = account.rows[0];
        const living = row ? await livingCharacter(client, row.id) : null;
        const now = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
        const notBefore = row?.character_creation_not_before ?? null;
        const status: CreationStatus = !controls.rows[0].characters
          ? 'feature_disabled'
          : living
            ? 'occupied'
            : notBefore && notBefore > now.rows[0]!.now
              ? 'cooldown'
              : 'available';
        return {
          kind: 'player',
          schemaVersion: 1,
          character: living
            ? {
                id: living.id,
                displayAlias: living.display_alias,
                lifeState: living.life_state,
                awakeningState: living.awakening_state,
                presenceState: living.presence_state,
                profileVisibility: living.profile_visibility,
                createdAt: living.created_at.toISOString(),
              }
            : null,
          creation: { status, notBefore: status === 'cooldown' ? notBefore!.toISOString() : null },
        };
      });
    },
    async create(authUserId, displayAlias, operationId) {
      if (!isUuid(authUserId)) return { kind: 'auth_ineligible' };
      if (!isUuid(operationId)) return { kind: 'operation_conflict' };
      if (displayAlias.length < 1 || displayAlias.length > 40 || !/\S/u.test(displayAlias)) {
        return { kind: 'operation_conflict' };
      }
      const fingerprint = createHash('sha256').update(displayAlias, 'utf8').digest();
      try {
        return await withTransaction(pool, async (client): Promise<CreateCharacterResult> => {
          // Match the audited assignment routine's canonical UUID-text lock key.
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended('operator-account:' || $1::uuid::text, 0))",
            [authUserId],
          );
          if (await hasOperatorRow(client, authUserId)) return { kind: 'operator_only' };
          const controls = await client.query<{ characters: boolean }>(
            'SELECT characters FROM ops.feature_controls WHERE singleton FOR SHARE',
          );
          if (!controls.rows[0]) throw new Error('Feature controls are missing');
          if (!(await eligibleAuthUser(client, authUserId))) return { kind: 'auth_ineligible' };
          let account = await client.query<AccountRow>(
            'SELECT id, character_creation_not_before FROM game.accounts WHERE auth_user_id = $1::uuid',
            [authUserId],
          );
          if (!account.rows[0]) {
            if (!controls.rows[0].characters) return { kind: 'disabled' };
            await client.query(
              'INSERT INTO game.accounts(auth_user_id) VALUES ($1::uuid) ON CONFLICT (auth_user_id) DO NOTHING',
              [authUserId],
            );
          }
          account = await client.query<AccountRow>(
            'SELECT id, character_creation_not_before FROM game.accounts WHERE auth_user_id = $1::uuid FOR UPDATE',
            [authUserId],
          );
          const accountRow = account.rows[0];
          if (!accountRow) throw new Error('Account link was not resolved');
          const receipt = await client.query<ReceiptRow>(
            'SELECT character_id, request_fingerprint, created_at FROM game.character_creation_receipts WHERE account_id = $1::uuid AND operation_id = $2::uuid',
            [accountRow.id, operationId],
          );
          if (receipt.rows[0]) {
            if (!receipt.rows[0].request_fingerprint.equals(fingerprint))
              return { kind: 'operation_conflict' };
            return {
              kind: 'created',
              characterId: receipt.rows[0].character_id,
              operationId,
              createdAt: receipt.rows[0].created_at.toISOString(),
              replayed: true,
            };
          }
          if (!controls.rows[0].characters) return { kind: 'disabled' };
          const wallTime = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
          if (
            accountRow.character_creation_not_before &&
            accountRow.character_creation_not_before > wallTime.rows[0]!.now
          ) {
            return {
              kind: 'cooldown',
              notBefore: accountRow.character_creation_not_before.toISOString(),
            };
          }
          if (await livingCharacter(client, accountRow.id)) return { kind: 'occupied' };
          const character = await client.query<{ id: string }>(
            'INSERT INTO game.characters(account_id, display_alias) VALUES ($1::uuid, $2) RETURNING id',
            [accountRow.id, displayAlias],
          );
          const inserted = await client.query<ReceiptRow>(
            `INSERT INTO game.character_creation_receipts(account_id, operation_id, request_fingerprint, character_id)
             VALUES ($1::uuid, $2::uuid, $3, $4::uuid)
             RETURNING character_id, request_fingerprint, created_at`,
            [accountRow.id, operationId, fingerprint, character.rows[0]!.id],
          );
          return {
            kind: 'created',
            characterId: character.rows[0]!.id,
            operationId,
            createdAt: inserted.rows[0]!.created_at.toISOString(),
            replayed: false,
          };
        });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === '23505'
        ) {
          return { kind: 'occupied' };
        }
        throw error;
      }
    },
  };
}
