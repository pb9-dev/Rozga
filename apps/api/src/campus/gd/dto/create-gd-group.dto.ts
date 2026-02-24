import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateGdGroupDto {
  @IsUUID()
  batchId!: string;

  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  candidateIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  interviewerUserIds?: string[];
}
