import { prisma } from './db.js';

let cache: { at: number; value: { version: number; payload: unknown } } | null = null;

export async function loadActiveConfig() {
  const now = Date.now();
  if (cache && now - cache.at < 10 * 60 * 1000) return cache.value;
  const active = await prisma.pipelineConfig.findFirst({ where: { isActive: true } });
  const value = { version: active?.version ?? 1, payload: active?.payload ?? { mode: 'default' } };
  cache = { at: now, value };
  return value;
}
