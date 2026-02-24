import { IsString, MinLength } from 'class-validator';

export class SubmitAiInterviewAnswerDto {
  @IsString()
  @MinLength(1)
  answer!: string;
}
