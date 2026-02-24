import { IsEmail, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCandidateDto {
  @IsUUID()
  batchId!: string;

  @IsString()
  fullName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  rollNumber?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  resumeUrl?: string;

  @IsOptional()
  @IsObject()
  normalized?: Record<string, unknown>;
}
