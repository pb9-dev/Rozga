import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateInterviewRoomDto {
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;

  /** Defaults to 7 days if omitted. */
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60 * 24 * 30)
  expiresInMinutes?: number;
}
