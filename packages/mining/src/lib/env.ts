const LOCAL_REDIS_URL = 'redis://localhost:6379';
const LOCAL_HEALTH_PORT = 7301;

export const CANONICAL_IMPORT_SECRET_ENV = 'MINING_IMPORT_SECRET';
export const LEGACY_IMPORT_SECRET_ENV = 'MINING_SERVICE_SECRET';

export function getImportSecretFromEnv(): string | undefined {
  return process.env[CANONICAL_IMPORT_SECRET_ENV] ?? process.env[LEGACY_IMPORT_SECRET_ENV];
}

export type MiningRuntimeEnv = {
  pipelineImportUrl: string;
  miningDatabaseUrl: string;
  redisUrl: string;
  importSecret: string;
  healthPort: number;
  runOnce: boolean;
};

export function getMiningRedisUrl(): string {
  return process.env.REDIS_URL ?? LOCAL_REDIS_URL;
}

export function readMiningRuntimeEnv(): MiningRuntimeEnv {
  const pipelineImportUrl = process.env.PIPELINE_IMPORT_URL;
  if (!pipelineImportUrl) {
    throw new Error('[mining] missing required env var: PIPELINE_IMPORT_URL');
  }

  const miningDatabaseUrl = process.env.MINING_DATABASE_URL;
  if (!miningDatabaseUrl) {
    throw new Error('[mining] missing required env var: MINING_DATABASE_URL');
  }

  const importSecret = getImportSecretFromEnv();
  if (!importSecret) {
    throw new Error(
      `[mining] missing required env var: ${CANONICAL_IMPORT_SECRET_ENV} (legacy fallback ${LEGACY_IMPORT_SECRET_ENV} is still accepted but deprecated)`
    );
  }

  const healthPortRaw = process.env.MINING_HEALTH_PORT;
  const healthPort = healthPortRaw ? Number(healthPortRaw) : LOCAL_HEALTH_PORT;
  if (!Number.isFinite(healthPort) || healthPort <= 0) {
    throw new Error('[mining] MINING_HEALTH_PORT must be a positive number');
  }

  return {
    pipelineImportUrl,
    miningDatabaseUrl,
    redisUrl: getMiningRedisUrl(),
    importSecret,
    healthPort,
    runOnce: process.env.RUN_ONCE === 'true'
  };
}

export function getMiningAnthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}

export function getMiningOpenAiApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY;
}

export function getMiningGeminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY;
}
