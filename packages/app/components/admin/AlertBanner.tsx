import type { ReactNode } from 'react';

export function AlertBanner({
  tone = 'info',
  title,
  children
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={`alert-banner tone-${tone}`}>
      <p className="alert-title">{title}</p>
      <div className="muted">{children}</div>
    </div>
  );
}
