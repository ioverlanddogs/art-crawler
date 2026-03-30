import { getImportSecretFromEnv } from '@/lib/env';

export function getImportAuthSecret(): string | undefined {
  return getImportSecretFromEnv();
}

export function isPipelineImportAuthorized(req: Request): boolean {
  const secret = getImportAuthSecret();
  if (!secret) return false;

  const auth = req.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}
