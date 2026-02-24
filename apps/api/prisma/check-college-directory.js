require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const count = await prisma.collegeDirectoryEntry.count();
  console.log('collegeDirectoryEntry count', count);

  await prisma.$disconnect();
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
