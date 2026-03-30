import { z } from 'zod';

const responseSchema = z.object({ batchId: z.string(), inserted: z.number() });

export async function sendImportBatch(payload: unknown) {
  const res = await fetch(process.env.PIPELINE_IMPORT_URL!, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.MINING_IMPORT_SECRET}`
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Import failed ${res.status}`);
  return responseSchema.parse(await res.json());
}
