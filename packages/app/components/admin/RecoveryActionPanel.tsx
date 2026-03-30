'use client';

import { useMemo, useState } from 'react';
import { ActionButton } from './ActionButton';
import { AlertBanner } from './AlertBanner';
import { ConfirmDialog } from './ConfirmDialog';
import { ReplayScopeSummary, type ReplayScope } from './ReplayScopeSummary';
import { SectionCard } from './SectionCard';
import { ToastRegion, type ToastMessage } from './Toast';

type ActionType = 'pause_imports' | 'resume_imports' | 'start_drain' | 'stop_drain' | 'request_replay' | 'request_retry';

type ActionIntent = {
  type: ActionType;
  label: string;
  scope: ReplayScope;
  target: string;
  highScope: boolean;
  disabled?: string;
  description: string;
  unsupported?: boolean;
};

export function RecoveryActionPanel({
  importEnabled,
  drainMode,
  blockedReplay,
  telemetryLimited
}: {
  importEnabled: boolean | null;
  drainMode: boolean | null;
  blockedReplay: string | null;
  telemetryLimited: boolean;
}) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [pending, setPending] = useState<ActionIntent | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const intents = useMemo<ActionIntent[]>(() => {
    const importKnown = typeof importEnabled === 'boolean';
    return [
      {
        type: 'pause_imports',
        label: 'Pause imports',
        description: 'Stops new mining imports from becoming visible in moderation until resumed.',
        scope: 'system',
        target: 'Global import intake',
        highScope: true,
        disabled: !importKnown ? 'Import state is unknown due to missing settings telemetry.' : importEnabled ? undefined : 'Imports are already paused.'
      },
      {
        type: 'resume_imports',
        label: 'Resume imports',
        description: 'Re-enables import intake after an incident is stabilized.',
        scope: 'system',
        target: 'Global import intake',
        highScope: true,
        disabled: !importKnown ? 'Import state is unknown due to missing settings telemetry.' : importEnabled ? 'Imports are already enabled.' : undefined
      },
      {
        type: 'start_drain',
        label: 'Start draining',
        description: 'Marks the pipeline as draining so operators can finish in-flight work before replay.',
        scope: 'system',
        target: 'Pipeline run queue',
        highScope: true,
        disabled: drainMode ? 'Pipeline is already marked as draining.' : undefined
      },
      {
        type: 'stop_drain',
        label: 'Stop draining',
        description: 'Clears drain mode after incident response is complete.',
        scope: 'system',
        target: 'Pipeline run queue',
        highScope: true,
        disabled: drainMode === false ? 'Pipeline is not in drain mode.' : undefined
      },
      {
        type: 'request_replay',
        label: 'Request replay',
        description: 'Creates an audited replay request for failed scope. Execution still requires existing backend replay support.',
        scope: 'batch',
        target: 'Failed import/export batch',
        highScope: true,
        disabled: blockedReplay || undefined,
        unsupported: false
      },
      {
        type: 'request_retry',
        label: 'Request retry',
        description: 'Creates an audited retry request for a single failed stage without pretending auto-retry exists.',
        scope: 'stage',
        target: 'Single stage failure',
        highScope: false,
        disabled: telemetryLimited ? 'Retry targeting is limited because telemetry context is incomplete.' : undefined,
        unsupported: false
      }
    ];
  }, [blockedReplay, drainMode, importEnabled, telemetryLimited]);

  function pushToast(message: Omit<ToastMessage, 'id'>) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, ...message }]);
  }

  async function submit(payload: { reason?: string; confirmText?: string }) {
    if (!pending) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/recovery/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: pending.type, scope: pending.scope, target: pending.target, reason: payload.reason, confirmText: payload.confirmText })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Request failed with status ${res.status}`);
      pushToast({
        tone: 'success',
        title: `${pending.label} recorded`,
        description: body?.note || `Action outcome: ${body?.outcome || 'success'}. Audit id: ${body?.auditId || 'n/a'}.`
      });
      setPending(null);
    } catch (error) {
      pushToast({ tone: 'error', title: `${pending.label} failed`, description: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard title="Recovery controls" subtitle="Deliberate actions for incident response with explicit scope and audit trails.">
      <div className="stack">
        <AlertBanner tone="warning" title="Safety checks before replay or retry">
          Replay and retry can duplicate work if upstream fixes are not complete. No dry-run or rollback automation is currently available in this UI.
        </AlertBanner>
        <ToastRegion messages={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((toast) => toast.id !== id))} />
        <div className="recovery-action-grid" role="region" aria-label="Recovery action controls">
          {intents.map((intent) => (
            <div key={intent.type} className="recovery-action-item">
              <p>
                <strong>{intent.label}</strong>
              </p>
              <p className="muted">{intent.description}</p>
              <p className="kpi-note">
                Scope: {intent.scope} · Target: {intent.target}
              </p>
              {intent.disabled ? <p className="dialog-error">{intent.disabled}</p> : null}
              <ActionButton
                variant={intent.highScope ? 'danger' : 'secondary'}
                disabled={Boolean(intent.disabled) || intent.unsupported}
                onClick={() => setPending(intent)}
              >
                {intent.label}
              </ActionButton>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.highScope ? `${pending?.label} (high-scope)` : pending?.label || 'Confirm action'}
        body={
          pending?.highScope
            ? 'This recovery action affects system behavior and requires a reason plus typed confirmation token.'
            : 'Confirm this recovery action after verifying scope and failure details.'
        }
        tone={pending?.highScope ? 'danger' : 'default'}
        reasonRequired
        confirmToken={pending?.highScope ? 'RECOVER' : undefined}
        confirmLabel={pending?.label || 'Confirm'}
        submitting={submitting}
        onCancel={() => {
          if (!submitting) setPending(null);
        }}
        onConfirm={submit}
      >
        {pending ? (
          <ReplayScopeSummary
            scope={pending.scope}
            target={pending.target}
            blockedReason={pending.disabled || null}
            notes={[
              'Idempotency is best-effort only; verify fingerprints and previous import batch IDs before replay.',
              'If upstream data is unchanged, replay may re-surface equivalent duplicates for moderation.',
              'If dry-run is unavailable, start with smallest scope first and monitor telemetry after execution.'
            ]}
          />
        ) : null}
      </ConfirmDialog>
    </SectionCard>
  );
}
