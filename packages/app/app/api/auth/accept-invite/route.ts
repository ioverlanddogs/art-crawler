import { err, ok } from '@/lib/api/response';
import { acceptInvite, mapAcceptInviteErrorToStatus } from '@/lib/invites/accept-invite';

export async function POST(req: Request) {
  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return err('Invalid payload', 'VALIDATION_ERROR', 400);
  }

  const result = await acceptInvite(payload);
  if (!result.ok) {
    return err(result.message, result.code, mapAcceptInviteErrorToStatus(result.code));
  }

  return ok({ success: true });
}
