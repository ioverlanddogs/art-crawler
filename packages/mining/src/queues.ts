import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { getMiningRedisUrl } from './lib/env.js';

const connection = new Redis(getMiningRedisUrl());

export const discoveryQueue = new Queue('discovery', { connection });
export const fetchQueue = new Queue('fetch', { connection });
export const extractQueue = new Queue('extract', { connection });
export const normaliseQueue = new Queue('normalise', { connection });
export const scoreQueue = new Queue('score', { connection });
export const deduplicateQueue = new Queue('deduplicate', { connection });
export const enrichQueue = new Queue('enrich', { connection });
export const matureQueue = new Queue('mature', { connection });
export const exportQueue = new Queue('export', { connection });
