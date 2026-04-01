import { err, ok } from '@/lib/api/response';
import { acceptInvite, mapAcceptInviteErrorToStatus } from '@/lib/invites/accept-invite';
import { checkRateLimit, recordFailure } from '@/lib/auth-rate-limit';

export async function POST(req: Request) {
  let payload: unknown;

  try {
    payload = await req.json();
  } catch {
    return err('Invalid payload', 'VALIDATION_ERROR', 400);
  }

  const token =
    typeof (payload as Record<string, unknown>)?.token === 'string'
      ? ((payload as Record<string, unknown>).token as string)
      : 'invalid';

  const rateCheck = checkRateLimit(`invite:${token}`);
  if (!rateCheck.allowed) {
    return err('Too many attempts', 'RATE_LIMITED', 429);
  }

  const result = await acceptInvite(payload);
  if (!result.ok) {
    recordFailure(`invite:${token}`);
    return err(result.message, result.code, mapAcceptInviteErrorToStatus(result.code));
  }

  return ok({ success: true });
}
