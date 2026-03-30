const CANONICAL_IMPORT_SECRET_ENV = 'MINING_IMPORT_SECRET';
const LEGACY_IMPORT_SECRET_ENV = 'MINING_SERVICE_SECRET';

export function getImportAuthSecret(): string | undefined {
  const canonical = process.env[CANONICAL_IMPORT_SECRET_ENV];
  if (canonical) return canonical;

  // Deprecated fallback for older deploys. Prefer MINING_IMPORT_SECRET everywhere.
  return process.env[LEGACY_IMPORT_SECRET_ENV];
}

export function isPipelineImportAuthorized(req: Request): boolean {
  const secret = getImportAuthSecret();
  if (!secret) return false;

  const auth = req.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}
