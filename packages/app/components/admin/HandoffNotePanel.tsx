import { OwnershipBadge } from './OwnershipBadge';

export type HandoffNote = {
  id: string;
  fromTeam: string;
  toTeam: string;
  owner: string | null;
  summary: string;
  createdAt: string;
  pending: boolean;
};

export function HandoffNotePanel({ notes, inferred = false }: { notes: HandoffNote[]; inferred?: boolean }) {
  return (
    <section className="section-card" aria-label="Shift handoff notes">
      <header className="section-card-header">
        <div>
          <h2>Shift handoff</h2>
          <p>{inferred ? 'Cross-team handoff context inferred from available investigation and queue telemetry.' : 'Cross-team handoff notes.'}</p>
        </div>
      </header>
      <ul className="timeline">
        {notes.map((note) => (
          <li key={note.id}>
            <p>
              <strong>{note.fromTeam}</strong> → <strong>{note.toTeam}</strong> <OwnershipBadge owner={note.owner} escalation={note.pending} />
            </p>
            <p className="muted">{note.summary}</p>
            <p className="kpi-note">
              {new Date(note.createdAt).toLocaleString()} · {note.pending ? 'HANDOFF PENDING' : 'Handoff acknowledged'}
            </p>
          </li>
        ))}
        {notes.length === 0 ? <li className="muted">No handoff notes in current scope.</li> : null}
      </ul>
    </section>
  );
}
