import { Controller, Get, UseGuards, Version } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { LookupsService } from './lookups.service';

@Controller('campus/lookups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.HR)
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  @Get()
  @Version('1')
  getAll(@CurrentUser() user: AuthUser) {
    return this.lookups.getAll({ tenantId: user.tenantId });
  }
}
