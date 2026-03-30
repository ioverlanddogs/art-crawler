import type { ReactNode } from 'react';

export function ExplainabilityPanel({
  title,
  summary,
  matchedCriteria,
  thresholdContext,
  boundaryCopy,
  footer
}: {
  title: string;
  summary: string;
  matchedCriteria: string[];
  thresholdContext: string;
  boundaryCopy: string;
  footer?: ReactNode;
}) {
  return (
    <div className="explainability-panel" role="region" aria-label={title}>
      <h3>{title}</h3>
      <p>{summary}</p>
      <p className="muted">Threshold context: {thresholdContext}</p>
      <p className="muted">Human-review boundary: {boundaryCopy}</p>
      <ul>
        {matchedCriteria.map((criterion) => (
          <li key={criterion}>{criterion}</li>
        ))}
      </ul>
      {footer}
    </div>
  );
}
