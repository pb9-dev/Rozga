import { InterviewMode } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateInterviewAssignmentDto {
  @IsOptional()
  @IsUUID()
  interviewerUserId?: string;

  @IsOptional()
  @IsEnum(InterviewMode)
  mode?: InterviewMode;

  /** ISO string or empty to clear; validated with Zod in service */
  @IsOptional()
  @IsString()
  scheduledAt?: string | null;
}
