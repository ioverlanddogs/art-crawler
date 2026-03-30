import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';

if (process.env.NODE_ENV !== 'test') {
  const required = ['PIPELINE_IMPORT_URL', 'MINING_IMPORT_SECRET', 'MINING_DATABASE_URL', 'REDIS_URL'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[mining] missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const workerConnection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379');

function getCandidateId(jobData: unknown): string {
  const candidateId = (jobData as { candidateId?: unknown })?.candidateId;
  if (typeof candidateId !== 'string' || !candidateId) {
    throw new Error('missing candidateId');
  }
  return candidateId;
}

function registerWorkers() {
  new Worker(
    'discovery',
    async (_job) => {
      try {
        const { runDiscovery } = await import('./workers/discovery.js');
        const c = await runDiscovery();
        console.log(`[mining:discovery] created candidate ${c.id}`);
      } catch (e: any) {
        console.error('[mining:discovery] error:', e.message);
        throw e;
      }
    },
    { connection: workerConnection }
  );

  new Worker(
    'fetch',
    async (job) => {
      const candidateId = getCandidateId(job.data);
      try {
        const { runFetch } = await import('./workers/fetch.js');
        await runFetch(candidateId);
      } catch (e: any) {
        console.error('[mining:fetch] error:', e.message);
        throw e;
      }
    },
    { connection: workerConnection }
  );

  new Worker(
    'extract',
    async (job) => {
      const candidateId = getCandidateId(job.data);
      try {
        const { runExtract } = await import('./workers/extract.js');
        await runExtract(candidateId);
      } catch (e: any) {
        console.error('[mining:extract] error:', e.message);
        throw e;
      }
    },
    { connection: workerConnection }
  );

  new Worker(
    'normalise',
    async (job) => {
      const candidateId = getCandidateId(job.data);
      try {
        const { runNormalise } = await import('./workers/normalise.js');
        await runNormalise(candidateId);
      } catch (e: any) {
        console.error('[mining:normalise] error:', e.message);
        throw e;
      }
    },
    { connection: workerConnection }
  );

  new Worker(
    'score',
    async (job) => {
      const candidateId = getCandidateId(job.data);
      try {
        const { runScore } = await import('./workers/score.js');
        await runScore(candidateId);
      } catch (e: any) {
        console.error('[mining:score] error:', e.message);
        throw e;
      }
    },
    { connection: workerConnection }
  );

  new Worker(
    'deduplicate',
    async (job) => {
      const candidateId = getCandidateId(job.data);
      try {
        const { runDeduplicate } = await import('./workers/deduplicate.js');
        await runDeduplicate(candidateId);
      } catch (e: any) {
        console.error('[mining:deduplicate] error:', e.message);
        throw e;
      }
    },
    { connection: workerConnection }
  );

  new Worker(
    'enrich',
    async (job) => {
      const candidateId = getCandidateId(job.data);
      try {
        const { runEnrich } = await import('./workers/enrich.js');
        await runEnrich(candidateId);
      } catch (e: any) {
        console.error('[mining:enrich] error:', e.message);
        throw e;
      }
    },
    { connection: workerConnection }
  );

  new Worker(
    'mature',
    async (job) => {
      const candidateId = getCandidateId(job.data);
      try {
        const { runMature } = await import('./workers/mature.js');
        await runMature(candidateId);
      } catch (e: any) {
        console.error('[mining:mature] error:', e.message);
        throw e;
      }
    },
    { connection: workerConnection }
  );

  new Worker(
    'export',
    async (job) => {
      const candidateId = getCandidateId(job.data);
      try {
        const { runExport } = await import('./workers/export.js');
        await runExport(candidateId);
      } catch (e: any) {
        console.error('[mining:export] error:', e.message);
        throw e;
      }
    },
    { connection: workerConnection }
  );
}

export async function runVerticalSlice() {
  const { runDiscovery } = await import('./workers/discovery.js');
  const { runFetch } = await import('./workers/fetch.js');
  const { runExtract } = await import('./workers/extract.js');
  const { runNormalise } = await import('./workers/normalise.js');
  const { runScore } = await import('./workers/score.js');
  const { runDeduplicate } = await import('./workers/deduplicate.js');
  const { runEnrich } = await import('./workers/enrich.js');
  const { runMature } = await import('./workers/mature.js');
  const { runExport } = await import('./workers/export.js');

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
  registerWorkers();
  import('./scheduler.js').then(({ startScheduler }) => {
    startScheduler();
    console.log('[mining] scheduler started (cron: */5 * * * *)');
  });
}
