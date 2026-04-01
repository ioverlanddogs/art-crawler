import cron from 'node-cron';
import { discoveryQueue } from './queues.js';

export function startScheduler() {
  cron.schedule('*/5 * * * *', async () => {
    // TODO(layer7): Wire Thompson-sampling source prioritisation into this scheduler once discovery orchestration is implemented.
    await discoveryQueue.add('discovery-seed', {});
  });
}
