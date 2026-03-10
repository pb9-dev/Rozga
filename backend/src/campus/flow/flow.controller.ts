import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  Version,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { CreateFlowDto } from './dto/create-flow.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';
import { FlowService } from './flow.service';

@Controller('campus/flows')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.HR)
export class FlowController {
  constructor(private readonly flows: FlowService) {}

  @Get()
  @Version('1')
  list(@CurrentUser() user: AuthUser, @Query('collegeId') collegeId?: string) {
    return this.flows.list({ tenantId: user.tenantId, collegeId });
  }

  @Get(':flowId')
  @Version('1')
  get(@CurrentUser() user: AuthUser, @Param('flowId') flowId: string) {
    return this.flows.get({ tenantId: user.tenantId, flowId });
  }

  @Post()
  @Version('1')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFlowDto) {
    return this.flows.create({ tenantId: user.tenantId, actorUserId: user.sub, dto });
  }

  @Put(':flowId')
  @Version('1')
  update(
    @CurrentUser() user: AuthUser,
    @Param('flowId') flowId: string,
    @Body() dto: UpdateFlowDto,
  ) {
    return this.flows.update({ tenantId: user.tenantId, actorUserId: user.sub, flowId, dto });
  }
}
