import { PrismaClient } from '@/lib/prisma-client';
import { getMissingDatabaseEnvVars } from '@/lib/runtime-env';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const missingEnvVars = getMissingDatabaseEnvVars();
  if (missingEnvVars.length > 0) {
    throw new Error(`Prisma client is unavailable. Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }

  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
  });

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client;
  }

  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = createPrismaClient();
    return Reflect.get(client, property, receiver);
  }
});
