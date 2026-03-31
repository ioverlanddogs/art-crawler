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
  reviewerComment?: string | null;
  evidenceRefsJson?: unknown;
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
  notes: string | null;
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
  validationSummary: {
    blockers: string[];
    warnings: string[];
    ready: boolean;
  };
  latestIngestionJobId: string | null;
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
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [mergeStrategy, setMergeStrategy] = useState<'create_new' | 'merge_existing'>(data.matchedEvent ? 'merge_existing' : 'create_new');
  const [publishResult, setPublishResult] = useState<{ blockers: string[]; warnings: string[] } | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(data.notes ?? '');
  const [busy, setBusy] = useState<'approve' | 'reject' | 'draft' | 'safe' | 'reparse' | null>(null);
  const [safeFieldsResult, setSafeFieldsResult] = useState<{ updated: number; skipped: Array<{ fieldPath: string; reason: string }> } | null>(null);

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
      if (event.key.toLowerCase() === 'u' && focusedField) {
        event.preventDefault();
        void applyDecision(focusedField, 'uncertain');
      }
      if (event.key.toLowerCase() === 'e' && focusedField) {
        event.preventDefault();
        openEdit(focusedField);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fields.length, focusedField]);


  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden || editingField || busy) return;
      void refreshData();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [busy, data.id, editingField]);

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
    const payload: Record<string, unknown> = {
      decision,
      reviewerComment: commentDrafts[fieldPath]?.trim() || undefined
    };
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

    const result = (await response.json()) as { ingestionJobId?: string | null; eventId?: string };
    router.push(result.eventId ? `/publish/${result.eventId}` : result.ingestionJobId ? `/intake/${result.ingestionJobId}` : '/intake');
  }

  async function saveDraft() {
    setBusy('draft');
    await fetch(`/api/admin/workbench/${data.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reviewStatus: 'draft', notes: notesDraft })
    });
    setBusy(null);
    await refreshData();
  }

  async function approveSafeFields() {
    setBusy('safe');
    const response = await fetch(`/api/admin/workbench/${data.id}/fields`, { method: 'POST' });
    if (response.ok) {
      const payload = (await response.json()) as { updated: number; skipped?: Array<{ fieldPath: string; reason: string }> };
      setSafeFieldsResult({ updated: payload.updated, skipped: payload.skipped ?? [] });
    }
    setBusy(null);
    await refreshData();
  }

  async function requestReparse() {
    setBusy('reparse');
    const response = await fetch(`/api/admin/workbench/${data.id}/reparse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: notesDraft.trim() || undefined })
    });
    setBusy(null);
    if (response.ok) {
      const payload = (await response.json()) as { ingestionJobId?: string | null };
      if (payload.ingestionJobId) {
        router.push(`/intake/${payload.ingestionJobId}`);
        return;
      }
      if (data.latestIngestionJobId) {
        router.push(`/intake/${data.latestIngestionJobId}`);
      }
    }
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
          evidenceJson={data.extractionRun?.evidenceJson ?? null}
          editingField={editingField}
          editingValue={editingValue}
          onEditingValue={setEditingValue}
          commentDrafts={commentDrafts}
          onCommentDraft={setCommentDrafts}
          onAccept={(fieldPath) => applyDecision(fieldPath, 'accepted')}
          onUncertain={(fieldPath) => applyDecision(fieldPath, 'uncertain')}
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
          validationSummary={data.validationSummary}
          canRollback={data.currentUserRole === 'admin'}
        />
      </div>

      <SectionCard title="Validation blockers">
        <ValidationSummaryPanel validationSummary={publishResult ?? data.validationSummary} />
      </SectionCard>

      <SectionCard title="Actions">
        {safeFieldsResult ? (
          <p className="kpi-note">
            Auto-approved {safeFieldsResult.updated} field(s)
            {safeFieldsResult.skipped.length > 0 ? `; skipped ${safeFieldsResult.skipped.length} (${safeFieldsResult.skipped.map((item) => `${item.fieldPath}: ${item.reason}`).join(', ')})` : ''}.
          </p>
        ) : null}
        <div className="stack">
          <label htmlFor="review-notes">Reviewer notes</label>
          <textarea id="review-notes" className="text-area" value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} placeholder="Context for other operators and publish reviewers" />
        </div>
        <div className="filters-row">
          <button type="button" className="action-button variant-primary" onClick={approve} disabled={busy !== null}>
            Approve and merge
          </button>
          <button type="button" className="action-button variant-secondary" onClick={approveSafeFields} disabled={busy !== null}>
            Approve all safe fields
          </button>
          <button type="button" className="action-button variant-secondary" onClick={saveDraft} disabled={busy !== null}>
            Save draft
          </button>
          <button type="button" className="action-button variant-secondary" onClick={requestReparse} disabled={busy !== null}>
            Request re-parse
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

function ValidationSummaryPanel({ validationSummary }: { validationSummary: { blockers: string[]; warnings: string[] } }) {
  return (
    <div className="stack">
      {validationSummary.blockers.length > 0 ? (
        <ul className="tone-danger alert-banner">
          {validationSummary.blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : (
        <p className="tone-success alert-banner">No blockers. This record can proceed.</p>
      )}
      {validationSummary.warnings.length > 0 ? (
        <ul className="tone-warning alert-banner">
          {validationSummary.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
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
  evidenceJson,
  editingField,
  editingValue,
  onEditingValue,
  commentDrafts,
  onCommentDraft,
  onAccept,
  onUncertain,
  onReject,
  onEdit,
  onSaveEdit
}: {
  fields: Array<{ fieldPath: string; value: unknown }>;
  focusedIndex: number;
  onFocus: (index: number) => void;
  reviewFor: (fieldPath: string) => FieldReview | undefined;
  evidenceJson: Record<string, unknown> | null;
  editingField: string | null;
  editingValue: string;
  onEditingValue: (value: string) => void;
  commentDrafts: Record<string, string>;
  onCommentDraft: (draft: Record<string, string>) => void;
  onAccept: (fieldPath: string) => void;
  onUncertain: (fieldPath: string) => void;
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
          const hasEvidence = Boolean(evidenceJson && evidenceJson[field.fieldPath]);
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
                <span className={`status-badge ${confidenceTone(review?.confidence ?? null)}`}>{formatConfidence(review?.confidence ?? null)}</span>
                <span className={`status-badge ${hasEvidence ? 'tone-success' : 'tone-neutral'}`}>{hasEvidence ? 'evidence' : 'no evidence'}</span>
                <span className={`status-badge ${decisionTone(review?.decision ?? null)}`}>{review?.decision ?? 'unreviewed'}</span>
              </div>
              <p className="muted">{stringifyValue(field.value).slice(0, 120)}</p>
              {editingField === field.fieldPath ? (
                <div className="filters-row">
                  <input className="input" value={editingValue} onChange={(event) => onEditingValue(event.target.value)} />
                  <button type="button" className="action-button variant-primary" onClick={() => onSaveEdit(field.fieldPath)}>
                    Save
                  </button>
                </div>
              ) : null}
              <div className="stack">
                <label className="muted" htmlFor={`comment-${field.fieldPath}`}>Field note</label>
                <input
                  id={`comment-${field.fieldPath}`}
                  className="input"
                  value={commentDrafts[field.fieldPath] ?? review?.reviewerComment ?? ''}
                  onChange={(event) => onCommentDraft({ ...commentDrafts, [field.fieldPath]: event.target.value })}
                  placeholder="Add reviewer rationale"
                />
              </div>
              <div className="filters-row">
                <button type="button" className="action-button variant-secondary" onClick={() => onAccept(field.fieldPath)}>
                  Accept
                </button>
                <button type="button" className="action-button variant-secondary" onClick={() => onEdit(field.fieldPath)}>
                  Edit
                </button>
                <button type="button" className="action-button variant-secondary" onClick={() => onUncertain(field.fieldPath)}>
                  Mark uncertain
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
  validationSummary,
  canRollback
}: {
  eventId: string | null;
  matchedEvent: Record<string, unknown> | null;
  diffFields: DiffField[];
  mergeStrategy: 'create_new' | 'merge_existing';
  onMergeStrategy: (strategy: 'create_new' | 'merge_existing') => void;
  hasMatchedEvent: boolean;
  publishResult: { blockers: string[]; warnings: string[] } | null;
  validationSummary: { blockers: string[]; warnings: string[] };
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

        <ValidationSummaryPanel validationSummary={publishResult ?? validationSummary} />

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
