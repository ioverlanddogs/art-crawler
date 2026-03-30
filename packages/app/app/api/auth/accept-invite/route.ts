import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { err, ok } from '@/lib/api/response';

const schema = z.object({
  token: z.string().min(1),
  name: z.string().min(1),
  password: z.string().min(12),
  confirmPassword: z.string().min(12)
}).refine((input) => input.password === input.confirmPassword, {
  message: 'Passwords must match',
  path: ['confirmPassword']
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return err('Invalid payload', 'VALIDATION_ERROR', 400);

  const tokenHash = crypto.createHash('sha256').update(parsed.data.token).digest('hex');
  const invite = await prisma.adminInvite.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return err('Invite invalid or expired', 'INVALID_INVITE', 400);
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: invite.userId },
      data: { name: parsed.data.name, passwordHash, status: 'ACTIVE' }
    }),
    prisma.adminInvite.update({ where: { id: invite.id }, data: { usedAt: new Date() } })
  ]);

  return ok({ success: true });
}
