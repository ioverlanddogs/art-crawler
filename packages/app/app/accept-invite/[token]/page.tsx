import { prisma } from '@/lib/db';

export default async function AcceptInvite({ params }: { params: { token: string } }) {
  const invite = await prisma.invite.findUnique({ where: { token: params.token } });
  if (!invite) return <p>Invalid invite.</p>;

  return (
    <main>
      <h1>Invite details</h1>
      <p>{invite.email}</p>
      <p>Role: {invite.role}</p>
      <p>This invite token is valid and can be used for account onboarding.</p>
    </main>
  );
}
