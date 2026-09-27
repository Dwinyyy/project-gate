import type { Pool } from 'pg';

export interface OperatorAccess {
  authUserId: string;
  permissions: string[];
}

export interface OperatorAccessStore {
  findActiveOperator(authUserId: string): Promise<OperatorAccess | null>;
  findOperatorStatus(authUserId: string): Promise<'active' | 'suspended' | null>;
}

export async function findOperatorStatus(
  pool: Pool,
  authUserId: string,
): Promise<'active' | 'suspended' | null> {
  const result = await pool.query<{ status: 'active' | 'suspended' }>(
    'SELECT status FROM ops.operator_accounts WHERE auth_user_id = $1',
    [authUserId],
  );
  return result.rows[0]?.status ?? null;
}

interface OperatorAccessRow {
  auth_user_id: string;
  permissions: string[];
}

export async function findActiveOperator(
  pool: Pool,
  authUserId: string,
): Promise<OperatorAccess | null> {
  const result = await pool.query<OperatorAccessRow>(
    `SELECT account.auth_user_id,
       coalesce(
         array_agg(permission.permission ORDER BY permission.permission)
           FILTER (WHERE permission.permission IS NOT NULL),
         ARRAY[]::text[]
       ) AS permissions
     FROM ops.operator_accounts account
     LEFT JOIN ops.operator_permissions permission USING (auth_user_id)
     WHERE account.auth_user_id = $1 AND account.status = 'active'
     GROUP BY account.auth_user_id`,
    [authUserId],
  );
  const row = result.rows[0];
  return row ? { authUserId: row.auth_user_id, permissions: row.permissions } : null;
}

export function createOperatorAccessStore(pool: Pool): OperatorAccessStore {
  return {
    findActiveOperator: (authUserId) => findActiveOperator(pool, authUserId),
    findOperatorStatus: (authUserId) => findOperatorStatus(pool, authUserId),
  };
}
