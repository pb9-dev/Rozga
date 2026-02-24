import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type { CreateBatchDto } from './dto/create-batch.dto';

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(params: { tenantId: string; collegeId?: string }) {
    const { tenantId, collegeId } = params;

    return this.prisma.campusBatch.findMany({
      where: {
        tenantId,
        ...(collegeId ? { collegeId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        college: true,
        job: true,
        flow: true,
        _count: { select: { candidates: true, gdGroups: true, interviewAssignments: true } },
      },
    });
  }

  async get(params: { tenantId: string; batchId: string }) {
    const batch = await this.prisma.campusBatch.findFirst({
      where: { id: params.batchId, tenantId: params.tenantId },
      include: {
        college: true,
        job: true,
        flow: { include: { stages: true, transitions: true } },
        _count: { select: { candidates: true, gdGroups: true, interviewAssignments: true } },
      },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }

  async create(params: { tenantId: string; actorUserId: string; dto: CreateBatchDto }) {
    const { tenantId, actorUserId, dto } = params;

    const flow = await this.prisma.campusHiringFlow.findFirst({
      where: { id: dto.flowId, tenantId },
      select: { id: true },
    });
    if (!flow) throw new NotFoundException('Flow not found');

    const created = await this.prisma.campusBatch.create({
      data: {
        tenantId,
        collegeId: dto.collegeId,
        jobId: dto.jobId,
        flowId: dto.flowId,
        name: dto.name,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      },
      include: { college: true, job: true, flow: true },
    });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.batch.create',
      entityType: 'CampusBatch',
      entityId: created.id,
      meta: { name: created.name, collegeId: created.collegeId, jobId: created.jobId, flowId: created.flowId },
    });

    return created;
  }
}
