import { ArrayNotEmpty, IsArray } from 'class-validator';

export class ImportCandidatesDto {
  @IsArray()
  @ArrayNotEmpty()
  candidates!: unknown[];
}
