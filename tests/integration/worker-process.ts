import { createDatabase } from '../../packages/database/src/index.js';
import {
  consumeDemoEvent,
  createJobQueue,
  createWorker,
  DEMO_QUEUE,
} from '../../packages/server/src/jobs/index.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString || process.env.NODE_ENV !== 'test') throw new Error('Test fixture only.');
const database = createDatabase({ connectionString });
if (process.env.WORKER_TEST_MODE === 'commit-without-ack') {
  const boss = createJobQueue(database.pool);
  boss.on('error', () => undefined);
  await boss.start();
  await boss.work<{ eventId: string }>(
    DEMO_QUEUE,
    { pollingIntervalSeconds: 0.5 },
    async (jobs) => {
      for (const job of jobs) await consumeDemoEvent(database.pool, job.data.eventId);
      process.send?.('effect-committed');
      // Deliberately stop before pg-boss acknowledges the successful business commit.
      await new Promise<void>(() => undefined);
    },
  );
} else {
  const worker = createWorker(database);
  await worker.start();
  process.send?.('ready');
}
