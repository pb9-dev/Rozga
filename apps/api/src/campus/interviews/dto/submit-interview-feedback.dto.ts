/**
 * Feedback validated with Zod in service.
 */
import { IsObject, IsOptional, IsString } from 'class-validator';

export class SubmitInterviewFeedbackDto {
  @IsObject()
  feedback!: Record<string, unknown>;

  /** Optional: move candidate to next stage after feedback. */
  @IsOptional()
  @IsString()
  toStageKey?: string;
}
