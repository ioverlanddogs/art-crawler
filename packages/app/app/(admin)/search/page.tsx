import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/admin';
import { requireRole } from '@/lib/auth-guard';
import SearchClient from './SearchClient';

export const dynamic = 'force-dynamic';

export default async function SearchPage() {
  try {
    await requireRole(['operator', 'admin']);
  } catch {
    redirect('/login');
  }

  return (
    <div className="stack">
      <PageHeader
        title="Custom search"
        description="Search the web for arts and culture event pages, then push selected URLs through the intake pipeline."
      />
      <SearchClient />
    </div>
  );
}
