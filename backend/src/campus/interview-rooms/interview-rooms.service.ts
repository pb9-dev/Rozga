import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { randomToken, sha256 } from '../../auth/token-hash';

const DEFAULT_EXPIRES_MINUTES = 60 * 24 * 7; // 7 days

@Injectable()
export class InterviewRoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getRoomForAssignment(params: {
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
        mode: true,
        scheduledAt: true,
        candidate: { select: { id: true, fullName: true } },
        batch: { select: { id: true, name: true } },
        room: { select: { id: true, expiresAt: true, endedAt: true } },
      },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    const isPrivileged = roles.includes('Admin' as Role) || roles.includes('HR' as Role);
    if (!isPrivileged && assignment.interviewerId !== requesterUserId) {
      throw new ForbiddenException('Not your assignment');
    }

    return {
      assignmentId: assignment.id,
      mode: assignment.mode,
      scheduledAt: assignment.scheduledAt,
      batch: assignment.batch,
      candidate: assignment.candidate,
      room: assignment.room,
    };
  }

  async createOrRegenerateRoom(params: {
    tenantId: string;
    actorUserId: string;
    assignmentId: string;
    expiresInMinutes?: number;
    regenerate?: boolean;
  }) {
    const { tenantId, actorUserId, assignmentId, expiresInMinutes, regenerate } = params;

    const assignment = await this.prisma.interviewAssignment.findFirst({
      where: { id: assignmentId, tenantId },
      select: { id: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    const existing = await this.prisma.interviewRoom.findUnique({
      where: { assignmentId },
      select: { id: true },
    });

    if (existing && !regenerate) {
      return {
        ok: true,
        roomId: existing.id,
        alreadyExists: true,
        candidateJoinToken: null as string | null,
        expiresAt: null as string | null,
      };
    }

    const joinToken = randomToken(32);
    const tokenHash = sha256(joinToken);

    const ttlMinutes = expiresInMinutes ?? DEFAULT_EXPIRES_MINUTES;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const room = await this.prisma.interviewRoom.upsert({
      where: { assignmentId },
      update: {
        candidateTokenHash: tokenHash,
        expiresAt,
        endedAt: null,
      },
      create: {
        tenantId,
        assignmentId,
        candidateTokenHash: tokenHash,
        expiresAt,
      },
      select: { id: true },
    });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: existing ? 'campus.interview.room.regenerate' : 'campus.interview.room.create',
      entityType: 'InterviewRoom',
      entityId: room.id,
      meta: { assignmentId, expiresAt: expiresAt.toISOString() },
    });

    return {
      ok: true,
      roomId: room.id,
      alreadyExists: false,
      candidateJoinToken: joinToken,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async resolveRoomByCandidateToken(params: { token: string }) {
    const token = params.token?.trim();
    if (!token) throw new BadRequestException('Invalid token');

    const room = await this.prisma.interviewRoom.findUnique({
      where: { candidateTokenHash: sha256(token) },
      select: {
        id: true,
        tenantId: true,
        assignmentId: true,
        expiresAt: true,
        endedAt: true,
        assignment: {
          select: {
            id: true,
            mode: true,
            scheduledAt: true,
            candidate: { select: { id: true, fullName: true, resumeUrl: true } },
            batch: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!room) throw new NotFoundException('Room not found');
    if (room.endedAt) throw new BadRequestException('Interview ended');
    if (room.expiresAt && room.expiresAt.getTime() <= Date.now()) throw new BadRequestException('Link expired');

    return {
      roomId: room.id,
      tenantId: room.tenantId,
      assignmentId: room.assignmentId,
      mode: room.assignment.mode,
      scheduledAt: room.assignment.scheduledAt,
      candidate: room.assignment.candidate,
      batch: room.assignment.batch,
    };
  }

  async setCandidateResumeUrlByToken(params: { token: string; resumeUrl: string }) {
    const token = params.token?.trim();
    if (!token) throw new BadRequestException('Invalid token');
    const resumeUrl = params.resumeUrl?.trim();
    if (!resumeUrl) throw new BadRequestException('Missing resumeUrl');

    const room = await this.prisma.interviewRoom.findUnique({
      where: { candidateTokenHash: sha256(token) },
      select: {
        id: true,
        tenantId: true,
        expiresAt: true,
        endedAt: true,
        assignment: { select: { candidateId: true } },
      },
    });

    if (!room) throw new NotFoundException('Room not found');
    if (room.endedAt) throw new BadRequestException('Interview ended');
    if (room.expiresAt && room.expiresAt.getTime() <= Date.now()) throw new BadRequestException('Link expired');

    await this.prisma.candidate.update({
      where: { id: room.assignment.candidateId },
      data: { resumeUrl },
      select: { id: true },
    });

    return { ok: true, resumeUrl };
  }
}
