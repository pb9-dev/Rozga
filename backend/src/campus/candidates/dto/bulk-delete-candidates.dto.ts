import { IsArray, IsUUID } from 'class-validator';

export class BulkDeleteCandidatesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  candidateIds!: string[];
}
