import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class StartAiInterviewSessionDto {
  @IsUUID()
  candidateId!: string;

  @IsOptional()
  @IsUUID()
  assignmentId?: string;

  @IsString()
  roleTitle!: string;

  @IsOptional()
  @IsString()
  seniority?: 'intern' | 'junior' | 'mid' | 'senior';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  maxQuestions?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  maxFollowUps?: number;

  @IsOptional()
  @IsInt()
  @Min(6)
  @Max(60)
  maxTotalTurns?: number;
}
