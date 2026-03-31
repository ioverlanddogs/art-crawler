export interface PublishGateResult {
  ready: boolean;
  blockers: string[];
  warnings: string[];
}

export type ProposedChangeSetWithReviews = {
  proposedDataJson: Record<string, unknown> | null;
  fieldReviews: Array<{ fieldPath: string; decision: string | null; confidence: number | null }>;
};

export function checkPublishReadiness(proposedChangeSet: ProposedChangeSetWithReviews): PublishGateResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const proposedData = proposedChangeSet.proposedDataJson ?? {};
  const reviewsByField = new Map(
    proposedChangeSet.fieldReviews.map((review) => [review.fieldPath, review])
  );

  for (const requiredField of ['title', 'startAt'] as const) {
    const review = reviewsByField.get(requiredField);
    const hasValue = Object.prototype.hasOwnProperty.call(proposedData, requiredField) && proposedData[requiredField] != null;
    const isRejected = review?.decision === 'rejected';

    if (!hasValue || isRejected) {
      blockers.push(`Required field '${requiredField}' is missing or rejected.`);
    }
  }

  const unreviewedCount = proposedChangeSet.fieldReviews.filter((review) => review.decision == null).length;
  if (unreviewedCount > 0) {
    blockers.push(`${unreviewedCount} field(s) have not been reviewed.`);
  }

  for (const review of proposedChangeSet.fieldReviews) {
    if (review.decision === 'accepted' && review.confidence != null && review.confidence < 0.5) {
      warnings.push(`Low-confidence field accepted: ${review.fieldPath}.`);
    }
  }

  return {
    ready: blockers.length === 0,
    blockers,
    warnings
  };
}
