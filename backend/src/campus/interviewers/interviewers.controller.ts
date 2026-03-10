import { Body, Controller, Get, Post, UseGuards, Version } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { InterviewersService } from './interviewers.service';
import { UpsertInterviewerDto } from './dto/upsert-interviewer.dto';

@Controller('campus/interviewers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.HR)
export class InterviewersController {
  constructor(private readonly interviewers: InterviewersService) {}

  @Get()
  @Version('1')
  list(@CurrentUser() user: AuthUser) {
    return this.interviewers.list({ tenantId: user.tenantId });
  }

  @Post()
  @Version('1')
  upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertInterviewerDto) {
    return this.interviewers.upsert({ tenantId: user.tenantId, actorUserId: user.sub, dto });
  }
}
