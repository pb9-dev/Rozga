import { IsObject, IsUUID } from 'class-validator';

export class CreateInterviewAssignmentDto {
  @IsUUID()
  batchId!: string;

  /** Validated with Zod in service */
  @IsObject()
  allocation!: Record<string, unknown>;
}
