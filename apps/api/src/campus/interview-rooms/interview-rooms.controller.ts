import { BadRequestException, Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors, Version } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../rbac/roles.decorator';
import { RolesGuard } from '../../rbac/roles.guard';
import { CreateInterviewRoomDto } from './dto/create-interview-room.dto';
import { InterviewRoomsService } from './interview-rooms.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';

@Controller('campus/interviews')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InterviewRoomsController {
  constructor(private readonly rooms: InterviewRoomsService) {}

  @Get('assignments/:assignmentId/room')
  @Version('1')
  @Roles(Role.Admin, Role.HR, Role.Interviewer)
  getRoom(@CurrentUser() user: AuthUser, @Param('assignmentId') assignmentId: string) {
    return this.rooms.getRoomForAssignment({
      tenantId: user.tenantId,
      requesterUserId: user.sub,
      roles: user.roles,
      assignmentId,
    });
  }

  @Post('assignments/:assignmentId/room')
  @Version('1')
  @Roles(Role.Admin, Role.HR)
  createRoom(
    @CurrentUser() user: AuthUser,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: CreateInterviewRoomDto,
  ) {
    return this.rooms.createOrRegenerateRoom({
      tenantId: user.tenantId,
      actorUserId: user.sub,
      assignmentId,
      regenerate: dto.regenerate,
      expiresInMinutes: dto.expiresInMinutes,
    });
  }
}

@Controller('public/interview-rooms')
export class PublicInterviewRoomsController {
  constructor(private readonly rooms: InterviewRoomsService) {}

  @Get(':token')
  @Version('1')
  resolve(@Param('token') token: string) {
    return this.rooms.resolveRoomByCandidateToken({ token });
  }

  @Post(':token/resume')
  @Version('1')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadResume(@Param('token') token: string, @UploadedFile() file?: Express.Multer.File) {
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
    return this.rooms.setCandidateResumeUrlByToken({ token, resumeUrl });
  }
}
