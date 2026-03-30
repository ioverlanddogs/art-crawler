function safeObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function ConfigDiffSummary({ current, previous }: { current: unknown; previous: unknown }) {
  const currentObj = safeObject(current);
  const previousObj = safeObject(previous);

  const keys = new Set([...Object.keys(currentObj), ...Object.keys(previousObj)]);
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const key of keys) {
    if (!(key in previousObj)) {
      added.push(key);
      continue;
    }
    if (!(key in currentObj)) {
      removed.push(key);
      continue;
    }
    const before = JSON.stringify(previousObj[key]);
    const after = JSON.stringify(currentObj[key]);
    if (before !== after) changed.push(key);
  }

  const preview = (values: string[]) => (values.length ? values.slice(0, 6).join(', ') : 'None');

  return (
    <div className="config-diff-summary" aria-label="Configuration change summary">
      <p>
        <strong>Added keys:</strong> {preview(added)}
      </p>
      <p>
        <strong>Changed keys:</strong> {preview(changed)}
      </p>
      <p>
        <strong>Removed keys:</strong> {preview(removed)}
      </p>
      <p className="muted">This summary is key-level only. Review full config data before global activation.</p>
    </div>
  );
}
