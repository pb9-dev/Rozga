import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';

type DirectoryCollege = {
  name: string;
  countryCode?: string;
  stateName?: string;
  districtName?: string;
  universityName?: string;
  collegeType?: string;
};

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

function codeFromName(name: string) {
  const cleaned = normalizeName(name)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .trim();

  const parts = cleaned.split(/\s+/g).filter(Boolean);
  if (!parts.length) return 'COL';

  const initials = parts.slice(0, 5).map((p) => p[0]).join('');
  const joined = parts.join('');

  const base = (initials.length >= 3 ? initials : joined).slice(0, 8);
  return base || 'COL';
}

function shortHash(input: string) {
  // tiny non-crypto hash for uniqueness suffix
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).toUpperCase().slice(0, 5);
}

@Injectable()
export class CollegesService {
  private readonly cache = new Map<string, { expiresAt: number; items: DirectoryCollege[] }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async search(params: { tenantId: string; q: string; limit?: number }) {
    const q = normalizeName(params.q);
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);

    const db = await this.prisma.college.findMany({
      where: {
        tenantId: params.tenantId,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ name: 'asc' }],
      take: limit,
      select: { id: true, name: true, code: true },
    });

    let directory: DirectoryCollege[] = [];
    let directoryError: string | null = null;
    let directoryAvailable = true;

    if (q.length >= 2) {
      try {
        directory = await this.searchDirectory(q);
      } catch (e) {
        directoryAvailable = false;
        directoryError = e instanceof Error ? e.message : 'College directory unavailable';
      }
    }

    const dbResults = db.map((c) => ({ source: 'db' as const, id: c.id, name: c.name, code: c.code }));
    const directoryResults = directory.map((c) => ({ source: 'directory' as const, ...c }));

    return {
      q,
      db: dbResults.slice(0, limit),
      directory: directoryResults.slice(0, limit),
      directoryAvailable,
      directoryError,
    };
  }

  async bulkImport(params: { tenantId: string; actorUserId: string; colleges: Array<{ name: string; code?: string }> }) {
    const max = 500;
    const input = params.colleges.slice(0, max).map((c) => ({
      name: normalizeName(c.name),
      code: c.code ? normalizeName(c.code).toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20) : undefined,
    }));

    const unique = new Map<string, { name: string; code?: string }>();
    for (const c of input) {
      if (!c.name || c.name.length < 2) continue;
      const k = `${c.code ?? ''}|${c.name.toLowerCase()}`;
      if (!unique.has(k)) unique.set(k, c);
    }

    let created = 0;
    let skipped = 0;

    for (const c of unique.values()) {
      const existing = await this.prisma.college.findFirst({
        where: {
          tenantId: params.tenantId,
          OR: [
            ...(c.code ? [{ code: c.code }] : []),
            { name: { equals: c.name, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const code = c.code ?? (await this.generateUniqueCode(params.tenantId, c.name));
      try {
        await this.prisma.college.create({
          data: { tenantId: params.tenantId, name: c.name, code },
          select: { id: true },
        });
        created++;
      } catch {
        skipped++;
      }
    }

    await this.audit.log({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: 'campus.college.bulkImport',
      entityType: 'College',
      entityId: 'bulk',
      meta: { created, skipped, received: params.colleges.length },
    });

    return { created, skipped, received: params.colleges.length, max };
  }

  async ensure(params: { tenantId: string; actorUserId: string; name: string; countryCode?: string; state?: string }) {
    const name = normalizeName(params.name);

    const existing = await this.prisma.college.findFirst({
      where: { tenantId: params.tenantId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true, name: true, code: true },
    });
    if (existing) return existing;

    const code = await this.generateUniqueCode(params.tenantId, name);

    const created = await this.prisma.college.create({
      data: {
        tenantId: params.tenantId,
        name,
        code,
      },
      select: { id: true, name: true, code: true },
    });

    await this.audit.log({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: 'campus.college.create',
      entityType: 'College',
      entityId: created.id,
      meta: { name: created.name, code: created.code, countryCode: params.countryCode, state: params.state },
    });

    return created;
  }

  private async generateUniqueCode(tenantId: string, name: string) {
    const base = codeFromName(name);
    const suffixSeed = shortHash(name);

    const candidates = [base, `${base}-${suffixSeed}`, `${base}${suffixSeed}`];

    for (const code of candidates) {
      const exists = await this.prisma.college.findFirst({ where: { tenantId, code }, select: { id: true } });
      if (!exists) return code;
    }

    for (let i = 1; i <= 20; i++) {
      const code = `${base}-${i}`;
      const exists = await this.prisma.college.findFirst({ where: { tenantId, code }, select: { id: true } });
      if (!exists) return code;
    }

    return `${base}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
  }

  private async searchDirectory(q: string): Promise<DirectoryCollege[]> {
    const cacheKey = `dbdir:${q.toLowerCase()}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.items;

    // Local DB-backed directory (imported from CSV).
    const rows = await this.prisma.collegeDirectoryEntry.findMany({
      where: {
        OR: [
          { collegeName: { contains: q, mode: 'insensitive' } },
          { universityName: { contains: q, mode: 'insensitive' } },
          { stateName: { contains: q, mode: 'insensitive' } },
          { districtName: { contains: q, mode: 'insensitive' } },
          { collegeType: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ collegeName: 'asc' }],
      take: 25,
      select: {
        collegeName: true,
        stateName: true,
        districtName: true,
        universityName: true,
        collegeType: true,
      },
    });

    if (!rows.length) {
      // Directory exists but is empty/unimported.
      return [];
    }

    const items: DirectoryCollege[] = rows.map((r) => ({
      name: normalizeName(r.collegeName),
      countryCode: 'IN',
      stateName: r.stateName ?? undefined,
      districtName: r.districtName ?? undefined,
      universityName: r.universityName ?? undefined,
      collegeType: r.collegeType ?? undefined,
    }));

    this.cache.set(cacheKey, { expiresAt: now + 10 * 60 * 1000, items });
    return items;
  }
}
