import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { UpdateJobRequisitionDto } from './dto/update-job-requisition.dto';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(params: { tenantId: string }) {
    const rows = await this.prisma.jobRequisition.findMany({
      where: { tenantId: params.tenantId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        // Prisma client typings can lag behind schema generation in VS Code.
        // Keep runtime field selection while staying type-safe enough.
        ...( { jdUrl: true } as any ),
        createdAt: true,
        updatedAt: true,
      } as any,
    });

    return rows;
  }

  async get(params: { tenantId: string; jobId: string }) {
    const row = await this.prisma.jobRequisition.findFirst({
      where: { tenantId: params.tenantId, id: params.jobId },
      select: {
        id: true,
        title: true,
        description: true,
        ...( { jdUrl: true } as any ),
        createdAt: true,
        updatedAt: true,
      } as any,
    });

    if (!row) throw new NotFoundException('Job not found');
    return row;
  }

  async update(params: { tenantId: string; actorUserId: string; jobId: string; dto: UpdateJobRequisitionDto }) {
    const { dto } = params;
    if (!dto.title && !dto.description && dto.jdUrl === undefined) {
      throw new BadRequestException('No changes provided');
    }

    const result = await this.prisma.jobRequisition.updateMany({
      where: { id: params.jobId, tenantId: params.tenantId },
      data: {
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.description ? { description: dto.description } : {}),
        ...(dto.jdUrl !== undefined ? { jdUrl: dto.jdUrl } : {}),
      },
    });
    if (result.count === 0) throw new NotFoundException('Job not found');

    const updated = await this.get({ tenantId: params.tenantId, jobId: params.jobId });

    await this.audit.log({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: 'campus.jobs.update',
      entityType: 'JobRequisition',
      entityId: params.jobId,
      meta: { changed: Object.keys(dto).sort() },
    });

    return updated;
  }
}
