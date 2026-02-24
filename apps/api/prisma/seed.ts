import 'dotenv/config';
import { PrismaClient, Role, CampusStageKind } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const seedDemoData = ['1', 'true', 'yes', 'on'].includes((process.env.SEED_DEMO_DATA ?? '').toLowerCase());

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: { name: 'Demo Tenant' },
    create: { slug: 'demo', name: 'Demo Tenant' },
  });

  const passwordHash = await bcrypt.hash('Password123!', 10);

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.local' } },
    update: { roles: [Role.Admin], passwordHash },
    create: {
      tenantId: tenant.id,
      email: 'admin@demo.local',
      passwordHash,
      roles: [Role.Admin],
    },
  });

  const hr = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'hr@demo.local' } },
    update: { roles: [Role.HR], passwordHash },
    create: {
      tenantId: tenant.id,
      email: 'hr@demo.local',
      passwordHash,
      roles: [Role.HR],
    },
  });

  const interviewer = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'interviewer@demo.local' } },
    update: { roles: [Role.Interviewer], passwordHash },
    create: {
      tenantId: tenant.id,
      email: 'interviewer@demo.local',
      passwordHash,
      roles: [Role.Interviewer],
    },
  });

  if (seedDemoData) {
    const college = await prisma.college.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: 'ABC' } },
      update: { name: 'ABC Engineering College' },
      create: { tenantId: tenant.id, code: 'ABC', name: 'ABC Engineering College' },
    });

    const job = await prisma.jobRequisition.create({
      data: {
        tenantId: tenant.id,
        title: 'Software Engineer (Campus)',
        description: 'Entry-level SWE role for campus hiring',
      },
    });

    const flow = await prisma.campusHiringFlow.create({
      data: {
        tenantId: tenant.id,
        collegeId: college.id,
        name: 'Default Campus Flow',
        batchSize: 100,
        version: 1,
        stages: {
          create: [
            {
              key: 'gd',
              name: 'Group Discussion',
              kind: CampusStageKind.GD_OFFLINE,
              order: 0,
              config: { metrics: ['communication', 'leadership', 'confidence'] },
            },
            {
              key: 'ai_interview',
              name: 'AI Interview',
              kind: CampusStageKind.AI_INTERVIEW,
              order: 1,
              config: { model: 'qwen', durationMinutes: 20 },
            },
            {
              key: 'tech_round_1',
              name: 'Tech Round 1 (Online)',
              kind: CampusStageKind.TECH_ROUND_ONLINE,
              order: 2,
              config: {},
            },
          ],
        },
        transitions: {
          create: [
            {
              fromStageKey: 'gd',
              toStageKey: 'ai_interview',
              condition: { shortlisted: true },
            },
            {
              fromStageKey: 'ai_interview',
              toStageKey: 'tech_round_1',
              condition: { scoreGte: 0.6 },
            },
          ],
        },
      },
    });

    await prisma.campusBatch.create({
      data: {
        tenantId: tenant.id,
        collegeId: college.id,
        jobId: job.id,
        flowId: flow.id,
        name: 'ABC - 2026 Batch',
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorUserId: admin.id,
      action: 'seed.completed',
      entityType: 'Tenant',
      entityId: tenant.id,
      meta: { hrUserId: hr.id, interviewerUserId: interviewer.id, seedDemoData },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
