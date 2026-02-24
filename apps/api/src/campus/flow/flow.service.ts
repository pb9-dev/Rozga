import { Injectable, NotFoundException } from '@nestjs/common';
import { CampusHiringFlowUpsertSchema } from '@rozga/shared';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { parseOrThrow } from '../common/zod';
import type { CreateFlowDto } from './dto/create-flow.dto';
import type { UpdateFlowDto } from './dto/update-flow.dto';

@Injectable()
export class FlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(params: { tenantId: string; collegeId?: string }) {
    const { tenantId, collegeId } = params;
    return this.prisma.campusHiringFlow.findMany({
      where: {
        tenantId,
        ...(collegeId ? { collegeId } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }],
      include: { stages: true, transitions: true },
    });
  }

  async get(params: { tenantId: string; flowId: string }) {
    const flow = await this.prisma.campusHiringFlow.findFirst({
      where: { id: params.flowId, tenantId: params.tenantId },
      include: { stages: { orderBy: { order: 'asc' } }, transitions: true },
    });
    if (!flow) throw new NotFoundException('Flow not found');
    return flow;
  }

  async create(params: { tenantId: string; actorUserId: string; dto: CreateFlowDto }) {
    const { tenantId, actorUserId, dto } = params;

    const config = parseOrThrow(CampusHiringFlowUpsertSchema, dto.config);

    const created = await this.prisma.$transaction(async (tx) => {
      const flow = await tx.campusHiringFlow.create({
        data: {
          tenantId,
          collegeId: dto.collegeId,
          name: dto.name,
          isActive: dto.isActive ?? true,
          batchSize: config.batchSize,
          stages: {
            create: config.stages.map((s) => ({
              key: s.key,
              name: s.name,
              kind: s.kind,
              order: s.order,
              config: (s.config ?? {}) as Prisma.InputJsonValue,
            })),
          },
          transitions: {
            create: config.transitions.map((t) => ({
              fromStageKey: t.fromStageKey,
              toStageKey: t.toStageKey,
              condition: (t.condition ?? {}) as Prisma.InputJsonValue,
            })),
          },
        },
        include: { stages: true, transitions: true },
      });
      return flow;
    });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.flow.create',
      entityType: 'CampusHiringFlow',
      entityId: created.id,
      meta: { collegeId: dto.collegeId, name: created.name },
    });

    return created;
  }

  async update(params: {
    tenantId: string;
    actorUserId: string;
    flowId: string;
    dto: UpdateFlowDto;
  }) {
    const { tenantId, actorUserId, flowId, dto } = params;

    const existing = await this.prisma.campusHiringFlow.findFirst({
      where: { id: flowId, tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Flow not found');

    const config = parseOrThrow(CampusHiringFlowUpsertSchema, dto.config);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.campusFlowStage.deleteMany({ where: { flowId } });
      await tx.campusFlowTransition.deleteMany({ where: { flowId } });

      const flow = await tx.campusHiringFlow.update({
        where: { id: flowId },
        data: {
          name: dto.name,
          isActive: dto.isActive,
          batchSize: config.batchSize,
          version: { increment: 1 },
          stages: {
            create: config.stages.map((s) => ({
              key: s.key,
              name: s.name,
              kind: s.kind,
              order: s.order,
              config: (s.config ?? {}) as Prisma.InputJsonValue,
            })),
          },
          transitions: {
            create: config.transitions.map((t) => ({
              fromStageKey: t.fromStageKey,
              toStageKey: t.toStageKey,
              condition: (t.condition ?? {}) as Prisma.InputJsonValue,
            })),
          },
        },
        include: { stages: true, transitions: true },
      });

      return flow;
    });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.flow.update',
      entityType: 'CampusHiringFlow',
      entityId: updated.id,
      meta: { name: updated.name, version: updated.version },
    });

    return updated;
  }
}
