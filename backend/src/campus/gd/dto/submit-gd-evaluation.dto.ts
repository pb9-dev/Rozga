import { IsUUID } from 'class-validator';

export class SubmitGdEvaluationDto {
  @IsUUID()
  gdGroupId!: string;

  @IsUUID()
  candidateId!: string;

  /** Validated with Zod in service */
  evaluation!: unknown;
}
