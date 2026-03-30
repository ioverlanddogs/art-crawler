import { prisma } from '@/lib/db';

export default async function AcceptInvitePage({ params }: { params: { token: string } }) {
  const invite = await prisma.invite.findUnique({ where: { token: params.token } });
  if (!invite) return <p>Invalid invite.</p>;
  return (
    <div>
      <h1>Invite</h1>
      <p>{invite.email}</p>
      <p>Role: {invite.role}</p>
      <p>TODO: complete password setup flow.</p>
    </div>
  );
}
