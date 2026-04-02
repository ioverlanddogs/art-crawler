export const dynamic = 'force-dynamic';

import { Suspense } from 'react';

import LoginClient from './LoginClient';

function LoginFallback() {
  return (
    <main style={{ maxWidth: 420, margin: '80px auto', padding: 20, textAlign: 'center' }}>
      <h1>Pipeline Admin</h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>Loading sign-in…</p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginClient />
    </Suspense>
  );
}
