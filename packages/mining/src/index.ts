import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
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

function startHealthServer() {
  const port = Number(process.env.MINING_HEALTH_PORT ?? 7301);
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/healthz' || req.url === '/readyz') {
      const body = JSON.stringify({
        service: 'artio-mining',
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime())
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(body);
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, () => {
    console.log(`[mining] health server listening on :${port}`);
  });
}

if (process.env.RUN_ONCE === 'true') {
  runVerticalSlice().then((id) => console.log(`vertical slice done for ${id}`));
} else {
  startHealthServer();
  startScheduler();
  console.log('[mining] scheduler started (cron: */5 * * * *)');
}
