import Link from 'next/link';
import type { ReactNode } from 'react';
import { StatusBadge } from './StatusBadge';

export function MetricCard({
  label,
  value,
  state,
  detail,
  href,
  ctaLabel
}: {
  label: string;
  value: ReactNode;
  state?: 'healthy' | 'degraded' | 'failing' | 'unknown';
  detail?: string;
  href?: string;
  ctaLabel?: string;
}) {
  const tone = state === 'healthy' ? 'success' : state === 'degraded' ? 'warning' : state === 'failing' ? 'danger' : 'neutral';

  return (
    <article className="stat-card metric-card">
      <div className="metric-card-header">
        <p className="stat-label">{label}</p>
        {state ? <StatusBadge tone={tone}>{state}</StatusBadge> : null}
      </div>
      <p className="stat-value">{value}</p>
      {detail ? <p className="stat-detail">{detail}</p> : null}
      {href ? (
        <p className="kpi-note">
          <Link href={href} className="inline-link">
            {ctaLabel ?? 'Open details'}
          </Link>
        </p>
      ) : null}
    </article>
  );
}
