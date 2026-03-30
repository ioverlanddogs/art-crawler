#!/usr/bin/env node
import { request } from 'node:http';

const payload = JSON.stringify({
  externalBatchId: 'demo-batch-001',
  configVersion: 1,
  candidates: [
    {
      title: 'Deterministic Demo Candidate',
      sourceUrl: 'https://example.test/demo-candidate',
      sourcePlatform: 'web',
      fingerprint: 'demo0001',
      confidenceScore: 0.77,
      signals: { demo: 1 }
    }
  ]
});

const req = request(
  'http://localhost:3000/api/pipeline/import',
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payload),
      authorization: `Bearer ${process.env.MINING_IMPORT_SECRET ?? 'dev-mining-secret'}`
    }
  },
  (res) => {
    let body = '';
    res.on('data', (chunk) => (body += chunk.toString()));
    res.on('end', () => {
      console.log(`Import status: ${res.statusCode}`);
      console.log(body);
      console.log('Open http://localhost:3000/moderation and GET /api/admin/moderation/queue');
    });
  }
);

req.on('error', (err) => {
  console.error('Demo flow failed', err);
  process.exitCode = 1;
});

req.write(payload);
req.end();
