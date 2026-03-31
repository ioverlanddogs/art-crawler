#!/usr/bin/env node
import { execSync } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../packages/app/generated/prisma/index.js';

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

run(`docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE artio_app;" || true`);
run(`docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE artio_mining;" || true`);

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('artio-admin-demo', 12);

  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@artio.io' },
    update: { role: 'admin', status: 'ACTIVE', passwordHash, name: 'Artio Admin' },
    create: {
      email: 'admin@artio.io',
      name: 'Artio Admin',
      role: 'admin',
      status: 'ACTIVE',
      passwordHash
    }
  });

  const venueOne = await prisma.venueProfile.upsert({
    where: { domain: 'venue-one.london' },
    update: { name: 'Venue One', region: 'london', status: 'ACTIVE' },
    create: {
      domain: 'venue-one.london',
      name: 'Venue One',
      region: 'london',
      eventsPageUrl: 'https://venue-one.london/events',
      status: 'ACTIVE'
    }
  });

  const venueTwo = await prisma.venueProfile.upsert({
    where: { domain: 'venue-two.london' },
    update: { name: 'Venue Two', region: 'london', status: 'ACTIVE' },
    create: {
      domain: 'venue-two.london',
      name: 'Venue Two',
      region: 'london',
      eventsPageUrl: 'https://venue-two.london/events',
      status: 'ACTIVE'
    }
  });

  await prisma.siteSetting.upsert({
    where: { key: 'mining_import_enabled' },
    update: { value: 'true' },
    create: { key: 'mining_import_enabled', value: 'true' }
  });

  await prisma.discoveryTemplate.create({
    data: {
      region: 'london',
      template: 'london art exhibitions',
      source: 'manual',
      status: 'ACTIVE',
      alpha: 1,
      beta: 1,
      totalJobs: 0
    }
  }).catch(() => {});

  await prisma.pipelineConfigVersion.upsert({
    where: { region_version: { region: 'london', version: 1 } },
    update: { status: 'ACTIVE', configJson: { enabled: true }, activatedBy: admin.id, activatedAt: new Date() },
    create: {
      region: 'london',
      version: 1,
      status: 'ACTIVE',
      configJson: { enabled: true },
      changeReason: 'seed',
      activatedBy: admin.id,
      activatedAt: new Date(),
      createdBy: admin.id
    }
  });

  await prisma.ingestExtractedEvent.deleteMany({ where: { source: 'mining-service-v1' } });

  const levels = [85, 72, 55, 48, 30];
  for (let i = 0; i < levels.length; i += 1) {
    const score = levels[i];
    const domain = i % 2 === 0 ? venueOne.domain : venueTwo.domain;
    await prisma.ingestExtractedEvent.create({
      data: {
        region: 'london',
        title: `Demo Event ${i + 1}`,
        startAt: new Date(Date.now() + (i + 1) * 86400000),
        timezone: 'Europe/London',
        locationText: domain,
        artistNames: ['Artist A', 'Artist B'],
        sourceUrl: `https://${domain}/events/${i + 1}`,
        imageUrl: 'https://picsum.photos/200',
        confidenceScore: score,
        confidenceBand: score >= 75 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW',
        fingerprint: `seed-fingerprint-${i + 1}`,
        source: 'mining-service-v1',
        status: 'PENDING',
        miningConfidenceScore: score,
        miningObservationCount: 1,
        miningCrossSourceCount: i % 3
      }
    });
  }

  console.log('Seed complete for admin@artio.io / artio-admin-demo');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
