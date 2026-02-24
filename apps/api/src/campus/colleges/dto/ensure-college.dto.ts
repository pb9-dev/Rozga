import { IsOptional, IsString, Length } from 'class-validator';

export class EnsureCollegeDto {
  @IsString()
  @Length(2, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 10)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 300)
  state?: string;
}
