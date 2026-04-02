import { z } from 'zod';
import { authFailure, err, ok } from '@/lib/api/response';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

const schema = z.object({ provider: z.enum(['brave', 'google_cse']) });

export async function POST(req: Request) {
  try {
    await requireRole(['admin']);
  } catch (e) {
    return authFailure(e);
  }

  const contentType = req.headers.get('content-type') ?? '';
  let provider: string | null = null;

  if (contentType.includes('application/json')) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return err('Invalid payload', 'VALIDATION_ERROR', 400);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return err('provider must be brave or google_cse', 'VALIDATION_ERROR', 400);
    provider = parsed.data.provider;
  } else {
    const formData = await req.formData().catch(() => null);
    provider = formData?.get('provider')?.toString() ?? null;
    if (!provider || !['brave', 'google_cse'].includes(provider)) {
      return err('provider must be brave or google_cse', 'VALIDATION_ERROR', 400);
    }
  }

  await prisma.siteSetting.upsert({
    where: { key: 'search_provider' },
    create: { key: 'search_provider', value: provider },
    update: { value: provider }
  });

  if (!contentType.includes('application/json')) {
    return Response.redirect(new URL('/system', req.url).toString(), 303);
  }
  return ok({ provider });
}

export async function GET(_req: Request) {
  try {
    await requireRole(['admin', 'operator']);
  } catch (e) {
    return authFailure(e);
  }
  const setting = await prisma.siteSetting.findUnique({ where: { key: 'search_provider' } });
  return ok({ provider: setting?.value ?? 'brave' });
}
