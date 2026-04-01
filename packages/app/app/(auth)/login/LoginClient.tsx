'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

const DEFAULT_CALLBACK_URL = '/dashboard';

function resolveErrorMessage(error: string | null): string | null {
  if (!error) return null;
  if (error === 'AccessDenied') {
    return 'Access denied. Your Google account must match an ACTIVE admin user.';
  }
  return 'Unable to sign in. Please try again or contact an administrator.';
}

export default function LoginClient() {
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  const callbackUrl = searchParams.get('callbackUrl') || DEFAULT_CALLBACK_URL;
  const errorMessage = resolveErrorMessage(searchParams.get('error'));

  function handleSignIn() {
    setLoading(true);
    signIn('google', { callbackUrl });
  }

  return (
    <main style={{ maxWidth: 420, margin: '80px auto', padding: 20, textAlign: 'center' }}>
      <h1>Pipeline Admin</h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>
        Sign in with your authorised Google account to continue.
      </p>
      {errorMessage ? (
        <p role="alert" style={{ color: '#b91c1c', marginBottom: 16 }}>
          {errorMessage}
        </p>
      ) : null}
      <button
        onClick={handleSignIn}
        disabled={loading}
        style={{ padding: '10px 24px', fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer' }}
      >
        {loading ? 'Redirecting...' : 'Sign in with Google'}
      </button>
    </main>
  );
}
