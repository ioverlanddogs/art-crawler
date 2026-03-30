import cron from 'node-cron';
import { discoveryQueue } from './queues.js';

export function startScheduler() {
  cron.schedule('*/5 * * * *', async () => {
    await discoveryQueue.add('discovery-seed', {});
  });
}
