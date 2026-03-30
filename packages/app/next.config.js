/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  experimental: {
    staleTimes: {
      dynamic: 0
    }
  }
};
module.exports = nextConfig;
