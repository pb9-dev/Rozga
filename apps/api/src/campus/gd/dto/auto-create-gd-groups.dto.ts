import { ArrayNotEmpty, IsArray, IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class AutoCreateGdGroupsDto {
  @IsUUID()
  batchId!: string;

  @IsInt()
  @Min(1)
  @Max(500)
  groupSize!: number;

  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;

  @IsOptional()
  @IsBoolean()
  onlyUnassigned?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  interviewerUserIds?: string[];
}
