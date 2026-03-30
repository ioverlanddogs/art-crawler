'use client';

import type { RefObject } from 'react';

export type ModerationFilters = {
  q: string;
  platform: string;
  status: string;
  confidence: string;
};

export function ModerationFilterBar({
  filters,
  platforms,
  onChange,
  searchInputRef
}: {
  filters: ModerationFilters;
  platforms: string[];
  onChange: (next: Partial<ModerationFilters>) => void;
  searchInputRef: RefObject<HTMLInputElement>;
}) {
  return (
    <div className="filters-row moderation-filter-grid">
      <label className="stack">
        <span className="muted">Search</span>
        <input
          ref={searchInputRef}
          className="input"
          value={filters.q}
          placeholder="Search title or URL (/)"
          onChange={(event) => onChange({ q: event.target.value })}
        />
      </label>

      <label className="stack">
        <span className="muted">Platform</span>
        <select className="select" value={filters.platform} onChange={(event) => onChange({ platform: event.target.value })}>
          <option value="all">All platforms</option>
          {platforms.map((platform) => (
            <option key={platform} value={platform}>
              {platform}
            </option>
          ))}
        </select>
      </label>

      <label className="stack">
        <span className="muted">Status</span>
        <select className="select" value={filters.status} onChange={(event) => onChange({ status: event.target.value })}>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="all">All statuses</option>
        </select>
      </label>

      <label className="stack">
        <span className="muted">Confidence</span>
        <select className="select" value={filters.confidence} onChange={(event) => onChange({ confidence: event.target.value })}>
          <option value="all">All bands</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </label>
    </div>
  );
}
