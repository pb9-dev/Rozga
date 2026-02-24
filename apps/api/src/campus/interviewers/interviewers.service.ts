import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { UpsertInterviewerDto } from './dto/upsert-interviewer.dto';

@Injectable()
export class InterviewersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private generateTempPassword() {
    // Simple readable temp password for MVP (no email integration yet).
    const a = Math.random().toString(36).slice(2, 6);
    const b = Math.random().toString(36).slice(2, 6);
    return `Rozga-${a}-${b}`;
  }

  async list(params: { tenantId: string }) {
    return this.prisma.user.findMany({
      where: {
        tenantId: params.tenantId,
        isActive: true,
        roles: { has: Role.Interviewer },
      },
      orderBy: [{ email: 'asc' }],
      select: { id: true, email: true, roles: true },
    });
  }

  async upsert(params: { tenantId: string; actorUserId: string; dto: UpsertInterviewerDto }) {
    const email = params.dto.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: params.tenantId, email } },
      select: { id: true, email: true, roles: true, isActive: true },
    });

    if (existing) {
      const hasRole = existing.roles.includes(Role.Interviewer);
      const updated = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          roles: hasRole ? existing.roles : [...existing.roles, Role.Interviewer],
        },
        select: { id: true, email: true, roles: true },
      });

      await this.audit.log({
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        action: 'campus.interviewers.promote',
        entityType: 'User',
        entityId: updated.id,
        meta: { email: updated.email },
      });

      return { user: updated, created: false };
    }

    const tempPassword = params.dto.tempPassword?.trim() || this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const created = await this.prisma.user.create({
      data: {
        tenantId: params.tenantId,
        email,
        passwordHash,
        roles: [Role.Interviewer],
        isActive: true,
      },
      select: { id: true, email: true, roles: true },
    });

    await this.audit.log({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: 'campus.interviewers.create',
      entityType: 'User',
      entityId: created.id,
      meta: { email: created.email },
    });

    return { user: created, created: true, tempPassword };
  }
}
