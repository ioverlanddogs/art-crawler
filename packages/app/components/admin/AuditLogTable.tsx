'use client';

import { useMemo, useState } from 'react';
import { DataTable } from './DataTable';
import { EmptyState } from './EmptyState';

export type AuditLogItem = {
  id: string;
  createdAt: string;
  actor: string;
  action: string;
  target: string;
  reason: string | null;
  outcome: string;
  rawDetail: string | null;
  incompleteContext?: boolean;
};

function timeLabel(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString();
}

export function AuditLogTable({ rows }: { rows: AuditLogItem[] }) {
  const [actorFilter, setActorFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [targetFilter, setTargetFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | '24h' | '7d' | '30d'>('7d');

  const actionOptions = useMemo(() => ['all', ...new Set(rows.map((row) => row.action))], [rows]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return rows.filter((row) => {
      if (actorFilter && !row.actor.toLowerCase().includes(actorFilter.toLowerCase())) return false;
      if (actionFilter !== 'all' && row.action !== actionFilter) return false;
      if (targetFilter && !row.target.toLowerCase().includes(targetFilter.toLowerCase())) return false;
      if (timeFilter !== 'all') {
        const maxAgeMs = timeFilter === '24h' ? 24 * 60 * 60 * 1000 : timeFilter === '7d' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
        const eventTime = new Date(row.createdAt).getTime();
        if (Number.isNaN(eventTime) || now - eventTime > maxAgeMs) return false;
      }
      return true;
    });
  }, [actionFilter, actorFilter, rows, targetFilter, timeFilter]);

  return (
    <div className="stack" id="audit-log" aria-label="Audit and change history">
      <div className="filters-row" role="group" aria-label="Audit filters">
        <label className="stack" style={{ minWidth: 180 }}>
          <span className="muted">Actor</span>
          <input className="input" value={actorFilter} onChange={(event) => setActorFilter(event.target.value)} placeholder="email or id" />
        </label>
        <label className="stack" style={{ minWidth: 180 }}>
          <span className="muted">Action</span>
          <select className="select" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
            {actionOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'All actions' : option}
              </option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ minWidth: 180 }}>
          <span className="muted">Target</span>
          <input className="input" value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)} placeholder="config, model, user" />
        </label>
        <label className="stack" style={{ minWidth: 160 }}>
          <span className="muted">Time window</span>
          <select className="select" value={timeFilter} onChange={(event) => setTimeFilter(event.target.value as 'all' | '24h' | '7d' | '30d')}>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </label>
      </div>

      <DataTable
        rows={filtered}
        rowKey={(row) => row.id}
        emptyState={<EmptyState title="No matching audit events" description="Try widening your filters or expanding the time window." />}
        columns={[
          { key: 'when', header: 'When', render: (row) => timeLabel(row.createdAt) },
          { key: 'actor', header: 'Actor', render: (row) => row.actor || 'Unknown actor' },
          { key: 'action', header: 'Action', render: (row) => row.action },
          { key: 'target', header: 'Target', render: (row) => row.target },
          { key: 'reason', header: 'Reason', render: (row) => row.reason || 'No reason recorded' },
          {
            key: 'outcome',
            header: 'Outcome',
            render: (row) =>
              row.incompleteContext ? `${row.outcome} · Incomplete audit context` : row.outcome
          }
        ]}
      />
    </div>
  );
}
