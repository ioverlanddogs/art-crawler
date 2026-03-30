import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';
import { authFailure, err, ok } from '@/lib/api/response';
import { getAppBaseUrl } from '@/lib/env';

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['viewer', 'moderator', 'operator', 'admin']),
  message: z.string().optional()
});

export async function POST(req: Request) {
  let session;
  try {
    session = await requireRole(['admin']);
  } catch (error) {
    return authFailure(error);
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return err('Invalid payload', 'VALIDATION_ERROR', 400);

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const user = await prisma.adminUser.upsert({
    where: { email: parsed.data.email },
    update: { name: parsed.data.name, role: parsed.data.role, status: 'PENDING' },
    create: {
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      status: 'PENDING',
      createdById: session.user.id
    }
  });

  await prisma.adminInvite.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt
    }
  });

  const inviteUrl = `${getAppBaseUrl()}/accept-invite/${rawToken}`;
  console.log(`Invite URL for ${parsed.data.email}: ${inviteUrl}`);

  return ok({ inviteUrl });
}
