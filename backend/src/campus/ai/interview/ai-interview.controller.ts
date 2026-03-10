import { Body, Controller, Get, Param, Post, UseGuards, Version } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { Roles } from '../../../rbac/roles.decorator';
import { RolesGuard } from '../../../rbac/roles.guard';
import { CoordinatorAgent } from './agents/coordinator.agent';
import { StartAiInterviewSessionDto } from './dto/start-ai-interview-session.dto';
import { SubmitAiInterviewAnswerDto } from './dto/submit-ai-interview-answer.dto';

@Controller('campus/ai/interview')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiInterviewController {
  constructor(private readonly coordinator: CoordinatorAgent) {}

  @Post('sessions')
  @Version('1')
  @Roles(Role.Admin, Role.HR, Role.Interviewer)
  start(@CurrentUser() user: AuthUser, @Body() dto: StartAiInterviewSessionDto) {
    return this.coordinator.startSession({ tenantId: user.tenantId, actorUserId: user.sub, dto });
  }

  @Post('sessions/:sessionId/answer')
  @Version('1')
  @Roles(Role.Admin, Role.HR, Role.Interviewer)
  submitAnswer(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: SubmitAiInterviewAnswerDto,
  ) {
    return this.coordinator.submitAnswer({ tenantId: user.tenantId, actorUserId: user.sub, sessionId, answer: dto.answer });
  }

  @Post('sessions/:sessionId/end')
  @Version('1')
  @Roles(Role.Admin, Role.HR, Role.Interviewer)
  end(@CurrentUser() user: AuthUser, @Param('sessionId') sessionId: string) {
    return this.coordinator.endSession({ tenantId: user.tenantId, actorUserId: user.sub, sessionId });
  }

  @Get('sessions/:sessionId')
  @Version('1')
  @Roles(Role.Admin, Role.HR, Role.Interviewer)
  get(@CurrentUser() user: AuthUser, @Param('sessionId') sessionId: string) {
    return this.coordinator.getSession({ tenantId: user.tenantId, actorUserId: user.sub, sessionId });
  }
}
