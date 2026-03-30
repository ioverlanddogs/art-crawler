import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const schema = z.object({ email: z.string().email(), role: z.enum(['ADMIN', 'REVIEWER', 'ANALYST']) });

export async function POST(req: Request) {
  const body = schema.parse(await req.json());
  const invite = await prisma.invite.create({
    data: {
      email: body.email,
      role: body.role,
      token: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 7 * 86400000),
      senderId: (await prisma.user.findFirst())?.id ?? (await prisma.user.create({ data: { email: 'admin@example.com', role: 'ADMIN' } })).id
    }
  });
  return NextResponse.json(invite);
}
