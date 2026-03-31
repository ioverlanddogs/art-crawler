'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog, SectionCard } from '@/components/admin';

type FieldDecision = 'accepted' | 'edited' | 'rejected' | 'uncertain' | null;
type DiffFieldState = 'added' | 'updated' | 'unchanged' | 'conflicting' | 'rejected';

interface FieldReview {
  fieldPath: string;
  decision: FieldDecision;
  confidence: number | null;
  proposedValueJson: unknown;
}

interface DiffField {
  fieldPath: string;
  proposedValue: unknown;
  canonicalValue: unknown;
  state: DiffFieldState;
}

interface WorkbenchData {
  id: string;
  sourceDocumentId: string;
  matchedEventId: string | null;
  proposedDataJson: Record<string, unknown>;
  reviewStatus: string;
  fieldReviews: FieldReview[];
  sourceDocument: {
    sourceUrl: string;
    fetchedAt: string | Date | null;
    httpStatus: number | null;
    metadataJson: Record<string, unknown> | null;
    extractedText: string | null;
  };
  extractionRun: {
    evidenceJson: Record<string, unknown> | null;
  } | null;
  matchedEvent: Record<string, unknown> | null;
  diffResult: {
    fields: DiffField[];
    hasConflicts: boolean;
    addedCount: number;
    updatedCount: number;
    unchangedCount: number;
  };
  currentUserRole: 'viewer' | 'moderator' | 'operator' | 'admin';
}

interface CanonicalVersion {
  id: string;
  versionNumber: number;
  changeSummary: string | null;
  createdByUserId: string | null;
  createdAt: string;
}

export function WorkbenchClient({ initialData }: { initialData: WorkbenchData }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [mergeStrategy, setMergeStrategy] = useState<'create_new' | 'merge_existing'>(data.matchedEvent ? 'merge_existing' : 'create_new');
  const [publishResult, setPublishResult] = useState<{ blockers: string[]; warnings: string[] } | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'reject' | 'draft' | null>(null);

  const fields = useMemo(
    () => Object.entries(data.proposedDataJson ?? {}).map(([fieldPath, value]) => ({ fieldPath, value })),
    [data.proposedDataJson]
  );
  const focusedField = fields[focusedIndex]?.fieldPath ?? null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      if (!fields.length) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusedIndex((current) => Math.min(current + 1, fields.length - 1));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusedIndex((current) => Math.max(current - 1, 0));
      }
      if (event.key.toLowerCase() === 'a' && focusedField) {
        event.preventDefault();
        void applyDecision(focusedField, 'accepted');
      }
      if (event.key.toLowerCase() === 'r' && focusedField) {
        event.preventDefault();
        void applyDecision(focusedField, 'rejected');
      }
      if (event.key.toLowerCase() === 'e' && focusedField) {
        event.preventDefault();
        openEdit(focusedField);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fields.length, focusedField]);

  function reviewFor(fieldPath: string): FieldReview | undefined {
    return data.fieldReviews.find((fieldReview) => fieldReview.fieldPath === fieldPath);
  }

  async function refreshData() {
    const response = await fetch(`/api/admin/workbench/${data.id}/fields`, { cache: 'no-store' });
    if (response.ok) {
      const next = (await response.json()) as WorkbenchData;
      setData(next);
    }
  }

  async function applyDecision(fieldPath: string, decision: Exclude<FieldDecision, null>, editedValue?: string) {
    const payload: Record<string, unknown> = { decision };
    if (editedValue !== undefined) {
      payload.editedValue = editedValue;
    }

    const response = await fetch(`/api/admin/workbench/${data.id}/fields/${encodeURIComponent(fieldPath)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) return;
    setEditingField(null);
    await refreshData();
  }

  function openEdit(fieldPath: string) {
    setEditingField(fieldPath);
    const value = data.proposedDataJson[fieldPath];
    setEditingValue(stringifyValue(value));
  }

  async function approve() {
    setBusy('approve');
    const response = await fetch(`/api/admin/workbench/${data.id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mergeStrategy })
    });

    if (response.status === 409) {
      setPublishResult(await response.json());
      setBusy(null);
      return;
    }

    if (!response.ok) {
      setBusy(null);
      return;
    }

    const result = (await response.json()) as { ingestionJobId?: string | null };
    router.push(result.ingestionJobId ? `/intake/${result.ingestionJobId}` : '/intake');
  }

  async function saveDraft() {
    setBusy('draft');
    await fetch(`/api/admin/workbench/${data.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reviewStatus: 'draft' })
    });
    setBusy(null);
    await refreshData();
  }

  async function reject(reason: string) {
    setBusy('reject');
    const response = await fetch(`/api/admin/workbench/${data.id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    setBusy(null);
    setRejectOpen(false);
    if (response.ok) {
      router.push('/intake');
    }
  }

  return (
    <div className="stack">
      <div className="workbench-grid">
        <SourceEvidencePanel
          sourceDocument={data.sourceDocument}
          focusedField={focusedField}
          evidenceJson={data.extractionRun?.evidenceJson ?? null}
        />

        <ProposedFieldsPanel
          fields={fields}
          focusedIndex={focusedIndex}
          onFocus={setFocusedIndex}
          reviewFor={reviewFor}
          editingField={editingField}
          editingValue={editingValue}
          onEditingValue={setEditingValue}
          onAccept={(fieldPath) => applyDecision(fieldPath, 'accepted')}
          onReject={(fieldPath) => applyDecision(fieldPath, 'rejected')}
          onEdit={openEdit}
          onSaveEdit={(fieldPath) => applyDecision(fieldPath, 'edited', editingValue)}
        />

        <CanonicalComparisonPanel
          eventId={data.matchedEventId}
          matchedEvent={data.matchedEvent}
          diffFields={data.diffResult.fields}
          mergeStrategy={mergeStrategy}
          onMergeStrategy={setMergeStrategy}
          hasMatchedEvent={Boolean(data.matchedEvent)}
          publishResult={publishResult}
          canRollback={data.currentUserRole === 'admin'}
        />
      </div>

      <SectionCard title="Actions">
        <div className="filters-row">
          <button type="button" className="action-button variant-primary" onClick={approve} disabled={busy !== null}>
            Approve and merge
          </button>
          <button type="button" className="action-button variant-secondary" onClick={saveDraft} disabled={busy !== null}>
            Save draft
          </button>
          <button type="button" className="action-button variant-danger" onClick={() => setRejectOpen(true)} disabled={busy !== null}>
            Reject import
          </button>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={rejectOpen}
        title="Reject import"
        body="This will mark the change set as rejected and fail the ingestion job."
        tone="danger"
        confirmLabel="Reject import"
        reasonRequired
        submitting={busy === 'reject'}
        onCancel={() => setRejectOpen(false)}
        onConfirm={({ reason }) => {
          if (reason) {
            void reject(reason);
          }
        }}
      />
    </div>
  );
}

function SourceEvidencePanel({
  sourceDocument,
  focusedField,
  evidenceJson
}: {
  sourceDocument: WorkbenchData['sourceDocument'];
  focusedField: string | null;
  evidenceJson: Record<string, unknown> | null;
}) {
  const markRef = useRef<HTMLElement | null>(null);
  const extracted = sourceDocument.extractedText ?? '';
  const snippet = focusedField && evidenceJson ? evidenceJson[focusedField] : null;

  const highlightedText = applyHighlight(extracted, snippet, markRef);

  useEffect(() => {
    if (!markRef.current) return;
    markRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusedField, highlightedText]);

  return (
    <SectionCard title="Source evidence">
      <div className="stack">
        <a href={sourceDocument.sourceUrl} target="_blank" rel="noreferrer" className="inline-link">
          {sourceDocument.sourceUrl}
        </a>
        <p className="kpi-note">
          HTTP {sourceDocument.httpStatus ?? '—'} · {String(sourceDocument.metadataJson?.contentType ?? 'unknown')} ·{' '}
          {sourceDocument.fetchedAt ? new Date(sourceDocument.fetchedAt).toLocaleString() : '—'}
        </p>
        <pre style={{ maxHeight: 520, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{highlightedText}</pre>
      </div>
    </SectionCard>
  );
}

function ProposedFieldsPanel({
  fields,
  focusedIndex,
  onFocus,
  reviewFor,
  editingField,
  editingValue,
  onEditingValue,
  onAccept,
  onReject,
  onEdit,
  onSaveEdit
}: {
  fields: Array<{ fieldPath: string; value: unknown }>;
  focusedIndex: number;
  onFocus: (index: number) => void;
  reviewFor: (fieldPath: string) => FieldReview | undefined;
  editingField: string | null;
  editingValue: string;
  onEditingValue: (value: string) => void;
  onAccept: (fieldPath: string) => void;
  onReject: (fieldPath: string) => void;
  onEdit: (fieldPath: string) => void;
  onSaveEdit: (fieldPath: string) => void;
}) {
  return (
    <SectionCard title="Proposed fields">
      <div className="stack">
        {fields.map((field, index) => {
          const review = reviewFor(field.fieldPath);
          const isFocused = focusedIndex === index;
          return (
            <div
              key={field.fieldPath}
              className={isFocused ? 'section-card row-selected' : 'section-card'}
              onMouseEnter={() => onFocus(index)}
            >
              <div className="filters-row" style={{ justifyContent: 'space-between' }}>
                <div style={{ width: '100%' }}>
                  <code>{field.fieldPath}</code>
                  <div style={{ width: '100%', height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.08)', marginTop: 4 }}>
                    <div
                      aria-label={`Confidence: ${formatConfidenceLabel(review?.confidence ?? null)}`}
                      style={{
                        width: `${confidencePercent(review?.confidence ?? null)}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: confidenceColor(review?.confidence ?? null)
                      }}
                    />
                  </div>
                </div>
                <span className={`status-badge ${confidenceTone(review?.confidence ?? null)}`}>
                  {formatConfidence(review?.confidence ?? null)}
                </span>
                <span className={`status-badge ${decisionTone(review?.decision ?? null)}`}>{review?.decision ?? 'unreviewed'}</span>
              </div>
              <p className="muted">{stringifyValue(field.value).slice(0, 80)}</p>
              {editingField === field.fieldPath ? (
                <div className="filters-row">
                  <input className="input" value={editingValue} onChange={(event) => onEditingValue(event.target.value)} />
                  <button type="button" className="action-button variant-primary" onClick={() => onSaveEdit(field.fieldPath)}>
                    Save
                  </button>
                </div>
              ) : null}
              <div className="filters-row">
                <button type="button" className="action-button variant-secondary" onClick={() => onAccept(field.fieldPath)}>
                  Accept
                </button>
                <button type="button" className="action-button variant-secondary" onClick={() => onEdit(field.fieldPath)}>
                  Edit
                </button>
                <button type="button" className="action-button variant-danger" onClick={() => onReject(field.fieldPath)}>
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function CanonicalComparisonPanel({
  eventId,
  matchedEvent,
  diffFields,
  mergeStrategy,
  onMergeStrategy,
  hasMatchedEvent,
  publishResult,
  canRollback
}: {
  eventId: string | null;
  matchedEvent: Record<string, unknown> | null;
  diffFields: DiffField[];
  mergeStrategy: 'create_new' | 'merge_existing';
  onMergeStrategy: (strategy: 'create_new' | 'merge_existing') => void;
  hasMatchedEvent: boolean;
  publishResult: { blockers: string[]; warnings: string[] } | null;
  canRollback: boolean;
}) {
  const [versions, setVersions] = useState<CanonicalVersion[]>([]);
  const [rollbackReason, setRollbackReason] = useState('');

  useEffect(() => {
    if (!eventId) return;
    void fetch(`/api/admin/publish/${eventId}/versions`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { versions: [] }))
      .then((payload: { versions?: CanonicalVersion[] }) => setVersions((payload.versions ?? []).slice(0, 5)));
  }, [eventId]);

  async function rollbackTo(versionNumber: number) {
    if (!eventId || !rollbackReason.trim()) return;
    const response = await fetch(`/api/admin/publish/${eventId}/rollback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ versionNumber, reason: rollbackReason.trim() })
    });
    if (response.ok) {
      setRollbackReason('');
      const payload = await fetch(`/api/admin/publish/${eventId}/versions`, { cache: 'no-store' }).then((res) => res.json());
      setVersions((payload.versions ?? []).slice(0, 5));
    }
  }

  return (
    <SectionCard title="Canonical comparison">
      <div className="stack">
        {matchedEvent ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Current</th>
                <th>Proposed</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {diffFields.map((field) => (
                <tr key={field.fieldPath}>
                  <td>{field.fieldPath}</td>
                  <td>{stringifyValue(field.canonicalValue)}</td>
                  <td>{stringifyValue(field.proposedValue)}</td>
                  <td>
                    <span className="status-badge tone-neutral">{field.state}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No existing record — will create new event on approval.</p>
        )}

        <div className="stack">
          <label>
            <input
              type="radio"
              checked={mergeStrategy === 'create_new'}
              onChange={() => onMergeStrategy('create_new')}
            />{' '}
            Create new record
          </label>
          <label>
            <input
              type="radio"
              checked={mergeStrategy === 'merge_existing'}
              disabled={!hasMatchedEvent}
              onChange={() => onMergeStrategy('merge_existing')}
            />{' '}
            Merge into existing
          </label>
        </div>

        <div className="stack">
          {publishResult?.blockers?.length ? (
            <ul className="tone-danger alert-banner">
              {publishResult.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : (
            <p className="tone-success alert-banner">Ready to approve</p>
          )}
          {publishResult?.warnings?.length ? (
            <ul className="tone-warning alert-banner">
              {publishResult.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>

        {eventId ? (
          <div className="stack">
            <h3>Version history</h3>
            {canRollback ? (
              <input
                className="input"
                value={rollbackReason}
                onChange={(event) => setRollbackReason(event.target.value)}
                placeholder="Rollback reason"
              />
            ) : null}
            {versions.map((version) => (
              <div key={version.id} className="filters-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  v{version.versionNumber} · {new Date(version.createdAt).toLocaleString()} · {version.createdByUserId ?? 'system'} ·{' '}
                  {version.changeSummary ?? 'No summary'}
                </span>
                {canRollback ? (
                  <button type="button" className="action-button variant-secondary" onClick={() => void rollbackTo(version.versionNumber)}>
                    Rollback to this version
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tagName = element.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

function stringifyValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function applyHighlight(text: string, snippet: unknown, markRef: { current: HTMLElement | null }): ReactNode {
  if (!snippet || typeof snippet !== 'string') {
    return text;
  }

  const index = text.toLowerCase().indexOf(snippet.toLowerCase());
  if (index < 0) return text;

  return (
    <>
      {text.slice(0, index)}
      <mark ref={markRef}>{text.slice(index, index + snippet.length)}</mark>
      {text.slice(index + snippet.length)}
    </>
  );
}

function formatConfidence(confidence: number | null): string {
  if (confidence == null) return '—';
  return `${Math.round(confidence * 100)}%`;
}

function confidenceTone(confidence: number | null): string {
  if (confidence == null) return 'tone-neutral';
  if (confidence >= 0.75) return 'tone-success';
  if (confidence >= 0.5) return 'tone-warning';
  return 'tone-danger';
}

function confidencePercent(confidence: number | null): number {
  if (confidence == null) return 0;
  return Math.max(0, Math.min(100, Math.round(confidence * 100)));
}

function formatConfidenceLabel(confidence: number | null): string {
  return `${confidencePercent(confidence)}%`;
}

function confidenceColor(confidence: number | null): string {
  if (confidence == null) return '#6b7280';
  if (confidence >= 0.75) return '#16a34a';
  if (confidence >= 0.5) return '#d97706';
  return '#dc2626';
}

function decisionTone(decision: FieldDecision): string {
  if (decision === 'accepted') return 'tone-success';
  if (decision === 'rejected') return 'tone-danger';
  if (decision === 'edited') return 'tone-info';
  if (decision === 'uncertain') return 'tone-warning';
  return 'tone-neutral';
}
