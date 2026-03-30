'use client';

import { signOut } from 'next-auth/react';

export function AccountMenu({
  name,
  email,
  role
}: {
  name?: string | null;
  email?: string | null;
  role?: string | null;
}) {
  async function onSignOut() {
    await signOut({ callbackUrl: '/login' });
  }

  return (
    <div className="account-menu">
      <div className="user-pill">
        <p>{name || email || 'Unknown User'}</p>
        <span>{role || 'No Role'}</span>
      </div>
      <button type="button" className="action-button variant-secondary" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}
