const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(email: string): { allowed: boolean; retryAfterSeconds?: number } {
  const entry = attempts.get(email);

  if (!entry || Date.now() >= entry.resetAt) {
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - Date.now()) / 1000)
    };
  }

  return { allowed: true };
}

export function recordFailure(email: string): void {
  const entry = attempts.get(email);

  if (!entry || Date.now() >= entry.resetAt) {
    attempts.set(email, { count: 1, resetAt: Date.now() + WINDOW_MS });
    return;
  }

  attempts.set(email, { count: entry.count + 1, resetAt: entry.resetAt });
}

export function resetRateLimit(email: string): void {
  attempts.delete(email);
}
