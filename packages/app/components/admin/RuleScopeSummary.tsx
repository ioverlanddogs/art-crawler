export function RuleScopeSummary({
  source,
  regions,
  entityTypes,
  coverage
}: {
  source?: string | null;
  regions: string[];
  entityTypes: string[];
  coverage?: string | null;
}) {
  return (
    <div className="rule-scope-summary">
      <p>
        <strong>Source:</strong> {source || 'Config metadata'}
      </p>
      <p>
        <strong>Regions:</strong> {regions.length ? regions.join(', ') : 'Global'}
      </p>
      <p>
        <strong>Entity scope:</strong> {entityTypes.length ? entityTypes.join(', ') : 'Events'}
      </p>
      <p>
        <strong>Coverage:</strong> {coverage || 'Not provided'}
      </p>
    </div>
  );
}
