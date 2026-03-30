'use client';

import { useEffect } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export type ToastMessage = {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
};

export function Toast({
  message,
  onDismiss
}: {
  message: ToastMessage;
  onDismiss?: (id: string) => void;
}) {
  useEffect(() => {
    if (!onDismiss || message.tone === 'error') return;
    const timeout = window.setTimeout(() => onDismiss(message.id), 4000);
    return () => window.clearTimeout(timeout);
  }, [message.id, message.tone, onDismiss]);

  return (
    <div className={`toast toast-${message.tone}`} role="status" aria-live={message.tone === 'error' ? 'assertive' : 'polite'}>
      <div>
        <p className="toast-title">{message.title}</p>
        {message.description ? <p className="toast-description">{message.description}</p> : null}
      </div>
      {onDismiss ? (
        <button type="button" className="toast-dismiss" onClick={() => onDismiss(message.id)} aria-label="Dismiss message">
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

export function ToastRegion({
  messages,
  onDismiss
}: {
  messages: ToastMessage[];
  onDismiss?: (id: string) => void;
}) {
  if (!messages.length) return null;
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="false">
      {messages.map((message) => (
        <Toast key={message.id} message={message} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
