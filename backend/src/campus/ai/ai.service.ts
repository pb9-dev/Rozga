import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listArtifacts(params: { tenantId: string; candidateId?: string; batchId?: string }) {
    const { tenantId, candidateId, batchId } = params;

    return this.prisma.aIGeneratedArtifact.findMany({
      where: {
        tenantId,
        ...(candidateId ? { candidateId } : {}),
        ...(batchId ? { candidate: { batchId } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        candidate: { select: { id: true, fullName: true, email: true, batchId: true } },
      },
    });
  }

  async createArtifact(params: {
    tenantId: string;
    actorUserId: string;
    dto: { candidateId: string; kind: string; model: string; input?: unknown; output?: unknown };
  }) {
    const { tenantId, actorUserId, dto } = params;

    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, tenantId },
      select: { id: true },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    if (!dto.kind.trim() || !dto.model.trim()) throw new BadRequestException('kind/model are required');
    if (dto.input === undefined || dto.output === undefined) throw new BadRequestException('input/output are required');

    const created = await this.prisma.aIGeneratedArtifact.create({
      data: {
        tenantId,
        candidateId: dto.candidateId,
        kind: dto.kind,
        model: dto.model,
        input: dto.input as any,
        output: dto.output as any,
      },
      include: { candidate: { select: { id: true, fullName: true, email: true, batchId: true } } },
    });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'campus.ai.artifact.create',
      entityType: 'AIGeneratedArtifact',
      entityId: created.id,
      meta: { candidateId: dto.candidateId, kind: dto.kind, model: dto.model },
    });

    return created;
  }
}
