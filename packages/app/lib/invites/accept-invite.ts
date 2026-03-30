import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1),
  password: z.string().min(12),
  confirmPassword: z.string().min(12)
}).refine((input) => input.password === input.confirmPassword, {
  message: 'Passwords must match',
  path: ['confirmPassword']
});

type ParsedAcceptInviteInput = z.infer<typeof acceptInviteSchema>;

type InviteRecord = {
  id: string;
  userId: string;
  usedAt: Date | null;
  expiresAt: Date;
  user: { name: string | null };
};

type AcceptInviteDeps = {
  prisma: Pick<typeof prisma, '$transaction' | 'adminInvite' | 'adminUser'>;
  hashPassword: (password: string) => Promise<string>;
  now: () => Date;
};

const defaultDeps: AcceptInviteDeps = {
  prisma,
  hashPassword: (password) => bcrypt.hash(password, 12),
  now: () => new Date()
};

export type AcceptInviteErrorCode = 'VALIDATION_ERROR' | 'INVALID_INVITE' | 'INTERNAL_ERROR';

export type AcceptInviteResult =
  | { ok: true }
  | { ok: false; code: AcceptInviteErrorCode; message: string };

export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function findPendingInviteByToken(
  token: string,
  deps: Pick<AcceptInviteDeps, 'prisma' | 'now'> = defaultDeps
): Promise<InviteRecord | null> {
  const invite = await deps.prisma.adminInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { user: true }
  });

  if (!invite || invite.usedAt || invite.expiresAt <= deps.now()) {
    return null;
  }

  return invite;
}

export async function acceptInvite(
  input: unknown,
  deps: Partial<AcceptInviteDeps> = {}
): Promise<AcceptInviteResult> {
  const resolvedDeps: AcceptInviteDeps = {
    prisma: deps.prisma ?? defaultDeps.prisma,
    hashPassword: deps.hashPassword ?? defaultDeps.hashPassword,
    now: deps.now ?? defaultDeps.now
  };

  const parsed = acceptInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Invalid payload' };
  }

  try {
    const invite = await findPendingInviteByToken(parsed.data.token, resolvedDeps);
    if (!invite) {
      return { ok: false, code: 'INVALID_INVITE', message: 'Invite invalid or expired' };
    }

    const passwordHash = await resolvedDeps.hashPassword(parsed.data.password);
    const acceptedAt = resolvedDeps.now();

    await resolvedDeps.prisma.$transaction([
      resolvedDeps.prisma.adminUser.update({
        where: { id: invite.userId },
        data: { name: parsed.data.name, passwordHash, status: 'ACTIVE' }
      }),
      resolvedDeps.prisma.adminInvite.update({ where: { id: invite.id }, data: { usedAt: acceptedAt } })
    ]);

    return { ok: true };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', message: 'Unable to accept invite right now' };
  }
}

export function mapAcceptInviteErrorToStatus(code: AcceptInviteErrorCode): number {
  if (code === 'VALIDATION_ERROR') return 400;
  if (code === 'INVALID_INVITE') return 400;
  return 500;
}

export function mapAcceptInviteErrorToUiMessage(code: AcceptInviteErrorCode): string {
  if (code === 'VALIDATION_ERROR') {
    return 'Please check your name and password fields and try again.';
  }

  if (code === 'INVALID_INVITE') {
    return 'This invite is expired, already used, or invalid.';
  }

  return 'We could not activate your account due to a server error. Please try again.';
}

export type AcceptInviteInput = ParsedAcceptInviteInput;
