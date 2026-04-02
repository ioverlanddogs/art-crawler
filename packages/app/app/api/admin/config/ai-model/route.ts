import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';
import { authFailure, err, ok } from '@/lib/api/response';
import { PROVIDER_MODELS } from '@/lib/ai/provider-selector';

const allModelIds = Object.values(PROVIDER_MODELS).flatMap((models) =>
  models.map((model) => model.id)
);

const schema = z.object({
  model: z.string().refine((value) => allModelIds.includes(value), {
    message: 'Unknown model ID'
  })
});

export async function POST(req: Request) {
  try {
    await requireRole(['admin']);
  } catch (e) {
    return authFailure(e);
  }

  const contentType = req.headers.get('content-type') ?? '';
  let model: string | null = null;

  if (contentType.includes('application/json')) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return err('Invalid payload', 'VALIDATION_ERROR', 400);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) return err('Unknown model ID', 'VALIDATION_ERROR', 400);
    model = parsed.data.model;
  } else {
    const formData = await req.formData().catch(() => null);
    model = formData?.get('model')?.toString() ?? null;

    if (!model || !allModelIds.includes(model)) {
      return err('Unknown model ID', 'VALIDATION_ERROR', 400);
    }
  }

  await prisma.siteSetting.upsert({
    where: { key: 'ai_extraction_model' },
    create: { key: 'ai_extraction_model', value: model },
    update: { value: model }
  });

  if (!contentType.includes('application/json')) {
    return Response.redirect(new URL('/system', req.url).toString(), 303);
  }

  return ok({ model });
}

export async function GET(_req: Request) {
  try {
    await requireRole(['admin', 'operator']);
  } catch (e) {
    return authFailure(e);
  }

  const setting = await prisma.siteSetting.findUnique({ where: { key: 'ai_extraction_model' } });
  return ok({ model: setting?.value ?? null });
}
