import { Body, Controller, Get, Post, Query, UseGuards, Version } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { EnsureCollegeDto } from './dto/ensure-college.dto';
import { BulkImportCollegesDto } from './dto/bulk-import-colleges.dto';
import { CollegesService } from './colleges.service';

@Controller('campus/colleges')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.HR)
export class CollegesController {
  constructor(private readonly colleges: CollegesService) {}

  @Get('search')
  @Version('1')
  search(@CurrentUser() user: AuthUser, @Query('q') q = '') {
    return this.colleges.search({ tenantId: user.tenantId, q });
  }

  @Post('bulk-import')
  @Version('1')
  bulkImport(@CurrentUser() user: AuthUser, @Body() dto: BulkImportCollegesDto) {
    return this.colleges.bulkImport({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      colleges: dto.colleges,
    });
  }

  @Post('ensure')
  @Version('1')
  ensure(@CurrentUser() user: AuthUser, @Body() dto: EnsureCollegeDto) {
    return this.colleges.ensure({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      name: dto.name,
      countryCode: dto.countryCode,
      state: dto.state,
    });
  }
}
