// TODO: remove this file after login is confirmed working.
/**
 * Temporary auth readiness diagnostic — remove after root cause is confirmed.
 * Exposes boolean flags only. No secret values are returned.
 */
import { NextResponse } from 'next/server';
import { isDatabaseRuntimeReady } from '@/lib/runtime-env';
import { getGoogleClientId, getGoogleClientSecret, getApprovedGoogleEmail } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  const secret = (process.env.NEXTAUTH_SECRET ?? '').trim();
  const weakSecrets = new Set(['', 'change-me', 'secret', 'dev', 'changeme']);

  return NextResponse.json({
    databaseReady: isDatabaseRuntimeReady(),
    nextAuthSecretPresent: secret.length > 0,
    nextAuthSecretLength: secret.length,
    nextAuthSecretIsWeak: weakSecrets.has(secret.toLowerCase()),
    nextAuthUrl: process.env.NEXTAUTH_URL ?? '(not set)',
    googleClientIdPresent: Boolean(getGoogleClientId()),
    googleClientSecretPresent: Boolean(getGoogleClientSecret()),
    approvedEmailPresent: Boolean(getApprovedGoogleEmail()),
    approvedEmailLength: (getApprovedGoogleEmail() ?? '').length,
    nodeEnv: process.env.NODE_ENV ?? '(not set)'
  });
}
