import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateFlowDto {
  @IsUUID()
  collegeId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /**
   * Campus flow builder payload (stages/transitions). Validated with Zod in service.
   */
  config!: unknown;
}
