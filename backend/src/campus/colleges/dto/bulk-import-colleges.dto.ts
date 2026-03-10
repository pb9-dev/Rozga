import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, Length, ValidateNested } from 'class-validator';

class BulkImportCollegeItemDto {
  @IsString()
  @Length(2, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  code?: string;
}

export class BulkImportCollegesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkImportCollegeItemDto)
  colleges!: BulkImportCollegeItemDto[];
}
