'use client';

import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';

const DEFAULT_CALLBACK_URL = '/dashboard';

export function isSafeCallbackUrl(url: string): boolean {
  if (!url || !url.startsWith('/')) return false;
  if (url.startsWith('//')) return false;
  if (url.startsWith('/\\')) return false;
  return true;
}

function resolveErrorMessage(error: string | null): string | null {
  if (!error) return null;
  if (error === 'CredentialsSignin') {
    return 'Invalid email or password.';
  }
  if (error === 'AccessDenied') {
    return 'Access denied. Contact an administrator if you believe this is an error.';
  }
  return 'Unable to sign in. Please try again.';
}

export default function LoginClient() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawCallbackUrl = searchParams.get('callbackUrl') || DEFAULT_CALLBACK_URL;
  const callbackUrl = isSafeCallbackUrl(rawCallbackUrl) ? rawCallbackUrl : DEFAULT_CALLBACK_URL;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Email and password are required.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false
    });

    if (result?.ok) {
      router.push(callbackUrl);
      return;
    }

    setLoading(false);
    setErrorMessage(resolveErrorMessage(result?.error ?? null));
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    await signIn('google', { callbackUrl });
  }

  return (
    <main style={{ maxWidth: 420, margin: '80px auto', padding: 20, textAlign: 'center' }}>
      <h1>Pipeline Admin</h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>Sign in with your admin credentials to continue.</p>
      {errorMessage ? (
        <p role="alert" style={{ color: '#b91c1c', marginBottom: 16 }}>
          {errorMessage}
        </p>
      ) : null}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          autoComplete="email"
          style={{ padding: '10px 12px', fontSize: 16 }}
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          style={{ padding: '10px 12px', fontSize: 16 }}
        />
        <button type="submit" disabled={loading} style={{ padding: '10px 24px', fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true' ? (
        <>
          <hr style={{ margin: '24px 0' }} />
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{ padding: '10px 24px', fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer', backgroundColor: '#f3f4f6' }}
          >
            Sign in with Google
          </button>
        </>
      ) : null}
    </main>
  );
}
