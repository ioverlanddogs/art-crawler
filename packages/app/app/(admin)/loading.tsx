import { PageHeader, SectionCard } from '@/components/admin';

export default function AdminLoading() {
  return (
    <div className="stack">
      <PageHeader title="Loading" description="Fetching admin data…" />
      <SectionCard title="Loading State" subtitle="Please wait while data is retrieved.">
        <p className="muted">Loading…</p>
      </SectionCard>
    </div>
  );
}
