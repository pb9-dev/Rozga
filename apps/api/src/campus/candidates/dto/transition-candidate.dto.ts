import { IsString, MinLength } from 'class-validator';

export class TransitionCandidateDto {
  @IsString()
  @MinLength(1)
  toStageKey!: string;
}
