import { BadRequestException, Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { Roles } from '../../../rbac/roles.decorator';
import { RolesGuard } from '../../../rbac/roles.guard';
import { PrismaService } from '../../../database/prisma.service';
import { InterviewRoomsService } from '../../interview-rooms/interview-rooms.service';
import { EmailService } from '../../../common/email/email.service';
import { ScheduleAiInterviewSchema, type ScheduleAiInterviewDto } from './dto/schedule-ai-interview.dto';

@Controller('campus/ai/interview')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiInterviewSchedulingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: InterviewRoomsService,
    private readonly email: EmailService,
  ) {}

  @Post('schedule')
  @Version('1')
  @Roles(Role.Admin, Role.HR)
  async schedule(@CurrentUser() user: AuthUser, @Body() body: ScheduleAiInterviewDto) {
    const parsed = ScheduleAiInterviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid input', issues: parsed.error.issues });
    }

    const dto = parsed.data;

    const candidate = await this.prisma.candidate.findFirst({
      where: { tenantId: user.tenantId, id: dto.candidateId },
      select: { id: true, email: true, fullName: true, batchId: true },
    });
    if (!candidate) throw new BadRequestException('Candidate not found');
    if (candidate.batchId !== dto.batchId) throw new BadRequestException('Candidate is not in this batch');
    if (!candidate.email) throw new BadRequestException('Candidate email is required to schedule via magic link');

    const batch = await this.prisma.campusBatch.findFirst({
      where: { tenantId: user.tenantId, id: dto.batchId },
      select: {
        id: true,
        name: true,
        job: { select: { id: true, title: true, jdUrl: true } as any },
      },
    });
    if (!batch) throw new BadRequestException('Batch not found');

    const jdUrl = (batch as any).job?.jdUrl as string | null | undefined;
    if (!jdUrl) throw new BadRequestException('Job description (JD) is required for AI interview scheduling');

    const assignment = await this.prisma.interviewAssignment.create({
      data: {
        tenantId: user.tenantId,
        batchId: dto.batchId,
        candidateId: dto.candidateId,
        interviewerId: user.sub,
        mode: 'ONLINE',
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      },
      select: { id: true },
    });

    const room = await this.rooms.createOrRegenerateRoom({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      assignmentId: assignment.id,
      expiresInMinutes: dto.expiresInMinutes,
      regenerate: dto.regenerateLink,
    });

    if (!room.candidateJoinToken) {
      // This only happens when already exists + regenerate=false; keep API contract strict.
      throw new BadRequestException('Could not generate candidate link');
    }

    const webBaseUrl = process.env.ROZGA_WEB_BASE_URL;
    if (!webBaseUrl) {
      // Still return token so caller can display/copy.
      return {
        ok: true,
        assignmentId: assignment.id,
        candidate: { id: candidate.id, fullName: candidate.fullName, email: candidate.email },
        link: null as string | null,
        token: room.candidateJoinToken,
        warning: 'ROZGA_WEB_BASE_URL not set; email not sent. Copy the token and build a URL manually.',
      };
    }

    const link = new URL(`/ai-interview/${encodeURIComponent(room.candidateJoinToken)}`, webBaseUrl).toString();

    await this.email.sendMagicLink({
      to: candidate.email,
      subject: `Your AI interview link — ${batch.name}`,
      url: link,
      context: { tenantId: user.tenantId, candidateId: candidate.id, assignmentId: assignment.id, batchId: batch.id },
    });

    return {
      ok: true,
      assignmentId: assignment.id,
      candidate: { id: candidate.id, fullName: candidate.fullName, email: candidate.email },
      link,
      token: room.candidateJoinToken,
      expiresAt: room.expiresAt,
    };
  }
}
