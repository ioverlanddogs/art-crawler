'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  function handleSignIn() {
    setLoading(true);
    signIn('google', { callbackUrl: '/dashboard' });
  }

  return (
    <main style={{ maxWidth: 420, margin: '80px auto', padding: 20, textAlign: 'center' }}>
      <h1>Pipeline Admin</h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>
        Sign in with your authorised Google account to continue.
      </p>
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
