#!/usr/bin/env node
import { request } from 'node:http';

const payload = JSON.stringify({
  source: 'mining-service-v1',
  region: 'us',
  events: [
    {
      venueUrl: 'https://example.test/events',
      title: 'Deterministic Demo Candidate',
      startAt: '2026-01-10T18:00:00.000Z',
      timezone: 'UTC',
      source: 'mining-service-v1',
      miningConfidenceScore: 77,
      observationCount: 2,
      sourceUrl: 'https://example.test/demo-candidate',
      crossSourceMatches: 0
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
      authorization: `Bearer ${process.env.MINING_IMPORT_SECRET ?? process.env.MINING_SERVICE_SECRET ?? 'dev-mining-secret'}`
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
