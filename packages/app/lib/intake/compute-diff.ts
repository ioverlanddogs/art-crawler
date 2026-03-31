export type DiffFieldState = 'added' | 'updated' | 'unchanged' | 'conflicting' | 'rejected';

export interface DiffField {
  fieldPath: string;
  proposedValue: unknown;
  canonicalValue: unknown;
  state: DiffFieldState;
}

export interface DiffResult {
  fields: DiffField[];
  hasConflicts: boolean;
  addedCount: number;
  updatedCount: number;
  unchangedCount: number;
}

export function computeDiff(
  proposed: Record<string, unknown>,
  canonical: Record<string, unknown> | null
): DiffResult {
  const fields: DiffField[] = [];

  for (const [fieldPath, proposedValue] of Object.entries(proposed)) {
    const canonicalHasField = canonical ? Object.prototype.hasOwnProperty.call(canonical, fieldPath) : false;
    const canonicalValue = canonicalHasField ? canonical?.[fieldPath] : null;

    let state: DiffFieldState;
    if (!canonical || !canonicalHasField) {
      state = 'added';
    } else if (serializeStable(proposedValue) === serializeStable(canonicalValue)) {
      state = 'unchanged';
    } else {
      state = 'updated';
    }

    fields.push({
      fieldPath,
      proposedValue,
      canonicalValue,
      state
    });
  }

  return {
    fields,
    hasConflicts: fields.some((field) => field.state === 'conflicting'),
    addedCount: fields.filter((field) => field.state === 'added').length,
    updatedCount: fields.filter((field) => field.state === 'updated').length,
    unchangedCount: fields.filter((field) => field.state === 'unchanged').length
  };
}

function serializeStable(value: unknown): string {
  return JSON.stringify(value);
}
