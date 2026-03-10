import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, Version } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { CreateInterviewAssignmentDto } from './dto/create-interview-assignment.dto';
import { SubmitInterviewFeedbackDto } from './dto/submit-interview-feedback.dto';
import { UpdateInterviewAssignmentDto } from './dto/update-interview-assignment.dto';
import { InterviewsService } from './interviews.service';

@Controller('campus/interviews')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Get('assignments')
  @Version('1')
  @Roles(Role.Admin, Role.HR, Role.Interviewer)
  listAssignments(
    @CurrentUser() user: AuthUser,
    @Query('batchId') batchId?: string,
    @Query('candidateId') candidateId?: string,
  ) {
    return this.interviews.listAssignments({
      tenantId: user.tenantId,
      requesterUserId: user.sub,
      roles: user.roles,
      batchId,
      candidateId,
    });
  }

  @Post('assignments')
  @Version('1')
  @Roles(Role.Admin, Role.HR)
  createAssignment(@CurrentUser() user: AuthUser, @Body() dto: CreateInterviewAssignmentDto) {
    return this.interviews.createAssignment({ tenantId: user.tenantId, actorUserId: user.sub, dto });
  }

  @Patch('assignments/:assignmentId')
  @Version('1')
  @Roles(Role.Admin, Role.HR)
  updateAssignment(
    @CurrentUser() user: AuthUser,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateInterviewAssignmentDto,
  ) {
    return this.interviews.updateAssignment({ tenantId: user.tenantId, actorUserId: user.sub, assignmentId, dto });
  }

  @Delete('assignments/:assignmentId')
  @Version('1')
  @Roles(Role.Admin, Role.HR)
  cancelAssignment(@CurrentUser() user: AuthUser, @Param('assignmentId') assignmentId: string) {
    return this.interviews.cancelAssignment({ tenantId: user.tenantId, actorUserId: user.sub, assignmentId });
  }

  @Post('assignments/:assignmentId/feedback')
  @Version('1')
  @Roles(Role.Interviewer, Role.Admin, Role.HR)
  submitFeedback(
    @CurrentUser() user: AuthUser,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: SubmitInterviewFeedbackDto,
  ) {
    return this.interviews.submitFeedback({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      roles: user.roles,
      assignmentId,
      feedback: dto.feedback,
      toStageKey: dto.toStageKey,
    });
  }

  @Get('assignments/:assignmentId/transition-options')
  @Version('1')
  @Roles(Role.Interviewer, Role.Admin, Role.HR)
  transitionOptions(@CurrentUser() user: AuthUser, @Param('assignmentId') assignmentId: string) {
    return this.interviews.getTransitionOptions({
      tenantId: user.tenantId,
      requesterUserId: user.sub,
      roles: user.roles,
      assignmentId,
    });
  }
}
