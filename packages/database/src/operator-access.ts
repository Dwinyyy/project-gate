import type { Pool } from 'pg';

export interface OperatorAccess {
  authUserId: string;
  permissions: string[];
}

export interface OperatorAccessStore {
  findActiveOperator(authUserId: string): Promise<OperatorAccess | null>;
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
  return { findActiveOperator: (authUserId) => findActiveOperator(pool, authUserId) };
}
