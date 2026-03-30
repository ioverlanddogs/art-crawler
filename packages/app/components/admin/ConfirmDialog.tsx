'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActionButton } from './ActionButton';

export function ConfirmDialog({
  open,
  title,
  body,
  tone = 'default',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmToken,
  reasonRequired = false,
  submitting = false,
  onCancel,
  onConfirm,
  children
}: {
  open: boolean;
  title: string;
  body: string;
  tone?: 'default' | 'danger';
  confirmLabel?: string;
  cancelLabel?: string;
  confirmToken?: string;
  reasonRequired?: boolean;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (payload: { reason?: string; confirmText?: string }) => void;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const isValid = useMemo(() => {
    if (reasonRequired && reason.trim().length < 8) return false;
    if (confirmToken && confirmText.trim() !== confirmToken) return false;
    return true;
  }, [confirmText, confirmToken, reason, reasonRequired]);

  useEffect(() => {
    if (!open) return;
    const previousActiveElement = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, textarea, input, [href], select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousActiveElement?.focus();
      setReason('');
      setConfirmText('');
      setValidationError(null);
    };
  }, [onCancel, open]);

  if (!open) return null;

  function submitConfirm() {
    if (!isValid) {
      if (reasonRequired && reason.trim().length < 8) {
        setValidationError('Provide at least 8 characters of reason before confirming.');
        return;
      }
      if (confirmToken && confirmText.trim() !== confirmToken) {
        setValidationError(`Type ${confirmToken} to continue.`);
        return;
      }
    }
    setValidationError(null);
    onConfirm({ reason: reason.trim() || undefined, confirmText: confirmText.trim() || undefined });
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        ref={dialogRef}
        className={`dialog dialog-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p className="muted">{body}</p>
        {reasonRequired ? (
          <label className="stack">
            <span className="muted">Reason (required)</span>
            <textarea
              className="input"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Provide incident/ticket/context for this sensitive action."
            />
          </label>
        ) : null}
        {children}
        {confirmToken ? (
          <label className="stack">
            <span className="muted">Type {confirmToken} to confirm</span>
            <input
              className="input"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={confirmToken}
            />
          </label>
        ) : null}
        {validationError ? (
          <p className="dialog-error" role="alert">
            {validationError}
          </p>
        ) : null}
        <div className="dialog-actions">
          <button ref={cancelButtonRef} type="button" className="action-button variant-secondary" onClick={onCancel} disabled={submitting}>
            {cancelLabel}
          </button>
          <ActionButton variant={tone === 'danger' ? 'danger' : 'primary'} disabled={!isValid} submitting={submitting} onClick={submitConfirm}>
            {confirmLabel}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
