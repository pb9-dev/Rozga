import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertInterviewerDto {
  @IsEmail()
  email!: string;

  /**
   * Optional temp password. If omitted and the user doesn't exist yet, the API will generate one.
   * Not used when promoting an existing user.
   */
  @IsOptional()
  @IsString()
  @MinLength(8)
  tempPassword?: string;
}
