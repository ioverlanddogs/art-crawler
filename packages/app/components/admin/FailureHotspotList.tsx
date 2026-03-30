import Link from 'next/link';
import { EmptyState } from './EmptyState';
import { SeverityBadge } from './SeverityBadge';

export type FailureHotspot = {
  key: string;
  label: string;
  failures: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  link: string;
};

export function FailureHotspotList({ hotspots, title = 'Failure hotspot list' }: { hotspots: FailureHotspot[]; title?: string }) {
  if (!hotspots.length) {
    return <EmptyState title="No hotspots" description="No failure concentrations found in the selected window." />;
  }

  return (
    <div aria-label={title}>
      <ul className="hotspot-list">
        {hotspots.map((hotspot) => (
          <li key={hotspot.key} className="hotspot-item">
            <div>
              <p>
                <strong>{hotspot.label}</strong>
              </p>
              <p className="muted">{hotspot.failures} failures in last 24h</p>
            </div>
            <div className="hotspot-actions">
              <SeverityBadge severity={hotspot.severity} />
              <Link href={hotspot.link} className="inline-link">
                Investigate
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
