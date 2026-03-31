const APP_BASE_URL_ENV = 'NEXTAUTH_URL';
const LOCAL_APP_BASE_URL = 'http://localhost:3000';

export const CANONICAL_IMPORT_SECRET_ENV = 'MINING_IMPORT_SECRET';
export const LEGACY_IMPORT_SECRET_ENV = 'MINING_SERVICE_SECRET';

/**
 * NEXTAUTH_URL is the canonical public base URL for app links.
 * Local default keeps invite flow usable in local development and tests.
 */
export function getAppBaseUrl(): string {
  return process.env[APP_BASE_URL_ENV] ?? LOCAL_APP_BASE_URL;
}

/**
 * Canonical shared secret for mining -> app imports.
 * Deprecated fallback retained to avoid breaking older deploys still using MINING_SERVICE_SECRET.
 */
export function getImportSecretFromEnv(): string | undefined {
  return process.env[CANONICAL_IMPORT_SECRET_ENV] ?? process.env[LEGACY_IMPORT_SECRET_ENV];
}

export function getAnthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}

export function isAiExtractionEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
