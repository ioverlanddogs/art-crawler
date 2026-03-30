'use client';

import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn('credentials', { email, password, redirect: false });
    if (result?.ok) {
      router.push('/admin/dashboard');
      router.refresh();
      return;
    }

    setError('Invalid email or password.');
    setLoading(false);
  }

  return (
    <main style={{ maxWidth: 420, margin: '80px auto', padding: 20 }}>
      <h1>Pipeline Admin Login</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>
        <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
      </form>
      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
    </main>
  );
}
