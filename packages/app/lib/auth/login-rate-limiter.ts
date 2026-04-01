import { prisma } from '@/lib/db';

const MAX_ATTEMPTS = 10;
const WINDOW_SECONDS = 15 * 60; // 15 minutes

function bucketKey(email: string): string {
  return `login_attempts:${email.toLowerCase().trim()}`;
}

function windowKey(email: string): string {
  return `login_window:${email.toLowerCase().trim()}`;
}

export async function isLoginRateLimited(email: string): Promise<boolean> {
  const key = bucketKey(email);
  const windowKeyStr = windowKey(email);
  const now = Date.now();

  const [countSetting, windowSetting] = await Promise.all([
    prisma.siteSetting.findUnique({ where: { key } }),
    prisma.siteSetting.findUnique({ where: { key: windowKeyStr } })
  ]);

  const windowStart = windowSetting ? parseInt(windowSetting.value, 10) : 0;
  const windowExpiry = windowStart + WINDOW_SECONDS * 1000;

  if (now > windowExpiry) {
    return false;
  }

  const attempts = countSetting ? parseInt(countSetting.value, 10) : 0;
  return attempts >= MAX_ATTEMPTS;
}

export async function recordLoginAttempt(email: string): Promise<void> {
  const key = bucketKey(email);
  const windowKeyStr = windowKey(email);
  const now = Date.now();

  const windowSetting = await prisma.siteSetting.findUnique({
    where: { key: windowKeyStr }
  });

  const windowStart = windowSetting ? parseInt(windowSetting.value, 10) : 0;
  const isExpired = now > windowStart + WINDOW_SECONDS * 1000;

  if (isExpired) {
    await prisma.siteSetting.upsert({
      where: { key: windowKeyStr },
      update: { value: String(now) },
      create: { key: windowKeyStr, value: String(now) }
    });
    await prisma.siteSetting.upsert({
      where: { key },
      update: { value: '1' },
      create: { key, value: '1' }
    });
    return;
  }

  const countSetting = await prisma.siteSetting.findUnique({ where: { key } });
  const count = countSetting ? parseInt(countSetting.value, 10) : 0;
  await prisma.siteSetting.upsert({
    where: { key },
    update: { value: String(count + 1) },
    create: { key, value: '1' }
  });
}

export async function clearLoginAttempts(email: string): Promise<void> {
  const key = bucketKey(email);
  const windowKeyStr = windowKey(email);
  await Promise.allSettled([
    prisma.siteSetting.delete({ where: { key } }).catch(() => null),
    prisma.siteSetting.delete({ where: { key: windowKeyStr } }).catch(() => null)
  ]);
}
