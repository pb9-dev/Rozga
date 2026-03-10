import { BadRequestException, Body, Controller, Get, Param, Post, Put, UploadedFile, UseGuards, UseInterceptors, Version } from '@nestjs/common';
import { Role } from '@prisma/client';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { memoryStorage } from 'multer';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, type AuthUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { UpdateJobRequisitionDto } from './dto/update-job-requisition.dto';
import { JobsService } from './jobs.service';

@Controller('campus/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.HR)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @Version('1')
  list(@CurrentUser() user: AuthUser) {
    return this.jobs.list({ tenantId: user.tenantId });
  }

  @Get(':jobId')
  @Version('1')
  get(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    return this.jobs.get({ tenantId: user.tenantId, jobId });
  }

  @Put(':jobId')
  @Version('1')
  update(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string, @Body() dto: UpdateJobRequisitionDto) {
    return this.jobs.update({ tenantId: user.tenantId, actorUserId: user.sub, jobId, dto });
  }

  @Post(':jobId/jd')
  @Version('1')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadJd(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Missing file');

    const safeBase = (file.originalname || 'jd')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 120);
    const ext = extname(safeBase) || '';
    const allowed = new Set(['.pdf', '.doc', '.docx', '.txt']);
    if (ext && !allowed.has(ext.toLowerCase())) {
      throw new BadRequestException('Unsupported file type. Allowed: pdf, doc, docx, txt');
    }

    const dirAbs = join(process.cwd(), 'apps', 'api', 'uploads', 'jds', jobId);
    await mkdir(dirAbs, { recursive: true });

    const fileName = `${Date.now()}_${safeBase || 'jd'}`;
    const absPath = join(dirAbs, fileName);
    await writeFile(absPath, file.buffer);

    const jdUrl = `/uploads/jds/${jobId}/${fileName}`.replace(/\\/g, '/');

    // Optional: if the uploaded file is plain text, also update description from it.
    let description: string | undefined;
    if (ext.toLowerCase() === '.txt') {
      const txt = file.buffer.toString('utf8').trim();
      if (txt) description = txt.slice(0, 20_000);
    }

    return this.jobs.update({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      jobId,
      dto: { jdUrl, ...(description ? { description } : {}) },
    });
  }
}
