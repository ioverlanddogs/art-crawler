import { prisma } from '@/lib/db';

export default async function Page() {
  const candidateCount = await prisma.candidate.count();
  return (
    <section>
      <h1>Moderation</h1>
      <p>Candidate count: {candidateCount}</p>
    </section>
  );
}
