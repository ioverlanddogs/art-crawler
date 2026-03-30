'use client';

import { useId } from 'react';

type ScopeOption = {
  id: string;
  label: string;
  level: 'tenant' | 'team' | 'global';
  description: string;
};

export function TenantScopeSelector({
  options,
  selected,
  onChange
}: {
  options: ScopeOption[];
  selected: string;
  onChange: (scopeId: string) => void;
}) {
  const id = useId();

  const selectedOption = options.find((option) => option.id === selected);

  return (
    <div className="tenant-selector" role="region" aria-label="Tenant or workspace scope selector">
      <label htmlFor={id} className="muted tenant-selector-label">
        Workspace scope
      </label>
      <select id={id} className="select" value={selected} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="kpi-note">{selectedOption?.description ?? 'Scope description unavailable.'}</p>
    </div>
  );
}
