import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards, Version } from '@nestjs/common';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { AiService } from './ai.service';

const CreateArtifactSchema = z.object({
  candidateId: z.string().uuid(),
  kind: z.string().min(1),
  model: z.string().min(1),
  input: z.unknown(),
  output: z.unknown(),
});

@Controller('campus/ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('artifacts')
  @Version('1')
  @Roles(Role.Admin, Role.HR, Role.Interviewer)
  listArtifacts(
    @CurrentUser() user: AuthUser,
    @Query('candidateId') candidateId?: string,
    @Query('batchId') batchId?: string,
  ) {
    return this.ai.listArtifacts({ tenantId: user.tenantId, candidateId, batchId });
  }

  @Post('artifacts')
  @Version('1')
  @Roles(Role.Admin, Role.HR)
  createArtifact(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const parsed = CreateArtifactSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid input');
    }

    return this.ai.createArtifact({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      dto: parsed.data,
    });
  }
}
