export type ReplayScope = 'candidate' | 'batch' | 'stage' | 'system';

export function ReplayScopeSummary({
  scope,
  target,
  notes,
  blockedReason
}: {
  scope: ReplayScope;
  target: string;
  notes?: string[];
  blockedReason?: string | null;
}) {
  return (
    <div className="stack">
      <p>
        <strong>What this affects:</strong> {scope} scope · {target}
      </p>
      {notes?.length ? (
        <ul className="timeline" aria-label="Scope safeguards">
          {notes.map((note) => (
            <li key={note} className="muted">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
      {blockedReason ? (
        <p className="dialog-error" role="alert">
          Blocked: {blockedReason}
        </p>
      ) : null}
    </div>
  );
}
