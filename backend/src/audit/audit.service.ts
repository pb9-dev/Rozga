import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    tenantId: string;
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    meta?: Record<string, unknown>;
  }) {
    const { tenantId, actorUserId, action, entityType, entityId, meta } = params;
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        action,
        entityType,
        entityId,
        meta: (meta ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
