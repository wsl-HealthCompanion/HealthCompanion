import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { AvatarModel } from './upload-ticket.service';

const AVATAR_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export class AssignUserAvatarDto {
  @IsString()
  @Matches(AVATAR_ID_PATTERN)
  avatarId!: string;
}

export class ReserveAvatarDto {
  @IsString()
  @Matches(AVATAR_ID_PATTERN)
  avatarId!: string;

  @IsIn(['wav2lip', 'musetalk'])
  model!: AvatarModel;
}

export class DeleteAvatarDto {
  @IsString()
  @Matches(AVATAR_ID_PATTERN)
  confirmationId!: string;
}

export class AvatarTaskEventDto {
  @IsString()
  task_id!: string;

  @IsString()
  @Matches(AVATAR_ID_PATTERN)
  avatar_id!: string;

  @IsIn(['wav2lip', 'musetalk'])
  model!: AvatarModel;

  @IsIn(['pending', 'uploading', 'running', 'completed', 'failed', 'interrupted'])
  status!: 'pending' | 'uploading' | 'running' | 'completed' | 'failed' | 'interrupted';

  @IsInt()
  @Min(0)
  @Max(100)
  progress!: number;

  @IsOptional()
  @IsString()
  error_msg?: string | null;

  @IsOptional()
  @IsString()
  preview_path?: string | null;

  @IsOptional()
  @IsString()
  source_video_path?: string | null;

  @IsOptional()
  started_at?: number | null;

  @IsOptional()
  ended_at?: number | null;
}

export class ExistingAvatarImportItemDto {
  @IsString()
  @Matches(AVATAR_ID_PATTERN)
  avatar_id!: string;

  @IsIn(['wav2lip', 'musetalk'])
  model!: AvatarModel;

  @IsOptional()
  @IsString()
  preview_path?: string | null;

  @IsOptional()
  @IsString()
  source_video_path?: string | null;
}

export class ExistingAvatarImportDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ExistingAvatarImportItemDto)
  avatars!: ExistingAvatarImportItemDto[];

  @IsBoolean()
  initialize_users!: boolean;
}
