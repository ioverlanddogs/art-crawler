'use client';

import { useMemo, useState } from 'react';
import { OwnershipBadge } from './OwnershipBadge';
import { ConfirmDialog } from './ConfirmDialog';

export type AssignmentQueueRow = {
  id: string;
  title: string;
  tenant: string;
  team: string;
  priority: 'critical' | 'high' | 'normal';
  owner: string | null;
  ageMinutes: number;
};

const TEAM_OPTIONS = ['Moderation Team A', 'Moderation Team B', 'Incident Response', 'Data Quality Pod'] as const;

export function AssignmentQueueTable({ rows }: { rows: AssignmentQueueRow[] }) {
  const [data, setData] = useState(rows);
  const [pending, setPending] = useState<{ id: string; team: string } | null>(null);

  const overloaded = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of data) counts.set(row.team, (counts.get(row.team) ?? 0) + 1);
    return Array.from(counts.entries())
      .filter(([, count]) => count > 8)
      .map(([team]) => team);
  }, [data]);

  function claim(id: string) {
    setData((current) => current.map((row) => (row.id === id && !row.owner ? { ...row, owner: 'Current Operator' } : row)));
  }

  function requestReassign(id: string, team: string) {
    setPending({ id, team });
  }

  function commitReassign() {
    if (!pending) return;
    setData((current) => current.map((row) => (row.id === pending.id ? { ...row, team: pending.team, owner: null } : row)));
    setPending(null);
  }

  return (
    <div className="section-card">
      <header className="section-card-header">
        <div>
          <h2>Assignment queue</h2>
          <p>Claim and reassign actions are intentionally explicit. Demo mode: actions are currently UI-local and not persisted to backend yet.</p>
        </div>
      </header>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Work item</th>
              <th>Tenant scope</th>
              <th>Team owner</th>
              <th>Current owner</th>
              <th>SLA age</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.title}</strong>
                  <p className="kpi-note">{row.priority.toUpperCase()} priority</p>
                </td>
                <td>{row.tenant}</td>
                <td>
                  {row.team} {overloaded.includes(row.team) ? <span className="muted">(OVERLOADED TEAM)</span> : null}
                </td>
                <td>
                  <OwnershipBadge owner={row.owner} escalation={row.priority === 'critical'} />
                </td>
                <td>{row.ageMinutes}m</td>
                <td>
                  <div className="filters-row">
                    <button type="button" className="action-button variant-secondary" onClick={() => claim(row.id)} disabled={Boolean(row.owner)}>
                      Claim
                    </button>
                    <select className="select" defaultValue={row.team} onChange={(event) => requestReassign(row.id, event.target.value)}>
                      {TEAM_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
              </tr>
            ))}
            {data.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No scoped assignment rows available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={Boolean(pending)}
        title="Reassign work item"
        body={`This will clear current ownership and move the item to ${pending?.team ?? 'the selected team'}.`}
        confirmLabel="Confirm reassign"
        reasonRequired
        onCancel={() => setPending(null)}
        onConfirm={commitReassign}
      />
    </div>
  );
}
