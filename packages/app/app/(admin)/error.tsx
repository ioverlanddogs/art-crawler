'use client';

import { ActionButton, EmptyState, PageHeader, SectionCard } from '@/components/admin';

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <div className="stack">
      <PageHeader title="Error" description="An error occurred while loading this admin view." />
      <SectionCard title="Error State" subtitle="Retry loading this page or return later.">
        <EmptyState
          title="Could not load page"
          description="The admin page failed to load due to an unexpected server error."
          action={<ActionButton onClick={reset}>Try Again</ActionButton>}
        />
      </SectionCard>
    </div>
  );
}
