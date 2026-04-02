import { z } from 'zod';
import { requireRole } from '@/lib/auth-guard';
import { authFailure, err } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import { getActiveSearchProvider } from '@/lib/search/provider-selector';

export const dynamic = 'force-dynamic';

const schema = z.object({
  region: z.string().min(1).max(100),
  maxResults: z.number().int().min(1).max(20).default(10)
});

export async function POST(req: Request) {
  try {
    await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('Invalid payload', 'VALIDATION_ERROR', 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return err('region is required (max 100 chars)', 'VALIDATION_ERROR', 400);
  }

  const provider = await getActiveSearchProvider(prisma);
  if (!provider) {
    return err(
      'No search provider configured. Add BRAVE_SEARCH_API_KEY or GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID in Vercel environment variables.',
      'NO_SEARCH_PROVIDER',
      503
    );
  }

  const query = `contemporary art galleries ${parsed.data.region}`;
  const results = await provider.search(query, parsed.data.maxResults);

  return Response.json({
    region: parsed.data.region,
    query,
    provider: provider.name,
    results,
    total: results.length
  });
}
