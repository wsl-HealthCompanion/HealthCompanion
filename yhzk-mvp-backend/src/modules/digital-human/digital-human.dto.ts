import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateDigitalHumanSessionDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{16,128}$/)
  clientInstanceId!: string;
}

export class SubtitleSegmentDto {
  @IsInt()
  @Min(0)
  index!: number;

  @IsString()
  @MaxLength(1000)
  text!: string;
}

export class SpeakDigitalHumanDto {
  @IsString()
  @MaxLength(20_000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  roundId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubtitleSegmentDto)
  subtitleSegments?: SubtitleSegmentDto[];

  @IsOptional()
  @IsObject()
  tts?: Record<string, unknown>;
}
