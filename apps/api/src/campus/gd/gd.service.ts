import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, type Prisma } from '@prisma/client';
import { GDEvaluationSchema } from '@rozga/shared';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { parseOrThrow } from '../common/zod';
import type { AutoCreateGdGroupsDto } from './dto/auto-create-gd-groups.dto';
import type { CreateGdGroupDto } from './dto/create-gd-group.dto';
import type { SubmitGdEvaluationDto } from './dto/submit-gd-evaluation.dto';

@Injectable()
export class GdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private chunk<T>(arr: T[], size: number) {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  async listGroups(params: { tenantId: string; batchId?: string }) {
    const { tenantId, batchId } = params;

    return this.prisma.gDGroup.findMany({
      where: {
        tenantId,
        ...(batchId ? { batchId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        _count: { select: { candidates: true, interviewers: true, evaluations: true } },
        candidates: { include: { candidate: { select: { id: true, fullName: true, email: true } } } },
        interviewers: { include: { user: { select: { id: true, email: true, roles: true } } } },
      },
    });
  }

  async getGroup(params: { tenantId: string; gdGroupId: string }) {
    const group = await this.prisma.gDGroup.findFirst({
      where: { tenantId: params.tenantId, id: params.gdGroupId },
      include: {
        _count: { select: { candidates: true, interviewers: true, evaluations: true } },
        candidates: { include: { candidate: true } },
        interviewers: { include: { user: { select: { id: true, email: true, roles: true } } } },
        evaluations: { include: { candidate: { select: { id: true, fullName: true } }, evaluator: { select: { id: true, email: true } } } },
      },
    });
    if (!group) throw new NotFoundException('GD group not found');
    return group;
  }

  async createGroup(params: { tenantId: string; actorUserId: string; dto: CreateGdGroupDto }) {
    const { tenantId, actorUserId, dto } = params;

    const batch = await this.prisma.campusBatch.findFirst({
      where: { id: dto.batchId, tenantId },
      select: { id: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');

    const created = await this.prisma.gDGroup.create({
      data: {
        tenantId,
        batchId: dto.batchId,
        name: dto.name,
        capacity: dto.capacity,
        candidates: dto.candidateIds?.length
          ? { create: dto.candidateIds.map((candidateId) => ({ candidateId })) }
          : undefined,
        interviewers: dto.interviewerUserIds?.length
          ? { create: dto.interviewerUserIds.map((userId) => ({ userId })) }
          : undefined,
      },
      include: {
        candidates: true,
        interviewers: true,
      },
    });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.gd.group.create',
      entityType: 'GDGroup',
      entityId: created.id,
      meta: { batchId: dto.batchId, name: created.name },
    });

    return created;
  }

  async autoCreateGroups(params: { tenantId: string; actorUserId: string; dto: AutoCreateGdGroupsDto }) {
    const { tenantId, actorUserId, dto } = params;

    const batch = await this.prisma.campusBatch.findFirst({
      where: { id: dto.batchId, tenantId },
      select: { id: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');

    const replaceExisting = dto.replaceExisting ?? false;
    const onlyUnassigned = dto.onlyUnassigned ?? true;
    const groupSize = dto.groupSize;

    let interviewerUserIds: string[] = [];
    if (dto.interviewerUserIds?.length) {
      const users = await this.prisma.user.findMany({
        where: {
          tenantId,
          id: { in: dto.interviewerUserIds },
          isActive: true,
          roles: { has: Role.Interviewer },
        },
        select: { id: true },
      });
      if (users.length !== dto.interviewerUserIds.length) {
        throw new BadRequestException('One or more interviewers not found');
      }
      interviewerUserIds = users.map((u) => u.id);
    }

    // Candidate selection: default to those not already assigned to any GD group in this batch.
    const candidates = await this.prisma.candidate.findMany({
      where: {
        tenantId,
        batchId: dto.batchId,
        ...(onlyUnassigned
          ? {
              gdMemberships: {
                none: {
                  gdGroup: { batchId: dto.batchId },
                },
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }],
      select: { id: true },
    });

    if (!candidates.length) {
      return { ok: true, createdGroups: 0, assignedCandidates: 0, message: 'No candidates to group' };
    }

    const chunks = this.chunk(candidates.map((c) => c.id), groupSize);

    const created = await this.prisma.$transaction(async (tx) => {
      if (replaceExisting) {
        await tx.gDGroup.deleteMany({ where: { tenantId, batchId: dto.batchId } });
      }

      const createdGroupIds: string[] = [];
      let interviewerIdx = 0;

      for (let i = 0; i < chunks.length; i += 1) {
        const candidateIds = chunks[i]!;
        const interviewerId = interviewerUserIds.length
          ? interviewerUserIds[interviewerIdx % interviewerUserIds.length]!
          : undefined;
        interviewerIdx += 1;

        const g = await tx.gDGroup.create({
          data: {
            tenantId,
            batchId: dto.batchId,
            name: `Group ${i + 1}`,
            capacity: groupSize,
            candidates: {
              create: candidateIds.map((candidateId) => ({ candidateId })),
            },
            interviewers: interviewerId ? { create: [{ userId: interviewerId }] } : undefined,
          },
          select: { id: true },
        });

        createdGroupIds.push(g.id);
      }

      return createdGroupIds;
    });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.gd.group.autoCreate',
      entityType: 'CampusBatch',
      entityId: dto.batchId,
      meta: {
        createdGroups: created.length,
        assignedCandidates: candidates.length,
        groupSize,
        replaceExisting,
        onlyUnassigned,
        interviewerPoolSize: interviewerUserIds.length,
      },
    });

    return {
      ok: true,
      createdGroups: created.length,
      assignedCandidates: candidates.length,
      groupIds: created,
    };
  }

  async addCandidates(params: {
    tenantId: string;
    actorUserId: string;
    gdGroupId: string;
    candidateIds: string[];
  }) {
    const { tenantId, actorUserId, gdGroupId, candidateIds } = params;

    const group = await this.prisma.gDGroup.findFirst({ where: { id: gdGroupId, tenantId }, select: { id: true } });
    if (!group) throw new NotFoundException('GD group not found');

    // Ensure candidates belong to same tenant.
    const found = await this.prisma.candidate.findMany({
      where: { tenantId, id: { in: candidateIds } },
      select: { id: true },
    });
    if (found.length !== candidateIds.length) {
      throw new BadRequestException('One or more candidates not found');
    }

    await this.prisma.gDGroupCandidate.createMany({
      data: candidateIds.map((candidateId) => ({ gdGroupId, candidateId })),
      skipDuplicates: true,
    });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.gd.group.addCandidates',
      entityType: 'GDGroup',
      entityId: gdGroupId,
      meta: { count: candidateIds.length },
    });

    return { ok: true };
  }

  async addInterviewers(params: {
    tenantId: string;
    actorUserId: string;
    gdGroupId: string;
    interviewerUserIds: string[];
  }) {
    const { tenantId, actorUserId, gdGroupId, interviewerUserIds } = params;

    const group = await this.prisma.gDGroup.findFirst({ where: { id: gdGroupId, tenantId }, select: { id: true } });
    if (!group) throw new NotFoundException('GD group not found');

    const users = await this.prisma.user.findMany({
      where: { tenantId, id: { in: interviewerUserIds }, isActive: true },
      select: { id: true },
    });
    if (users.length !== interviewerUserIds.length) {
      throw new BadRequestException('One or more interviewers not found');
    }

    await this.prisma.gDGroupInterviewer.createMany({
      data: interviewerUserIds.map((userId) => ({ gdGroupId, userId })),
      skipDuplicates: true,
    });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.gd.group.addInterviewers',
      entityType: 'GDGroup',
      entityId: gdGroupId,
      meta: { count: interviewerUserIds.length },
    });

    return { ok: true };
  }

  async submitEvaluation(params: {
    tenantId: string;
    evaluatorUserId: string;
    roles: Role[];
    dto: SubmitGdEvaluationDto;
  }) {
    const { tenantId, evaluatorUserId, roles, dto } = params;

    const evaluation = parseOrThrow(GDEvaluationSchema, dto.evaluation);

    const group = await this.prisma.gDGroup.findFirst({
      where: { id: dto.gdGroupId, tenantId },
      select: { id: true },
    });
    if (!group) throw new NotFoundException('GD group not found');

    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, tenantId },
      select: { id: true },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    const membership = await this.prisma.gDGroupCandidate.findFirst({
      where: { gdGroupId: dto.gdGroupId, candidateId: dto.candidateId },
      select: { id: true },
    });
    if (!membership) throw new BadRequestException('Candidate is not assigned to this GD group');

    // If the user is only an Interviewer (not HR/Admin), enforce they are assigned to this GD group.
    const isPrivileged = roles.includes('Admin' as Role) || roles.includes('HR' as Role);
    if (!isPrivileged) {
      const assigned = await this.prisma.gDGroupInterviewer.findFirst({
        where: { gdGroupId: dto.gdGroupId, userId: evaluatorUserId },
        select: { id: true },
      });
      if (!assigned) throw new ForbiddenException('Not assigned to this GD group');
    }

    const created = await this.prisma.gDEvaluation.upsert({
      where: {
        gdGroupId_candidateId_evaluatorId: {
          gdGroupId: dto.gdGroupId,
          candidateId: dto.candidateId,
          evaluatorId: evaluatorUserId,
        },
      },
      create: {
        tenantId,
        gdGroupId: dto.gdGroupId,
        candidateId: dto.candidateId,
        evaluatorId: evaluatorUserId,
        shortlisted: evaluation.shortlisted,
        notes: evaluation.notes,
        metrics: ((evaluation.metrics ?? {}) as Record<string, unknown>) as Prisma.InputJsonValue,
      },
      update: {
        shortlisted: evaluation.shortlisted,
        notes: evaluation.notes,
        metrics: ((evaluation.metrics ?? {}) as Record<string, unknown>) as Prisma.InputJsonValue,
      },
    });

    await this.audit.log({
      tenantId,
      actorUserId: evaluatorUserId,
      action: 'campus.gd.evaluation.submit',
      entityType: 'GDEvaluation',
      entityId: created.id,
      meta: { gdGroupId: dto.gdGroupId, candidateId: dto.candidateId, shortlisted: created.shortlisted },
    });

    return created;
  }
}
