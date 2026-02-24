import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type { CreateCandidateDto } from './dto/create-candidate.dto';

@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async getFirstStageKeyForBatch(params: { tenantId: string; batchId: string }) {
    const batch = await this.prisma.campusBatch.findFirst({
      where: { id: params.batchId, tenantId: params.tenantId },
      select: {
        id: true,
        flow: {
          select: {
            id: true,
            stages: { orderBy: { order: 'asc' }, select: { key: true, order: true } },
          },
        },
      },
    });
    const first = batch?.flow?.stages?.[0]?.key;
    return first ?? null;
  }

  async list(params: { tenantId: string; batchId?: string }) {
    const { tenantId, batchId } = params;
    return this.prisma.candidate.findMany({
      where: {
        tenantId,
        ...(batchId ? { batchId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        stageStates: {
          orderBy: [{ updatedAt: 'desc' }],
          take: 1,
        },
      },
    });
  }

  async listProgression(params: { tenantId: string; batchId?: string }) {
    const { tenantId, batchId } = params;

    const candidates = await this.prisma.candidate.findMany({
      where: {
        tenantId,
        ...(batchId ? { batchId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        stageStates: true,
        batch: {
          select: {
            id: true,
            name: true,
            flow: {
              select: {
                id: true,
                name: true,
                version: true,
                stages: { orderBy: { order: 'asc' }, select: { key: true, name: true, kind: true, order: true } },
                transitions: { select: { fromStageKey: true, toStageKey: true } },
              },
            },
          },
        },
      },
    });

    return candidates.map((c) => {
      const flow = c.batch.flow;
      const firstStageKey = flow?.stages?.[0]?.key;

      const active = c.stageStates.find((s) => s.status === 'ACTIVE');
      const currentStageKey = active?.stageKey ?? c.stageStates.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]?.stageKey ?? firstStageKey ?? null;

      const possibleNextStageKeys = currentStageKey
        ? flow.transitions.filter((t) => t.fromStageKey === currentStageKey).map((t) => t.toStageKey)
        : [];

      return {
        id: c.id,
        fullName: c.fullName,
        email: c.email,
        phone: c.phone,
        department: c.department,
        createdAt: c.createdAt,
        batch: c.batch,
        currentStageKey,
        possibleNextStageKeys,
      };
    });
  }

  async create(params: { tenantId: string; actorUserId: string; dto: CreateCandidateDto }) {
    const { tenantId, actorUserId, dto } = params;

    const batch = await this.prisma.campusBatch.findFirst({
      where: { id: dto.batchId, tenantId },
      select: { id: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');

    const created = await this.prisma.candidate.create({
      data: {
        tenantId,
        batchId: dto.batchId,
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        rollNumber: dto.rollNumber,
        department: dto.department,
        resumeUrl: dto.resumeUrl,
        normalized: ((dto.normalized ?? {}) as Record<string, unknown>) as Prisma.InputJsonValue,
      },
    });

    const firstStageKey = await this.getFirstStageKeyForBatch({ tenantId, batchId: dto.batchId });
    if (firstStageKey) {
      await this.prisma.candidateStageState.upsert({
        where: { candidateId_stageKey: { candidateId: created.id, stageKey: firstStageKey } },
        update: { status: 'ACTIVE' },
        create: { candidateId: created.id, stageKey: firstStageKey, status: 'ACTIVE' },
      });
    }

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.candidate.create',
      entityType: 'Candidate',
      entityId: created.id,
      meta: { batchId: dto.batchId, fullName: created.fullName },
    });

    return created;
  }

  async import(params: { tenantId: string; actorUserId: string; candidates: unknown[] }) {
    const { tenantId, actorUserId, candidates } = params;

    const firstStageKeyByBatch = new Map<string, string | null>();

    // Minimal skeleton: expects each item to match CreateCandidateDto-like shape.
    const created: string[] = [];
    for (const item of candidates) {
      if (typeof item !== 'object' || item === null) {
        throw new BadRequestException('Invalid candidate item');
      }
      const obj = item as Record<string, unknown>;
      const batchId = String(obj.batchId ?? '');
      const fullName = String(obj.fullName ?? '');
      if (!batchId || !fullName) {
        throw new BadRequestException('Each candidate must include batchId and fullName');
      }

      const batch = await this.prisma.campusBatch.findFirst({
        where: { id: batchId, tenantId },
        select: { id: true },
      });
      if (!batch) throw new NotFoundException(`Batch not found: ${batchId}`);

      const c = await this.prisma.candidate.create({
        data: {
          tenantId,
          batchId,
          fullName,
          email: obj.email ? String(obj.email) : undefined,
          phone: obj.phone ? String(obj.phone) : undefined,
          rollNumber: obj.rollNumber ? String(obj.rollNumber) : undefined,
          department: obj.department ? String(obj.department) : undefined,
          resumeUrl: obj.resumeUrl ? String(obj.resumeUrl) : undefined,
          normalized: ((obj.normalized ?? {}) as Record<string, unknown>) as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      if (!firstStageKeyByBatch.has(batchId)) {
        firstStageKeyByBatch.set(
          batchId,
          await this.getFirstStageKeyForBatch({ tenantId, batchId }),
        );
      }
      const firstStageKey = firstStageKeyByBatch.get(batchId);
      if (firstStageKey) {
        await this.prisma.candidateStageState.upsert({
          where: { candidateId_stageKey: { candidateId: c.id, stageKey: firstStageKey } },
          update: { status: 'ACTIVE' },
          create: { candidateId: c.id, stageKey: firstStageKey, status: 'ACTIVE' },
        });
      }

      created.push(c.id);
    }

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.candidate.import',
      entityType: 'Candidate',
      meta: { count: created.length },
    });

    return { ok: true, createdCount: created.length, candidateIds: created };
  }

  async transition(params: {
    tenantId: string;
    actorUserId: string;
    candidateId: string;
    toStageKey: string;
  }) {
    const { tenantId, actorUserId, candidateId, toStageKey } = params;

    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, tenantId },
      include: {
        stageStates: true,
        batch: {
          select: {
            id: true,
            flow: {
              select: {
                id: true,
                stages: { orderBy: { order: 'asc' }, select: { key: true } },
                transitions: { select: { fromStageKey: true, toStageKey: true } },
              },
            },
          },
        },
      },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    const flow = candidate.batch.flow;
    const firstStageKey = flow?.stages?.[0]?.key ?? null;
    const active = candidate.stageStates.find((s) => s.status === 'ACTIVE');
    const currentStageKey = active?.stageKey ?? firstStageKey;
    if (!currentStageKey) throw new BadRequestException('Candidate has no current stage');

    const possible = flow.transitions.filter((t) => t.fromStageKey === currentStageKey).map((t) => t.toStageKey);
    if (!possible.includes(toStageKey)) {
      throw new BadRequestException(`Invalid transition from ${currentStageKey} to ${toStageKey}`);
    }

    const stageExists = flow.stages.some((s) => s.key === toStageKey);
    if (!stageExists) throw new BadRequestException('Target stage does not exist in flow');

    await this.prisma.$transaction(async (tx) => {
      await tx.candidateStageState.updateMany({
        where: { candidateId, stageKey: currentStageKey, status: 'ACTIVE' },
        data: { status: 'DONE' },
      });

      await tx.candidateStageState.upsert({
        where: { candidateId_stageKey: { candidateId, stageKey: toStageKey } },
        update: { status: 'ACTIVE' },
        create: { candidateId, stageKey: toStageKey, status: 'ACTIVE' },
      });
    });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.candidate.transition',
      entityType: 'Candidate',
      entityId: candidateId,
      meta: { fromStageKey: currentStageKey, toStageKey },
    });

    return { ok: true, candidateId, fromStageKey: currentStageKey, toStageKey };
  }

  async getOne(params: { tenantId: string; candidateId: string }) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: params.candidateId, tenantId: params.tenantId },
      include: {
        stageStates: { orderBy: [{ updatedAt: 'desc' }] },
        batch: {
          include: {
            college: true,
            job: true,
            flow: { include: { stages: { orderBy: { order: 'asc' } }, transitions: true } },
          },
        },
        gdMemberships: {
          include: { gdGroup: { select: { id: true, name: true } } },
        },
        gdEvaluations: {
          orderBy: [{ createdAt: 'desc' }],
          include: { gdGroup: { select: { id: true, name: true } }, evaluator: { select: { id: true, email: true } } },
        },
        interviews: {
          orderBy: [{ createdAt: 'desc' }],
          include: {
            interviewer: { select: { id: true, email: true } },
            feedback: true,
          },
        },
        aiArtifacts: { orderBy: [{ createdAt: 'desc' }] },
      },
    });

    if (!candidate) throw new NotFoundException('Candidate not found');

    const flowStages = candidate.batch.flow?.stages ?? [];
    const active = candidate.stageStates.find((s) => s.status === 'ACTIVE');
    const currentStageKey = active?.stageKey ?? flowStages[0]?.key ?? null;
    const stage = currentStageKey ? flowStages.find((s) => s.key === currentStageKey) : null;
    const stageUpdatedAt = active?.updatedAt ?? null;

    const daysInStage = stageUpdatedAt
      ? Math.floor((Date.now() - stageUpdatedAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const pendingInterviewFeedback = candidate.interviews.filter((a) => !a.feedback).length;

    return {
      ...candidate,
      insights: {
        currentStageKey,
        currentStageName: stage?.name ?? null,
        daysInStage,
        pendingInterviewFeedback,
      },
    };
  }

  async delete(params: { tenantId: string; actorUserId: string; candidateId: string }) {
    const { tenantId, actorUserId, candidateId } = params;

    const existing = await this.prisma.candidate.findFirst({
      where: { id: candidateId, tenantId },
      select: { id: true, fullName: true, batchId: true },
    });
    if (!existing) throw new NotFoundException('Candidate not found');

    await this.prisma.candidate.delete({ where: { id: candidateId } });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.candidate.delete',
      entityType: 'Candidate',
      entityId: candidateId,
      meta: { batchId: existing.batchId, fullName: existing.fullName },
    });

    return { ok: true, candidateId };
  }

  async bulkDelete(params: { tenantId: string; actorUserId: string; candidateIds: string[] }) {
    const { tenantId, actorUserId, candidateIds } = params;
    if (!candidateIds.length) throw new BadRequestException('candidateIds is required');

    const existing = await this.prisma.candidate.findMany({
      where: { tenantId, id: { in: candidateIds } },
      select: { id: true },
    });

    if (existing.length !== candidateIds.length) {
      const found = new Set(existing.map((c) => c.id));
      const missing = candidateIds.filter((id) => !found.has(id));
      throw new NotFoundException(`Some candidates were not found: ${missing.slice(0, 10).join(', ')}`);
    }

    const deleted = await this.prisma.candidate.deleteMany({
      where: { tenantId, id: { in: candidateIds } },
    });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.candidate.bulkDelete',
      entityType: 'Candidate',
      meta: { count: deleted.count, candidateIds: candidateIds.slice(0, 50) },
    });

    return { ok: true, deletedCount: deleted.count };
  }

  async bulkTransition(params: {
    tenantId: string;
    actorUserId: string;
    candidateIds: string[];
    toStageKey: string;
  }) {
    const { tenantId, actorUserId, candidateIds, toStageKey } = params;
    if (!candidateIds.length) throw new BadRequestException('candidateIds is required');
    if (!toStageKey.trim()) throw new BadRequestException('toStageKey is required');

    const candidates = await this.prisma.candidate.findMany({
      where: { tenantId, id: { in: candidateIds } },
      include: {
        stageStates: true,
        batch: {
          select: {
            id: true,
            flow: {
              select: {
                stages: { orderBy: { order: 'asc' }, select: { key: true } },
                transitions: { select: { fromStageKey: true, toStageKey: true } },
              },
            },
          },
        },
      },
    });

    if (candidates.length !== candidateIds.length) {
      const found = new Set(candidates.map((c) => c.id));
      const missing = candidateIds.filter((id) => !found.has(id));
      throw new NotFoundException(`Some candidates not found: ${missing.slice(0, 5).join(', ')}`);
    }

    const invalid: { candidateId: string; currentStageKey: string | null }[] = [];
    const resolved: { candidateId: string; fromStageKey: string; batchId: string }[] = [];

    for (const c of candidates) {
      const flow = c.batch.flow;
      const firstStageKey = flow?.stages?.[0]?.key ?? null;
      const active = c.stageStates.find((s) => s.status === 'ACTIVE');
      const currentStageKey = active?.stageKey ?? firstStageKey;
      if (!currentStageKey) {
        invalid.push({ candidateId: c.id, currentStageKey: null });
        continue;
      }

      const possible = flow.transitions.filter((t) => t.fromStageKey === currentStageKey).map((t) => t.toStageKey);
      if (!possible.includes(toStageKey)) {
        invalid.push({ candidateId: c.id, currentStageKey });
        continue;
      }

      resolved.push({ candidateId: c.id, fromStageKey: currentStageKey, batchId: c.batch.id });
    }

    if (invalid.length) {
      throw new BadRequestException({
        message: 'Some candidates cannot transition to that stage',
        invalidCount: invalid.length,
        invalid,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      for (const r of resolved) {
        await tx.candidateStageState.updateMany({
          where: { candidateId: r.candidateId, stageKey: r.fromStageKey, status: 'ACTIVE' },
          data: { status: 'DONE' },
        });

        await tx.candidateStageState.upsert({
          where: { candidateId_stageKey: { candidateId: r.candidateId, stageKey: toStageKey } },
          update: { status: 'ACTIVE' },
          create: { candidateId: r.candidateId, stageKey: toStageKey, status: 'ACTIVE' },
        });
      }
    });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.candidate.bulkTransition',
      entityType: 'Candidate',
      meta: { count: candidateIds.length, toStageKey },
    });

    return { ok: true, movedCount: candidateIds.length, toStageKey };
  }

  async setResumeUrl(params: {
    tenantId: string;
    actorUserId: string;
    candidateId: string;
    resumeUrl: string;
  }) {
    const { tenantId, actorUserId, candidateId, resumeUrl } = params;

    const existing = await this.prisma.candidate.findFirst({
      where: { id: candidateId, tenantId },
      select: { id: true, fullName: true, batchId: true },
    });
    if (!existing) throw new NotFoundException('Candidate not found');

    await this.prisma.candidate.update({
      where: { id: candidateId },
      data: { resumeUrl },
    });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.candidate.resume.upload',
      entityType: 'Candidate',
      entityId: candidateId,
      meta: { resumeUrl, batchId: existing.batchId, fullName: existing.fullName },
    });

    return { ok: true, candidateId, resumeUrl };
  }
}
