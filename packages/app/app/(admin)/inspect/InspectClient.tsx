'use client';

import { useEffect, useRef, useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface FetchResult {
  url: string;
  httpStatus: number;
  contentType: string | null;
  extractedText: string;
  rawHtmlLength: number;
  platformType: string;
  requiresJs: boolean;
  platformConfidence: string;
  platformSignals: string[];
  fetchedAt: string;
}

const MODES = [
  { value: 'events', label: "Events / What's On" },
  { value: 'artists', label: 'Artists' },
  { value: 'artworks', label: 'Artworks' },
  { value: 'gallery', label: 'Gallery / Venue' },
  { value: 'auto', label: 'Auto-detect' },
] as const;

function detectRecommendedMode(messages: Message[]): string {
  const allText = messages
    .filter((m) => m.role === 'assistant')
    .map((m) => m.content.toLowerCase())
    .join(' ');

  if (
    allText.includes('recommended mode: artists') ||
    allText.includes("mode is 'artists'") ||
    allText.includes('mode: artists')
  )
    return 'artists';
  if (
    allText.includes('recommended mode: artworks') ||
    allText.includes("mode is 'artworks'") ||
    allText.includes('mode: artworks')
  )
    return 'artworks';
  if (
    allText.includes('recommended mode: gallery') ||
    allText.includes("mode is 'gallery'") ||
    allText.includes('mode: gallery')
  )
    return 'gallery';
  if (allText.includes('recommended mode: auto') || allText.includes("mode is 'auto'")) return 'auto';
  if (
    allText.includes('recommended mode: events') ||
    allText.includes("mode is 'events'") ||
    allText.includes('mode: events')
  )
    return 'events';
  return 'events';
}

function formatContent(content: string) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```')) {
      const code = part.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
      return (
        <pre
          key={i}
          style={{
            background: 'var(--surface-muted)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '10px 14px',
            fontSize: 12,
            overflowX: 'auto',
            margin: '8px 0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          <code>{code}</code>
        </pre>
      );
    }

    return (
      <span key={i} style={{ whiteSpace: 'pre-wrap' }}>
        {part}
      </span>
    );
  });
}

export default function InspectClient() {
  const [urlInput, setUrlInput] = useState('');
  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<string>('events');
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<{ jobId: string } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionPreview, setExtractionPreview] = useState<{
    extractedFields: Record<string, unknown>;
    confidence: Record<string, number>;
    evidence: Record<string, unknown>;
    warnings: string[];
    modelVersion: string;
    parserVersion: string;
    mode: string;
  } | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<{
    ingestionJobId: string;
    proposedChangeSetId: string;
    reviewStatus: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  useEffect(() => {
    if (messages.length > 0) {
      setSelectedMode(detectRecommendedMode(messages));
    }
  }, [messages]);

  async function handleFetch(e: React.FormEvent) {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setFetching(true);
    setFetchError(null);
    setFetchResult(null);
    setMessages([]);
    setIngestResult(null);
    setChatError(null);

    try {
      const res = await fetch('/api/admin/inspect/fetch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFetchError(data?.error ?? 'Failed to fetch URL.');
        return;
      }

      setFetchResult(data);

      const openingMessage: Message = {
        role: 'user',
        content: 'What is on this page and what data can be extracted from it? What extraction mode do you recommend?',
      };
      setMessages([openingMessage]);
      await sendToChat([openingMessage], data);
    } catch {
      setFetchError('Network error. Please try again.');
    } finally {
      setFetching(false);
    }
  }

  async function sendToChat(history: Message[], result: FetchResult) {
    if (!result) return;

    setStreaming(true);
    setChatError(null);
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/admin/inspect/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: result.url,
          extractedText: result.extractedText,
          platformType: result.platformType,
          messages: history,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setChatError(data?.error ?? 'Chat request failed.');
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);

          try {
            const parsed = JSON.parse(data) as { text?: string; done?: boolean };
            if (parsed.text) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + parsed.text,
                  };
                }
                return updated;
              });
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch (error: unknown) {
      setChatError(error instanceof Error ? error.message : 'Streaming failed.');
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setStreaming(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!userInput.trim() || !fetchResult || streaming) return;

    const newMessage: Message = { role: 'user', content: userInput.trim() };
    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setUserInput('');
    await sendToChat(updatedMessages, fetchResult);
  }

  async function handleIngest() {
    if (!fetchResult || ingesting) return;

    setIngesting(true);
    setIngestResult(null);

    try {
      const res = await fetch('/api/admin/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: fetchResult.url,
          recordTypeOverride: selectedMode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChatError(data?.error ?? 'Failed to push to intake.');
        return;
      }

      setIngestResult({ jobId: data.ingestionJobId });
    } catch {
      setChatError('Network error during ingest.');
    } finally {
      setIngesting(false);
    }
  }

  async function handleExtract() {
    if (!fetchResult || extracting) return;
    setExtracting(true);
    setExtractionPreview(null);
    setEditedFields({});
    setCommitResult(null);

    try {
      const res = await fetch('/api/admin/inspect/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: fetchResult.url,
          extractedText: fetchResult.extractedText,
          mode: selectedMode,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChatError(data?.error ?? 'Extraction preview failed.');
        return;
      }
      setExtractionPreview(data);
      const initial: Record<string, string> = {};
      for (const [key, value] of Object.entries(data.extractedFields as Record<string, unknown>)) {
        if (Array.isArray(value)) {
          initial[key] = value.join(', ');
        } else if (value !== null && value !== undefined) {
          initial[key] = String(value);
        } else {
          initial[key] = '';
        }
      }
      setEditedFields(initial);
    } catch {
      setChatError('Network error during extraction preview.');
    } finally {
      setExtracting(false);
    }
  }

  async function handleCommit() {
    if (!fetchResult || !extractionPreview || committing) return;
    setCommitting(true);
    setCommitResult(null);

    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(editedFields)) {
      const trimmed = value.trim();
      if (trimmed === '') continue;
      const arrayFields = ['artistNames', 'representativeWorks', 'currentExhibitions'];
      if (arrayFields.includes(key)) {
        fields[key] = trimmed
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        fields[key] = trimmed;
      }
    }

    try {
      const res = await fetch('/api/admin/inspect/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: fetchResult.url,
          mode: selectedMode,
          modelVersion: extractionPreview.modelVersion,
          fields,
          confidence: extractionPreview.confidence,
          evidence: extractionPreview.evidence,
          humanReviewed: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChatError(data?.error ?? 'Commit failed.');
        return;
      }
      setCommitResult(data);
    } catch {
      setChatError('Network error during commit.');
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="stack">
      <form onSubmit={handleFetch} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>URL to inspect</label>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://gallery.example.com/exhibitions"
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: 14,
              borderRadius: 6,
              border: '1px solid var(--border)',
            }}
            disabled={fetching}
          />
        </div>
        <button
          type="submit"
          disabled={fetching || !urlInput.trim()}
          style={{
            padding: '8px 20px',
            fontSize: 14,
            borderRadius: 6,
            border: 'none',
            background: 'var(--primary)',
            color: '#fff',
            cursor: fetching || !urlInput.trim() ? 'not-allowed' : 'pointer',
            opacity: fetching || !urlInput.trim() ? 0.6 : 1,
          }}
        >
          {fetching ? 'Fetching…' : 'Fetch and analyse'}
        </button>
      </form>

      {fetchError ? (
        <p
          role="alert"
          style={{
            color: 'var(--danger)',
            padding: '10px 14px',
            background: 'var(--danger-soft)',
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          {fetchError}
        </p>
      ) : null}

      {fetchResult ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            padding: '10px 14px',
            background: 'var(--surface-muted)',
            borderRadius: 6,
            fontSize: 13,
            border: '1px solid var(--border)',
          }}
        >
          <span>
            <strong>URL:</strong> {fetchResult.url}
          </span>
          <span>
            <strong>HTTP:</strong> {fetchResult.httpStatus}
          </span>
          <span>
            <strong>Platform:</strong> {fetchResult.platformType} ({fetchResult.platformConfidence})
          </span>
          {fetchResult.requiresJs ? <span style={{ color: 'var(--warning)' }}>⚠ Requires JS</span> : null}
          <span>
            <strong>HTML:</strong> {Math.round(fetchResult.rawHtmlLength / 1024)}KB
          </span>
        </div>
      ) : null}

      {fetchResult ? (
        <section className="section-card">
          <header className="section-card-header">
            <div>
              <h2>AI analysis</h2>
              <p>Ask anything about the page content and extraction options.</p>
            </div>
          </header>

          <div
            style={{
              minHeight: 300,
              maxHeight: 520,
              overflowY: 'auto',
              padding: '8px 0',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontSize: 14,
                    lineHeight: 1.6,
                    background: msg.role === 'user' ? 'var(--primary)' : 'var(--surface-muted)',
                    color: msg.role === 'user' ? '#fff' : 'var(--text)',
                    border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  }}
                >
                  {msg.content.length === 0 && streaming ? (
                    <span style={{ opacity: 0.5 }}>Thinking…</span>
                  ) : (
                    formatContent(msg.content)
                  )}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{msg.role === 'user' ? 'You' : 'AI'}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {chatError ? (
            <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>
              {chatError}
            </p>
          ) : null}

          <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Ask about the page, request an extraction preview, suggest a mode…"
              disabled={streaming}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: 14,
                borderRadius: 6,
                border: '1px solid var(--border)',
              }}
            />
            <button
              type="submit"
              disabled={streaming || !userInput.trim()}
              style={{
                padding: '8px 16px',
                fontSize: 14,
                borderRadius: 6,
                border: 'none',
                background: 'var(--primary)',
                color: '#fff',
                cursor: streaming || !userInput.trim() ? 'not-allowed' : 'pointer',
                opacity: streaming || !userInput.trim() ? 0.6 : 1,
              }}
            >
              {streaming ? '…' : 'Send'}
            </button>
          </form>
        </section>
      ) : null}

      {fetchResult && messages.length > 1 ? (
        <section className="section-card">
          <header className="section-card-header">
            <div>
              <h2>Commit to pipeline</h2>
              <p>Choose how to send this URL through the pipeline.</p>
            </div>
          </header>

          <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Extract as</label>
              <select
                value={selectedMode}
                onChange={(e) => {
                  setSelectedMode(e.target.value);
                  setExtractionPreview(null);
                  setEditedFields({});
                  setCommitResult(null);
                }}
                style={{
                  padding: '7px 10px',
                  fontSize: 14,
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                }}
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!extractionPreview && !commitResult ? (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div
                style={{
                  flex: 1,
                  minWidth: 200,
                  padding: '14px 16px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                }}
              >
                <p style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Quick push</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Send directly to intake pipeline. AI will extract fields automatically.
                </p>
                {ingestResult ? (
                  <p style={{ color: 'var(--success)', fontSize: 13, fontWeight: 500 }}>
                    ✓ Queued.{' '}
                    <a href={`/intake/${ingestResult.jobId}`} style={{ color: 'var(--primary)' }}>
                      View intake job →
                    </a>
                  </p>
                ) : (
                  <button
                    onClick={handleIngest}
                    disabled={ingesting}
                    style={{
                      padding: '7px 16px',
                      fontSize: 13,
                      borderRadius: 6,
                      border: 'none',
                      background: 'var(--primary)',
                      color: '#fff',
                      cursor: ingesting ? 'not-allowed' : 'pointer',
                      opacity: ingesting ? 0.6 : 1,
                    }}
                  >
                    {ingesting ? 'Pushing…' : 'Push to intake →'}
                  </button>
                )}
              </div>

              <div
                style={{
                  flex: 1,
                  minWidth: 200,
                  padding: '14px 16px',
                  borderRadius: 6,
                  border: '1px solid var(--primary)',
                  background: 'var(--primary-soft)',
                }}
              >
                <p style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>Preview and edit fields</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                  See what the AI extracts, edit any fields, then commit. Recommended for trusted sources.
                </p>
                <button
                  onClick={handleExtract}
                  disabled={extracting}
                  style={{
                    padding: '7px 16px',
                    fontSize: 13,
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--primary)',
                    color: '#fff',
                    cursor: extracting ? 'not-allowed' : 'pointer',
                    opacity: extracting ? 0.6 : 1,
                  }}
                >
                  {extracting ? 'Extracting…' : 'Preview extraction →'}
                </button>
              </div>
            </div>
          ) : null}

          {extractionPreview && !commitResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: 'var(--surface-muted)',
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <span>
                  <strong>Model:</strong> {extractionPreview.modelVersion}
                  {' · '}
                  <strong>Mode:</strong> {extractionPreview.mode}
                  {extractionPreview.warnings.length > 0 ? ` · ⚠ ${extractionPreview.warnings.join(', ')}` : null}
                </span>
                <button
                  onClick={() => {
                    setExtractionPreview(null);
                    setEditedFields({});
                  }}
                  style={{
                    fontSize: 12,
                    padding: '3px 10px',
                    borderRadius: 4,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    cursor: 'pointer',
                  }}
                >
                  ← Back
                </button>
              </div>

              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Review and edit the extracted fields below. Changes are committed as-is — what you see is what enters the
                pipeline.
              </p>

              <div style={{ display: 'grid', gap: 12 }}>
                {Object.entries(editedFields).map(([key, value]) => {
                  const conf = extractionPreview.confidence[key];
                  const confColor =
                    conf === undefined
                      ? 'var(--text-muted)'
                      : conf >= 0.7
                        ? 'var(--success)'
                        : conf >= 0.4
                          ? 'var(--warning)'
                          : 'var(--danger)';
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <label style={{ fontSize: 13, fontWeight: 500 }}>{key}</label>
                        {conf !== undefined ? (
                          <span style={{ fontSize: 11, color: confColor }}>{Math.round(conf * 100)}% confidence</span>
                        ) : null}
                      </div>
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setEditedFields((prev) => ({ ...prev, [key]: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          fontSize: 13,
                          borderRadius: 6,
                          border: `1px solid ${conf !== undefined && conf < 0.4 ? 'var(--warning)' : 'var(--border)'}`,
                          background: 'var(--surface)',
                        }}
                      />
                      {extractionPreview.evidence[key] ? (
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                          Evidence: {String(extractionPreview.evidence[key]).slice(0, 120)}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {Object.keys(editedFields).length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  No fields were extracted. The page may require JavaScript rendering or a different extraction mode.
                </p>
              ) : null}

              <div style={{ display: 'flex', gap: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={handleCommit}
                  disabled={committing || Object.keys(editedFields).length === 0}
                  style={{
                    padding: '8px 20px',
                    fontSize: 14,
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--primary)',
                    color: '#fff',
                    cursor: committing || Object.keys(editedFields).length === 0 ? 'not-allowed' : 'pointer',
                    opacity: committing || Object.keys(editedFields).length === 0 ? 0.6 : 1,
                  }}
                >
                  {committing ? 'Committing…' : 'Commit to pipeline →'}
                </button>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
                  Committed as human-reviewed · goes straight to moderation as in_review
                </p>
              </div>
            </div>
          ) : null}

          {commitResult ? (
            <div style={{ padding: '14px 16px', background: 'var(--success-soft)', borderRadius: 6 }}>
              <p style={{ fontWeight: 500, color: 'var(--success)', marginBottom: 6 }}>✓ Committed successfully</p>
              <p style={{ fontSize: 13, color: 'var(--text)' }}>
                Review status: <strong>{commitResult.reviewStatus}</strong>
                {' · '}
                <a href={`/intake/${commitResult.ingestionJobId}`} style={{ color: 'var(--primary)' }}>
                  View intake job →
                </a>
                {' · '}
                <a href={`/workbench/${commitResult.proposedChangeSetId}`} style={{ color: 'var(--primary)' }}>
                  Open in workbench →
                </a>
              </p>
            </div>
          ) : null}

          {chatError ? (
            <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>
              {chatError}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
