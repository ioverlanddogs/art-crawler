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
  const result = await acceptInvite({ token });

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
        <p>Your admin access is now active. Next, sign in with the same Google email that received this invite.</p>
        <a href="/login">Continue to Google sign-in</a>
      </main>
    );
  }

  const invite = await findPendingInviteByToken(params.token);
  if (!invite) {
    return (
      <main style={{ maxWidth: 480, margin: '80px auto', padding: 20 }}>
        <h1>Invite invalid</h1>
        <p>This invite is expired, already used, or invalid.</p>
      </main>
    );
  }

  const errorCode = searchParams?.error as 'VALIDATION_ERROR' | 'INVALID_INVITE' | 'INTERNAL_ERROR' | undefined;

  return (
    <main style={{ maxWidth: 480, margin: '80px auto', padding: 20 }}>
      <h1>Accept invite</h1>
      <p>
        You have been invited to join Pipeline Admin as <strong>{invite.user.name ?? invite.user.email}</strong>.
        Activating this invite prepares your admin access. After activation, sign in with the same Google email as this invite.
      </p>
      {errorCode ? (
        <p role="alert" style={{ color: '#b91c1c' }}>
          {mapAcceptInviteErrorToUiMessage(errorCode)}
        </p>
      ) : null}
      <form action={activateInvite} style={{ display: 'grid', gap: 12 }}>
        <input type="hidden" name="token" value={params.token} />
        <button type="submit">Activate account</button>
      </form>
    </main>
  );
}
