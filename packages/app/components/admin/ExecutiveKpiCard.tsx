import { ScopeBadge } from './ScopeBadge';

export function ExecutiveKpiCard({
  title,
  value,
  note,
  scope = 'global'
}: {
  title: string;
  value: string | number;
  note: string;
  scope?: 'tenant' | 'team' | 'global';
}) {
  return (
    <article className="stat-card">
      <div className="metric-card-header">
        <p className="stat-label">{title}</p>
        <ScopeBadge scope={scope} />
      </div>
      <p className="stat-value">{value}</p>
      <p className="stat-detail">{note}</p>
    </article>
  );
}
