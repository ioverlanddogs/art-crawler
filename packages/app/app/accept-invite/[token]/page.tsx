import crypto from 'node:crypto';
import { prisma } from '@/lib/db';

async function acceptInvite(formData: FormData) {
  'use server';

  const token = String(formData.get('token') ?? '');
  const name = String(formData.get('name') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (password.length < 12 || password !== confirmPassword) {
    return;
  }

  await fetch(`${process.env.NEXTAUTH_URL ?? ''}/api/auth/accept-invite`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, name, password, confirmPassword })
  });
}

export default async function AcceptInvite({ params }: { params: { token: string } }) {
  const tokenHash = crypto.createHash('sha256').update(params.token).digest('hex');
  const invite = await prisma.adminInvite.findUnique({ where: { tokenHash }, include: { user: true } });

  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return <main><h1>Invite invalid</h1><p>This invite is expired, already used, or invalid.</p></main>;
  }

  return (
    <main style={{ maxWidth: 480, margin: '80px auto', padding: 20 }}>
      <h1>Accept invite</h1>
      <form action={acceptInvite} style={{ display: 'grid', gap: 12 }}>
        <input type="hidden" name="token" value={params.token} />
        <label>
          Name
          <input name="name" defaultValue={invite.user.name ?? ''} required />
        </label>
        <label>
          Password
          <input name="password" type="password" minLength={12} required />
        </label>
        <label>
          Confirm password
          <input name="confirmPassword" type="password" minLength={12} required />
        </label>
        <button type="submit">Activate account</button>
      </form>
    </main>
  );
}
