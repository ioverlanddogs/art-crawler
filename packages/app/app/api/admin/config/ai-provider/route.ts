import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';
import { authFailure, err, ok } from '@/lib/api/response';
import { z } from 'zod';

const schema = z.object({
  provider: z.enum(['anthropic', 'openai', 'gemini'])
});

export async function POST(req: Request) {
  try {
    await requireRole(['admin']);
  } catch (error) {
    return authFailure(error);
  }

  const contentType = req.headers.get('content-type')?.toLowerCase() ?? '';
  const isJsonRequest = contentType.includes('application/json');

  let provider: unknown;
  if (isJsonRequest) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return err('Invalid payload', 'VALIDATION_ERROR', 400);
    }

    const parsedBody = schema.safeParse(body);
    if (!parsedBody.success) {
      return err('provider must be anthropic, openai, or gemini', 'VALIDATION_ERROR', 400);
    }

    provider = parsedBody.data.provider;
  } else {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return err('Invalid payload', 'VALIDATION_ERROR', 400);
    }

    const formProvider = formData.get('provider');
    if (
      typeof formProvider !== 'string' ||
      !['anthropic', 'openai', 'gemini'].includes(formProvider)
    ) {
      return err('provider must be anthropic, openai, or gemini', 'VALIDATION_ERROR', 400);
    }

    provider = formProvider;
  }

  const parsed = schema.safeParse({ provider });
  if (!parsed.success) {
    return err('provider must be anthropic, openai, or gemini', 'VALIDATION_ERROR', 400);
  }

  await prisma.siteSetting.upsert({
    where: { key: 'ai_extraction_provider' },
    create: { key: 'ai_extraction_provider', value: parsed.data.provider },
    update: { value: parsed.data.provider }
  });

  if (!isJsonRequest) {
    return Response.redirect(new URL('/system', req.url), 303);
  }

  return ok({ provider: parsed.data.provider });
}

export async function GET(_req: Request) {
  try {
    await requireRole(['admin', 'operator']);
  } catch (error) {
    return authFailure(error);
  }

  const setting = await prisma.siteSetting.findUnique({
    where: { key: 'ai_extraction_provider' }
  });

  return ok({ provider: setting?.value ?? 'anthropic' });
}
