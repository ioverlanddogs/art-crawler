'use client';

import type { ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

export function ActionButton({
  children,
  onClick,
  disabled,
  submitting,
  variant = 'primary',
  title
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  submitting?: boolean;
  variant?: Variant;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`action-button variant-${variant}`}
      onClick={onClick}
      disabled={disabled || submitting}
    >
      {submitting ? 'Submitting…' : children}
    </button>
  );
}
