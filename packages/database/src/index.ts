import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
export {
  createProfileStore,
  type ProfileStore,
  type ProfileStoreResult,
  type ProfileFailureKind,
} from './profile-disclosure.js';
export {
  lockProfileActor,
  authorizeLockedProfileAction,
  type ProfileOperation,
  type ProfileActionInput,
  type ProfileActorLockOptions,
  type LockedProfileActor,
  type LockedProfileActorResult,
  type LockedProfileCharacter,
  type ProfileAuthorityResult,
} from './profile-authority.js';

export {
  authorizeCharacterOperation,
  type CharacterAuthorityInput,
  type CharacterAuthorityResult,
  type CharacterOperation,
} from './character-authority.js';

export {
  createCharacterStore,
  type CharacterStore,
  type CreateCharacterResult,
  type MeResult,
} from './character-creation.js';

export {
  createOperatorAccessStore,
  findActiveOperator,
  findOperatorStatus,
  type OperatorAccess,
  type OperatorAccessStore,
} from './operator-access.js';

export interface DatabaseOptions {
  connectionString: string;
  ssl?: PoolConfig['ssl'];
}

export function createDatabase(options: DatabaseOptions) {
  const pool = new Pool({ ...options, max: 8, connectionTimeoutMillis: 5_000 });
  return {
    pool,
    drizzle: drizzle({ client: pool }),
    async ready(): Promise<boolean> {
      try {
        const result = await pool.query<{ safe: boolean }>(
          "SELECT current_user = 'hunter_runtime' AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname = current_user",
        );
        if (!result.rows[0]?.safe) return false;
        await getFeatureControls(pool);
        return true;
      } catch {
        return false;
      }
    },
    close: () => pool.end(),
  };
}
export type Database = ReturnType<typeof createDatabase>;

export interface FeatureControls {
  registration: boolean;
  characters: boolean;
  encounters: boolean;
  commerce: boolean;
}
export async function getFeatureControls(pool: Pool): Promise<FeatureControls> {
  const result = await pool.query<FeatureControls>(
    'SELECT registration, characters, encounters, commerce FROM ops.feature_controls WHERE singleton',
  );
  if (!result.rows[0]) throw new Error('Feature controls are missing');
  return result.rows[0];
}
export async function withTransaction<T>(
  pool: Pool,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '15s'");
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
