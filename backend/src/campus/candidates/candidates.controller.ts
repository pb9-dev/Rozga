import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { ImportCandidatesDto } from './dto/import-candidates.dto';
import { BulkTransitionCandidatesDto } from './dto/bulk-transition-candidates.dto';
import { BulkDeleteCandidatesDto } from './dto/bulk-delete-candidates.dto';
import { TransitionCandidateDto } from './dto/transition-candidate.dto';
import { CandidatesService } from './candidates.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';

@Controller('campus/candidates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.HR)
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Get()
  @Version('1')
  list(@CurrentUser() user: AuthUser, @Query('batchId') batchId?: string) {
    return this.candidates.list({ tenantId: user.tenantId, batchId });
  }

  @Get('progression')
  @Version('1')
  listProgression(@CurrentUser() user: AuthUser, @Query('batchId') batchId?: string) {
    return this.candidates.listProgression({ tenantId: user.tenantId, batchId });
  }

  @Post()
  @Version('1')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCandidateDto) {
    return this.candidates.create({ tenantId: user.tenantId, actorUserId: user.sub, dto });
  }

  @Post('import')
  @Version('1')
  import(@CurrentUser() user: AuthUser, @Body() dto: ImportCandidatesDto) {
    return this.candidates.import({ tenantId: user.tenantId, actorUserId: user.sub, candidates: dto.candidates });
  }

  @Post('bulk-transition')
  @Version('1')
  bulkTransition(@CurrentUser() user: AuthUser, @Body() dto: BulkTransitionCandidatesDto) {
    return this.candidates.bulkTransition({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      candidateIds: dto.candidateIds,
      toStageKey: dto.toStageKey,
    });
  }

  @Post('bulk-delete')
  @Version('1')
  bulkDelete(@CurrentUser() user: AuthUser, @Body() dto: BulkDeleteCandidatesDto) {
    return this.candidates.bulkDelete({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      candidateIds: dto.candidateIds,
    });
  }

  @Get(':candidateId')
  @Version('1')
  getOne(@CurrentUser() user: AuthUser, @Param('candidateId') candidateId: string) {
    return this.candidates.getOne({ tenantId: user.tenantId, candidateId });
  }

  @Delete(':candidateId')
  @Version('1')
  delete(@CurrentUser() user: AuthUser, @Param('candidateId') candidateId: string) {
    return this.candidates.delete({ tenantId: user.tenantId, actorUserId: user.sub, candidateId });
  }

  @Post(':candidateId/transition')
  @Version('1')
  transition(
    @CurrentUser() user: AuthUser,
    @Param('candidateId') candidateId: string,
    @Body() dto: TransitionCandidateDto,
  ) {
    return this.candidates.transition({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      candidateId,
      toStageKey: dto.toStageKey,
    });
  }

  @Post(':candidateId/resume')
  @Version('1')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadResume(
    @CurrentUser() user: AuthUser,
    @Param('candidateId') candidateId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Missing file');

    const safeBase = (file.originalname || 'resume')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 120);
    const ext = extname(safeBase) || '';
    const allowed = new Set(['.pdf', '.doc', '.docx', '.txt']);
    if (ext && !allowed.has(ext.toLowerCase())) {
      throw new BadRequestException('Unsupported file type. Allowed: pdf, doc, docx, txt');
    }

    const fileName = `${Date.now()}_${safeBase || 'resume'}`;
    const relPath = join('resumes', fileName).replace(/\\/g, '/');
    const absPath = join(process.cwd(), 'apps', 'api', 'uploads', relPath);

    await mkdir(join(process.cwd(), 'apps', 'api', 'uploads', 'resumes'), { recursive: true });
    await writeFile(absPath, file.buffer);

    const resumeUrl = `/uploads/${relPath}`.replace(/\\/g, '/');
    return this.candidates.setResumeUrl({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      candidateId,
      resumeUrl,
    });
  }
}
