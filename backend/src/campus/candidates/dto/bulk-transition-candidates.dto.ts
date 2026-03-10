import { ArrayNotEmpty, IsArray, IsString, IsUUID, MinLength } from 'class-validator';

export class BulkTransitionCandidatesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  candidateIds!: string[];

  @IsString()
  @MinLength(1)
  toStageKey!: string;
}
