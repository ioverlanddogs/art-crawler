import type { ReactNode } from 'react';

export function ChangeImpactNotice({
  title,
  bullets,
  tone = 'warning',
  footer
}: {
  title: string;
  bullets: string[];
  tone?: 'warning' | 'danger' | 'info';
  footer?: ReactNode;
}) {
  return (
    <section className={`impact-notice tone-${tone}`} aria-live="polite">
      <h3>{title}</h3>
      <ul>
        {bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      {footer ? <p className="muted">{footer}</p> : null}
    </section>
  );
}
