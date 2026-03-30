import { runDiscovery } from './workers/discovery.js';
import { runFetch } from './workers/fetch.js';
import { runExtract } from './workers/extract.js';
import { runNormalise } from './workers/normalise.js';
import { runScore } from './workers/score.js';
import { runDeduplicate } from './workers/deduplicate.js';
import { runEnrich } from './workers/enrich.js';
import { runMature } from './workers/mature.js';
import { runExport } from './workers/export.js';
import { startScheduler } from './scheduler.js';

export async function runVerticalSlice() {
  const candidate = await runDiscovery();
  await runFetch(candidate.id);
  await runExtract(candidate.id);
  await runNormalise(candidate.id);
  await runScore(candidate.id);
  await runDeduplicate(candidate.id);
  await runEnrich(candidate.id);
  await runMature(candidate.id);
  await runExport(candidate.id);
  return candidate.id;
}

if (process.env.RUN_ONCE === 'true') {
  runVerticalSlice().then((id) => console.log(`vertical slice done for ${id}`));
} else {
  startScheduler();
  console.log('Mining scheduler started');
}
