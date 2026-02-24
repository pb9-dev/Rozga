import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateBatchDto {
  @IsUUID()
  collegeId!: string;

  @IsUUID()
  jobId!: string;

  @IsUUID()
  flowId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;
}
