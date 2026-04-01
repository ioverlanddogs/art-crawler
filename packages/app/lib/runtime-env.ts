const REQUIRED_DATABASE_ENV_VARS = ['DATABASE_URL', 'DATABASE_URL_DIRECT'] as const;
const WEAK_NEXTAUTH_SECRETS = new Set(['', 'change-me', 'secret', 'dev', 'changeme']);

function hasNonEmptyEnvVar(value: string | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}

const nextAuthSecret = (process.env.NEXTAUTH_SECRET ?? '').trim();
if (process.env.NODE_ENV === 'production' && WEAK_NEXTAUTH_SECRETS.has(nextAuthSecret.toLowerCase())) {
  throw new Error('Unsafe NEXTAUTH_SECRET detected in production. Set a strong, unique NEXTAUTH_SECRET before deploying.');
}

export function getMissingDatabaseEnvVars(): string[] {
  return REQUIRED_DATABASE_ENV_VARS.filter((envVar) => !hasNonEmptyEnvVar(process.env[envVar]));
}

export function isDatabaseRuntimeReady() {
  return getMissingDatabaseEnvVars().length === 0;
}
