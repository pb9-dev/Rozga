import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Role } from '@prisma/client';
import { InterviewMode, Role as PrismaRole } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { InterviewAllocationSchema, InterviewFeedbackSchema } from '../../shared/schemas/interview';
import { parseOrThrow } from '../common/zod';
import type { CreateInterviewAssignmentDto } from './dto/create-interview-assignment.dto';
import type { UpdateInterviewAssignmentDto } from './dto/update-interview-assignment.dto';
import { z } from 'zod';

@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listAssignments(params: {
    tenantId: string;
    requesterUserId: string;
    roles: Role[];
    batchId?: string;
    candidateId?: string;
  }) {
    const { tenantId, requesterUserId, roles, batchId, candidateId } = params;

    const isPrivileged = roles.includes('Admin' as Role) || roles.includes('HR' as Role);

    return this.prisma.interviewAssignment.findMany({
      where: {
        tenantId,
        ...(batchId ? { batchId } : {}),
        ...(candidateId ? { candidateId } : {}),
        ...(isPrivileged ? {} : { interviewerId: requesterUserId }),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        feedback: true,
        room: { select: { id: true, expiresAt: true, endedAt: true } },
        candidate: { select: { id: true, fullName: true, email: true } },
        interviewer: { select: { id: true, email: true, roles: true } },
        batch: { select: { id: true, name: true } },
      },
    });
  }

  async createAssignment(params: { tenantId: string; actorUserId: string; dto: CreateInterviewAssignmentDto }) {
    const { tenantId, actorUserId, dto } = params;

    const allocation = parseOrThrow(InterviewAllocationSchema, dto.allocation);

    // Ensure batch exists in tenant.
    const batch = await this.prisma.campusBatch.findFirst({
      where: { id: dto.batchId, tenantId },
      select: { id: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');

    // Ensure candidate exists in tenant.
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: allocation.candidateId, tenantId },
      select: { id: true },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    // Ensure interviewer exists in tenant.
    const interviewer = await this.prisma.user.findFirst({
      where: { id: allocation.interviewerUserId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!interviewer) throw new NotFoundException('Interviewer not found');

    const created = await this.prisma.interviewAssignment.create({
      data: {
        tenantId,
        batchId: dto.batchId,
        candidateId: allocation.candidateId,
        interviewerId: allocation.interviewerUserId,
        mode: allocation.mode,
        scheduledAt: allocation.scheduledAt ? new Date(allocation.scheduledAt) : undefined,
      },
    });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.interview.assignment.create',
      entityType: 'InterviewAssignment',
      entityId: created.id,
      meta: {
        batchId: dto.batchId,
        candidateId: allocation.candidateId,
        interviewerUserId: allocation.interviewerUserId,
        mode: allocation.mode,
      },
    });

    return created;
  }

  async updateAssignment(params: {
    tenantId: string;
    actorUserId: string;
    assignmentId: string;
    dto: UpdateInterviewAssignmentDto;
  }) {
    const { tenantId, actorUserId, assignmentId, dto } = params;

    const parsed = parseOrThrow(
      z
        .object({
          interviewerUserId: z.string().uuid().optional(),
          mode: z.nativeEnum(InterviewMode).optional(),
          scheduledAt: z.union([z.string().min(1), z.null()]).optional(),
        })
        .strict(),
      dto,
    );

    const existing = await this.prisma.interviewAssignment.findFirst({
      where: { id: assignmentId, tenantId },
      select: { id: true, interviewerId: true, scheduledAt: true, mode: true, batchId: true, candidateId: true },
    });
    if (!existing) throw new NotFoundException('Assignment not found');

    if (parsed.interviewerUserId) {
      const interviewer = await this.prisma.user.findFirst({
        where: { id: parsed.interviewerUserId, tenantId, isActive: true, roles: { has: PrismaRole.Interviewer } },
        select: { id: true },
      });
      if (!interviewer) throw new NotFoundException('Interviewer not found');
    }

    const updated = await this.prisma.interviewAssignment.update({
      where: { id: assignmentId },
      data: {
        interviewerId: parsed.interviewerUserId ?? undefined,
        mode: parsed.mode ?? undefined,
        scheduledAt:
          parsed.scheduledAt === undefined
            ? undefined
            : parsed.scheduledAt === null
              ? null
              : new Date(parsed.scheduledAt),
      },
    });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.interview.assignment.update',
      entityType: 'InterviewAssignment',
      entityId: updated.id,
      meta: {
        batchId: existing.batchId,
        candidateId: existing.candidateId,
        from: {
          interviewerId: existing.interviewerId,
          mode: existing.mode,
          scheduledAt: existing.scheduledAt?.toISOString?.() ?? existing.scheduledAt ?? null,
        },
        to: {
          interviewerId: updated.interviewerId,
          mode: updated.mode,
          scheduledAt: updated.scheduledAt?.toISOString?.() ?? updated.scheduledAt ?? null,
        },
      },
    });

    return updated;
  }

  async cancelAssignment(params: { tenantId: string; actorUserId: string; assignmentId: string }) {
    const { tenantId, actorUserId, assignmentId } = params;

    const existing = await this.prisma.interviewAssignment.findFirst({
      where: { id: assignmentId, tenantId },
      select: { id: true, batchId: true, candidateId: true, interviewerId: true },
    });
    if (!existing) throw new NotFoundException('Assignment not found');

    await this.prisma.interviewAssignment.delete({ where: { id: assignmentId } });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.interview.assignment.cancel',
      entityType: 'InterviewAssignment',
      entityId: assignmentId,
      meta: {
        batchId: existing.batchId,
        candidateId: existing.candidateId,
        interviewerId: existing.interviewerId,
      },
    });

    return { ok: true };
  }

  async submitFeedback(params: {
    tenantId: string;
    actorUserId: string;
    roles: Role[];
    assignmentId: string;
    feedback: unknown;
    toStageKey?: string;
  }) {
    const { tenantId, actorUserId, roles, assignmentId, feedback, toStageKey } = params;

    const parsed = parseOrThrow(InterviewFeedbackSchema, feedback);

    const assignment = await this.prisma.interviewAssignment.findFirst({
      where: { id: assignmentId, tenantId },
      select: {
        id: true,
        interviewerId: true,
        candidateId: true,
        candidate: {
          select: {
            id: true,
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
        },
      },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    const isPrivileged = roles.includes('Admin' as Role) || roles.includes('HR' as Role);
    if (!isPrivileged && assignment.interviewerId !== actorUserId) {
      throw new ForbiddenException('Not your assignment');
    }

    let transitionMeta: { fromStageKey: string; toStageKey: string } | null = null;

    if (toStageKey) {
      const flow = assignment.candidate.batch.flow;
      const firstStageKey = flow?.stages?.[0]?.key ?? null;
      const active = assignment.candidate.stageStates.find((s) => s.status === 'ACTIVE');
      const currentStageKey = active?.stageKey ?? firstStageKey;
      if (!currentStageKey) throw new BadRequestException('Candidate has no current stage');

      const possible = flow.transitions.filter((t) => t.fromStageKey === currentStageKey).map((t) => t.toStageKey);
      if (!possible.includes(toStageKey)) {
        throw new BadRequestException(`Invalid transition from ${currentStageKey} to ${toStageKey}`);
      }

      const stageExists = flow.stages.some((s) => s.key === toStageKey);
      if (!stageExists) throw new BadRequestException('Target stage does not exist in flow');

      transitionMeta = { fromStageKey: currentStageKey, toStageKey };
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const created = await tx.interviewFeedback.create({
          data: {
            assignmentId,
            recommendation: parsed.recommendation,
            notes: parsed.notes,
            scores: ((parsed.scores ?? {}) as Record<string, unknown>) as Prisma.InputJsonValue,
          },
        });

        if (transitionMeta) {
          await tx.candidateStageState.updateMany({
            where: {
              candidateId: assignment.candidateId,
              stageKey: transitionMeta.fromStageKey,
              status: 'ACTIVE',
            },
            data: { status: 'DONE' },
          });

          await tx.candidateStageState.upsert({
            where: { candidateId_stageKey: { candidateId: assignment.candidateId, stageKey: transitionMeta.toStageKey } },
            update: { status: 'ACTIVE' },
            create: { candidateId: assignment.candidateId, stageKey: transitionMeta.toStageKey, status: 'ACTIVE' },
          });
        }

        return created;
      });

      await this.audit.log({
        tenantId,
        actorUserId,
        action: 'campus.interview.feedback.submit',
        entityType: 'InterviewFeedback',
        entityId: result.id,
        meta: { assignmentId, recommendation: parsed.recommendation, ...(transitionMeta ? { transition: transitionMeta } : {}) },
      });

      if (transitionMeta) {
        await this.audit.log({
          tenantId,
          actorUserId,
          action: 'campus.candidate.transition',
          entityType: 'Candidate',
          entityId: assignment.candidateId,
          meta: transitionMeta,
        });
      }

      return { feedback: result, transition: transitionMeta };
    } catch (e) {
      // Likely unique constraint (feedback already exists). We keep this simple for now.
      throw new BadRequestException('Feedback already submitted');
    }
  }

  async getTransitionOptions(params: {
    tenantId: string;
    requesterUserId: string;
    roles: Role[];
    assignmentId: string;
  }) {
    const { tenantId, requesterUserId, roles, assignmentId } = params;

    const assignment = await this.prisma.interviewAssignment.findFirst({
      where: { id: assignmentId, tenantId },
      select: {
        id: true,
        interviewerId: true,
        candidate: {
          select: {
            id: true,
            stageStates: true,
            batch: {
              select: {
                flow: {
                  select: {
                    stages: { orderBy: { order: 'asc' }, select: { key: true, name: true, order: true } },
                    transitions: { select: { fromStageKey: true, toStageKey: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    const isPrivileged = roles.includes('Admin' as Role) || roles.includes('HR' as Role);
    if (!isPrivileged && assignment.interviewerId !== requesterUserId) {
      throw new ForbiddenException('Not your assignment');
    }

    const flow = assignment.candidate.batch.flow;
    const firstStageKey = flow?.stages?.[0]?.key ?? null;
    const active = assignment.candidate.stageStates.find((s) => s.status === 'ACTIVE');
    const currentStageKey = active?.stageKey ?? firstStageKey;
    if (!currentStageKey) throw new BadRequestException('Candidate has no current stage');

    const possibleNextStageKeys = flow.transitions
      .filter((t) => t.fromStageKey === currentStageKey)
      .map((t) => t.toStageKey);

    return {
      assignmentId: assignment.id,
      candidateId: assignment.candidate.id,
      currentStageKey,
      possibleNextStageKeys,
      flowStages: flow.stages,
    };
  }
}
