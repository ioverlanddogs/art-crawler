import { StatusBadge } from './StatusBadge';

export function TrendSummaryCard({
  title,
  trendLabel,
  trendDirection,
  detail
}: {
  title: string;
  trendLabel: string;
  trendDirection: 'up' | 'down' | 'flat' | 'unknown';
  detail: string;
}) {
  const tone = trendDirection === 'up' ? 'warning' : trendDirection === 'down' ? 'success' : trendDirection === 'flat' ? 'info' : 'neutral';
  const directionLabel = trendDirection === 'up' ? 'Rising' : trendDirection === 'down' ? 'Improving' : trendDirection === 'flat' ? 'Stable' : 'Unknown';

  return (
    <article className="stat-card">
      <div className="metric-card-header">
        <p className="stat-label">{title}</p>
        <StatusBadge tone={tone}>{directionLabel}</StatusBadge>
      </div>
      <p className="stat-value">{trendLabel}</p>
      <p className="stat-detail">{detail}</p>
    </article>
  );
}
