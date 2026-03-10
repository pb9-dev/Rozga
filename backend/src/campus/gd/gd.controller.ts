import { Body, Controller, Get, Param, Post, Query, UseGuards, Version } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { AssignIdsDto } from './dto/assign-ids.dto';
import { AutoCreateGdGroupsDto } from './dto/auto-create-gd-groups.dto';
import { CreateGdGroupDto } from './dto/create-gd-group.dto';
import { SubmitGdEvaluationDto } from './dto/submit-gd-evaluation.dto';
import { GdService } from './gd.service';

@Controller('campus/gd')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GdController {
  constructor(private readonly gd: GdService) {}

  @Get('groups')
  @Version('1')
  @Roles(Role.Admin, Role.HR, Role.Interviewer)
  listGroups(@CurrentUser() user: AuthUser, @Query('batchId') batchId?: string) {
    return this.gd.listGroups({ tenantId: user.tenantId, batchId });
  }

  @Get('groups/:gdGroupId')
  @Version('1')
  @Roles(Role.Admin, Role.HR, Role.Interviewer)
  getGroup(@CurrentUser() user: AuthUser, @Param('gdGroupId') gdGroupId: string) {
    return this.gd.getGroup({ tenantId: user.tenantId, gdGroupId });
  }

  @Post('groups')
  @Version('1')
  @Roles(Role.Admin, Role.HR)
  createGroup(@CurrentUser() user: AuthUser, @Body() dto: CreateGdGroupDto) {
    return this.gd.createGroup({ tenantId: user.tenantId, actorUserId: user.sub, dto });
  }

  @Post('groups/auto-create')
  @Version('1')
  @Roles(Role.Admin, Role.HR)
  autoCreateGroups(@CurrentUser() user: AuthUser, @Body() dto: AutoCreateGdGroupsDto) {
    return this.gd.autoCreateGroups({ tenantId: user.tenantId, actorUserId: user.sub, dto });
  }

  @Post('groups/:gdGroupId/candidates')
  @Version('1')
  @Roles(Role.Admin, Role.HR)
  addCandidates(
    @CurrentUser() user: AuthUser,
    @Param('gdGroupId') gdGroupId: string,
    @Body() dto: AssignIdsDto,
  ) {
    return this.gd.addCandidates({ tenantId: user.tenantId, actorUserId: user.sub, gdGroupId, candidateIds: dto.ids });
  }

  @Post('groups/:gdGroupId/interviewers')
  @Version('1')
  @Roles(Role.Admin, Role.HR)
  addInterviewers(
    @CurrentUser() user: AuthUser,
    @Param('gdGroupId') gdGroupId: string,
    @Body() dto: AssignIdsDto,
  ) {
    return this.gd.addInterviewers({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      gdGroupId,
      interviewerUserIds: dto.ids,
    });
  }

  @Post('evaluations')
  @Version('1')
  @Roles(Role.Interviewer, Role.Admin, Role.HR)
  submitEvaluation(@CurrentUser() user: AuthUser, @Body() dto: SubmitGdEvaluationDto) {
    return this.gd.submitEvaluation({
      tenantId: user.tenantId,
      evaluatorUserId: user.sub,
      roles: user.roles,
      dto,
    });
  }
}
