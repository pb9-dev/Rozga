import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateFlowDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /**
   * Campus flow builder payload (stages/transitions). Validated with Zod in service.
   */
  config!: unknown;
}
