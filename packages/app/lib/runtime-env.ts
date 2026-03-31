const REQUIRED_DATABASE_ENV_VARS = ['DATABASE_URL', 'DATABASE_URL_DIRECT'] as const;

function hasNonEmptyEnvVar(value: string | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function getMissingDatabaseEnvVars(): string[] {
  return REQUIRED_DATABASE_ENV_VARS.filter((envVar) => !hasNonEmptyEnvVar(process.env[envVar]));
}

export function isDatabaseRuntimeReady() {
  return getMissingDatabaseEnvVars().length === 0;
}
