import { BadRequestException, Controller, Get, Param, Post, Body, Version } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { InterviewRoomsService } from '../../interview-rooms/interview-rooms.service';
import { CoordinatorAgent } from './agents/coordinator.agent';
import { SubmitAiInterviewAnswerDto } from './dto/submit-ai-interview-answer.dto';

@Controller('public/ai-interview')
export class PublicAiInterviewController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: InterviewRoomsService,
    private readonly coordinator: CoordinatorAgent,
  ) {}

  @Post(':token/sessions')
  @Version('1')
  async start(@Param('token') token: string) {
    const room = await this.rooms.resolveRoomByCandidateToken({ token });

    // Enforce resume upload before AI session starts.
    if (!room.candidate?.resumeUrl) {
      throw new BadRequestException('Resume is required before starting the AI interview');
    }

    const batch = await this.prisma.campusBatch.findFirst({
      where: { tenantId: room.tenantId, id: room.batch.id },
      select: { id: true, job: { select: { title: true } as any } as any },
    });
    const roleTitle = ((batch as any)?.job?.title as string | undefined) ?? 'Role';

    return this.coordinator.startSession({
      tenantId: room.tenantId,
      actorUserId: undefined,
      dto: {
        candidateId: room.candidate.id,
        assignmentId: room.assignmentId,
        roleTitle,
        maxQuestions: 6,
        maxFollowUps: 2,
        maxTotalTurns: 40,
      },
      contextRequirements: { requireResume: true, requireJd: true },
      questionPolicy: { resumeFirstMainQuestions: 2 },
    });
  }

  @Post(':token/sessions/:sessionId/answer')
  @Version('1')
  async answer(
    @Param('token') token: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: SubmitAiInterviewAnswerDto,
  ) {
    const room = await this.rooms.resolveRoomByCandidateToken({ token });

    await this.assertSessionOwnedByRoom({
      tenantId: room.tenantId,
      sessionId,
      candidateId: room.candidate.id,
      assignmentId: room.assignmentId,
    });

    return this.coordinator.submitAnswer({
      tenantId: room.tenantId,
      actorUserId: 'public',
      sessionId,
      answer: dto.answer,
    });
  }

  @Post(':token/sessions/:sessionId/end')
  @Version('1')
  async end(@Param('token') token: string, @Param('sessionId') sessionId: string) {
    const room = await this.rooms.resolveRoomByCandidateToken({ token });

    await this.assertSessionOwnedByRoom({
      tenantId: room.tenantId,
      sessionId,
      candidateId: room.candidate.id,
      assignmentId: room.assignmentId,
    });

    return this.coordinator.endSession({ tenantId: room.tenantId, actorUserId: 'public', sessionId });
  }

  @Get(':token/sessions/:sessionId')
  @Version('1')
  async get(@Param('token') token: string, @Param('sessionId') sessionId: string) {
    const room = await this.rooms.resolveRoomByCandidateToken({ token });

    await this.assertSessionOwnedByRoom({
      tenantId: room.tenantId,
      sessionId,
      candidateId: room.candidate.id,
      assignmentId: room.assignmentId,
    });

    return this.coordinator.getSession({ tenantId: room.tenantId, actorUserId: 'public', sessionId });
  }

  private async assertSessionOwnedByRoom(params: {
    tenantId: string;
    sessionId: string;
    candidateId: string;
    assignmentId: string;
  }) {
    const row = await (this.prisma as any).aiInterviewSession.findFirst({
      where: {
        id: params.sessionId,
        tenantId: params.tenantId,
        candidateId: params.candidateId,
        assignmentId: params.assignmentId,
      },
      select: { id: true },
    });

    if (!row) throw new BadRequestException('Invalid session');
  }
}
