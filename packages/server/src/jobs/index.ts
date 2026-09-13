import { PgBoss } from 'pg-boss';
import type { Pool, PoolClient } from 'pg';
import type { Database } from '../../../database/src/index.js';
import { withTransaction } from '@hunter-world/database';

export const DEMO_QUEUE = 'foundation-demo';
export function createJobQueue(pool: Pool): PgBoss {
  return new PgBoss({
    schema: 'ops',
    migrate: false,
    createSchema: false,
    schedule: false,
    supervise: true,
    reindex: false,
    persistQueueStats: false,
    persistWarnings: false,
    superviseIntervalSeconds: 1,
    db: { executeSql: (text, values) => pool.query(text, values) },
  });
}
export async function recordDemoRequested(
  client: PoolClient,
  request: { eventKey: string; label: string },
): Promise<string> {
  if (
    !request.eventKey ||
    request.eventKey.length > 160 ||
    !request.label ||
    request.label.length > 120
  )
    throw new Error('Invalid demo request');
  await client.query(
    "INSERT INTO ops.outbox_events(event_key, topic, schema_version, payload) VALUES ($1, 'foundation.demo.requested', 1, $2) ON CONFLICT(event_key) DO NOTHING",
    [request.eventKey, JSON.stringify({ label: request.label })],
  );
  const result = await client.query<{ id: string; payload: { label: string } }>(
    'SELECT id, payload FROM ops.outbox_events WHERE event_key = $1',
    [request.eventKey],
  );
  const event = result.rows[0];
  if (!event || event.payload.label !== request.label)
    throw new Error('Event key was used with different terms');
  return event.id;
}
export async function consumeDemoEvent(pool: Pool, eventId: string): Promise<boolean> {
  return withTransaction(pool, async (client) => {
    const receipt = await client.query(
      "INSERT INTO ops.consumer_receipts(consumer_name, event_id) VALUES ('foundation-demo-v1', $1) ON CONFLICT DO NOTHING RETURNING event_id",
      [eventId],
    );
    if (!receipt.rowCount) return false;
    const result = await client.query(
      "INSERT INTO ops.demo_effects(event_id, event_key, label) SELECT id, event_key, payload->>'label' FROM ops.outbox_events WHERE id = $1 AND topic = 'foundation.demo.requested' AND schema_version = 1 RETURNING event_id",
      [eventId],
    );
    if (result.rowCount !== 1) throw new Error('Unsupported demo event');
    return true;
  });
}
export async function dispatchOutbox(pool: Pool, boss: PgBoss): Promise<number> {
  return withTransaction(pool, async (client) => {
    const events = await client.query<{ id: string }>(
      'SELECT id FROM ops.outbox_events WHERE published_at IS NULL ORDER BY created_at, id LIMIT 50 FOR UPDATE SKIP LOCKED',
    );
    for (const event of events.rows) {
      await boss.send(
        DEMO_QUEUE,
        { eventId: event.id },
        { id: event.id, db: { executeSql: (text, values) => client.query(text, values) } },
      );
      await client.query('UPDATE ops.outbox_events SET published_at = now() WHERE id = $1', [
        event.id,
      ]);
    }
    return events.rowCount ?? 0;
  });
}
export function createWorker(database: Database) {
  const boss = createJobQueue(database.pool);
  boss.on('error', () => console.error('Worker queue error; consult database health.'));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let active: Promise<void> = Promise.resolve();
  const tick = () => {
    active = dispatchOutbox(database.pool, boss)
      .then(() => undefined)
      .catch(() => {
        console.error('Outbox dispatch failed; retrying without changing event identity.');
      })
      .finally(() => {
        if (!stopped) timer = setTimeout(tick, 1000);
      });
  };
  return {
    async start(): Promise<void> {
      if (!(await database.ready())) throw new Error('Worker database is not ready');
      await boss.start();
      await boss.work<{ eventId: string }>(
        DEMO_QUEUE,
        { pollingIntervalSeconds: 0.5 },
        async (jobs) => {
          for (const job of jobs) await consumeDemoEvent(database.pool, job.data.eventId);
        },
      );
      tick();
    },
    async stop(): Promise<void> {
      stopped = true;
      clearTimeout(timer);
      await active;
      await boss.stop({ graceful: true, timeout: 5000 });
    },
  };
}
