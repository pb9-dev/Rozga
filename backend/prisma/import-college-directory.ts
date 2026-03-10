import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

function extractParenId(input: string) {
  // Matches: "... (Id: U-0003)" or "... (Id: C-39230)"
  const m = input.match(/\(Id:\s*([A-Za-z]-\d+)\)\s*$/);
  return m ? m[1] : null;
}

function stripParenId(input: string) {
  return input.replace(/\s*\(Id:\s*[A-Za-z]-\d+\)\s*$/, '').trim();
}

async function main() {
  const args = process.argv.slice(2);
  const fileArgIndex = args.findIndex((a) => a === '--file' || a === '-f');
  const filePath = fileArgIndex >= 0 ? args[fileArgIndex + 1] : args[0];
  if (!filePath) {
    throw new Error('Usage: node -r ts-node/register prisma/import-college-directory.ts --file <path-to-csv> (or provide the file path as the first argument)');
  }

  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) throw new Error(`CSV not found: ${abs}`);

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  let processed = 0;
  let upserted = 0;

  const batch: Array<{
    id: string;
    universityId?: string;
    universityName: string;
    collegeId?: string;
    collegeName: string;
    collegeType?: string;
    stateName?: string;
    districtName?: string;
  }> = [];

  function flushBatch() {
    if (!batch.length) return Promise.resolve();
    const toWrite = batch.splice(0, batch.length);

    // Use createMany where possible for speed; fall back to per-row upsert if needed.
    return prisma.$transaction(
      toWrite.map((row) =>
        prisma.collegeDirectoryEntry.upsert({
          where: { id: row.id },
          create: row,
          update: {
            universityId: row.universityId,
            universityName: row.universityName,
            collegeId: row.collegeId,
            collegeName: row.collegeName,
            collegeType: row.collegeType,
            stateName: row.stateName,
            districtName: row.districtName,
          },
        }),
      ),
    );
  }

  const parser = fs
    .createReadStream(abs)
    .pipe(
      parse({
        columns: true,
        relax_quotes: true,
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
      }),
    );

  for await (const record of parser as AsyncIterable<Record<string, string>>) {
    processed++;

    const uniRaw = String(record['University Name'] ?? '').trim();
    const collegeRaw = String(record['College Name'] ?? '').trim();

    const universityId = extractParenId(uniRaw) ?? undefined;
    const collegeId = extractParenId(collegeRaw) ?? undefined;

    const universityName = stripParenId(uniRaw);
    const collegeName = stripParenId(collegeRaw);

    const id = collegeId ?? `${universityId ?? 'U-UNKNOWN'}::${collegeName.toLowerCase()}`;

    batch.push({
      id,
      universityId,
      universityName,
      collegeId,
      collegeName,
      collegeType: String(record['College Type'] ?? '').trim() || undefined,
      stateName: String(record['State Name'] ?? '').trim() || undefined,
      districtName: String(record['District Name'] ?? '').trim() || undefined,
    });

    if (batch.length >= 500) {
      await flushBatch();
      upserted += 500;
      if (processed % 5000 === 0) {
        // eslint-disable-next-line no-console
        console.log(`processed ${processed} rows...`);
      }
    }
  }

  if (batch.length) {
    await flushBatch();
    upserted += batch.length;
  }

  // eslint-disable-next-line no-console
  console.log(`done: processed=${processed} upserted~=${upserted}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
