'use client';

import { useMemo } from 'react';
import { AuditLogTable, type AuditLogItem } from './AuditLogTable';
import { AlertBanner } from './AlertBanner';

export type RecoveryAuditEvent = {
  id: string;
  stage: string;
  status: string;
  detail: string | null;
  createdAt: string;
};

function kv(detail: string | null): Record<string, string> {
  const map: Record<string, string> = {};
  for (const segment of (detail || '').split(';')) {
    const [key, ...rest] = segment.split('=');
    if (!key || rest.length === 0) continue;
    map[key.trim()] = rest.join('=').trim();
  }
  return map;
}

export function RecoveryAuditFeed({ events, hasGaps }: { events: RecoveryAuditEvent[]; hasGaps: boolean }) {
  const rows = useMemo<AuditLogItem[]>(() => {
    return events.map((event) => {
      const parsed = kv(event.detail);
      return {
        id: event.id,
        createdAt: event.createdAt,
        actor: parsed.actor || 'Unknown actor',
        action: event.stage.replaceAll('_', ' '),
        target: parsed.target || parsed.scope || parsed.batch || parsed.stage || 'Recovery control plane',
        reason: parsed.reason || null,
        outcome: event.status,
        rawDetail: event.detail,
        incompleteContext: !parsed.actor || !parsed.reason || !parsed.scope
      };
    });
  }, [events]);

  return (
    <div className="stack">
      {hasGaps ? (
        <AlertBanner tone="warning" title="Recovery audit feed has partial coverage">
          Some historical recovery actions do not include actor/reason/scope metadata. Rows are labeled as incomplete context.
        </AlertBanner>
      ) : null}
      <AuditLogTable rows={rows} />
    </div>
  );
}
