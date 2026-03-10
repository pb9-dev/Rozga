import { Body, Controller, Get, Param, Post, Query, UseGuards, Version } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { CreateBatchDto } from './dto/create-batch.dto';
import { BatchesService } from './batches.service';

@Controller('campus/batches')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.HR)
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Get()
  @Version('1')
  list(@CurrentUser() user: AuthUser, @Query('collegeId') collegeId?: string) {
    return this.batches.list({ tenantId: user.tenantId, collegeId });
  }

  @Get(':batchId')
  @Version('1')
  get(@CurrentUser() user: AuthUser, @Param('batchId') batchId: string) {
    return this.batches.get({ tenantId: user.tenantId, batchId });
  }

  @Post()
  @Version('1')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBatchDto) {
    return this.batches.create({ tenantId: user.tenantId, actorUserId: user.sub, dto });
  }
}
