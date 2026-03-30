import React from 'react';
import { redirect } from 'next/navigation';
import {
  acceptInvite,
  findPendingInviteByToken,
  mapAcceptInviteErrorToUiMessage
} from '@/lib/invites/accept-invite';

async function activateInvite(formData: FormData) {
  'use server';

  const token = String(formData.get('token') ?? '');
  const result = await acceptInvite({
    token,
    name: String(formData.get('name') ?? ''),
    password: String(formData.get('password') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? '')
  });

  if (!result.ok) {
    redirect(`/accept-invite/${encodeURIComponent(token)}?error=${result.code}`);
  }

  redirect(`/accept-invite/${encodeURIComponent(token)}?accepted=1`);
}

type AcceptInvitePageProps = {
  params: { token: string };
  searchParams?: { error?: string; accepted?: string };
};

export default async function AcceptInvite({ params, searchParams }: AcceptInvitePageProps) {
  if (searchParams?.accepted === '1') {
    return (
      <main style={{ maxWidth: 480, margin: '80px auto', padding: 20 }}>
        <h1>Account activated</h1>
        <p>Your account is active. You can now sign in with your new credentials.</p>
        <a href="/login">Go to login</a>
      </main>
    );
  }

  const invite = await findPendingInviteByToken(params.token);
  if (!invite) {
    return <main><h1>Invite invalid</h1><p>This invite is expired, already used, or invalid.</p></main>;
  }

  const errorCode = searchParams?.error;
  const hasKnownError = errorCode === 'VALIDATION_ERROR' || errorCode === 'INVALID_INVITE' || errorCode === 'INTERNAL_ERROR';

  return (
    <main style={{ maxWidth: 480, margin: '80px auto', padding: 20 }}>
      <h1>Accept invite</h1>
      {hasKnownError ? (
        <p role="alert" style={{ color: '#b91c1c' }}>
          {mapAcceptInviteErrorToUiMessage(errorCode)}
        </p>
      ) : null}
      <form action={activateInvite} style={{ display: 'grid', gap: 12 }}>
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
