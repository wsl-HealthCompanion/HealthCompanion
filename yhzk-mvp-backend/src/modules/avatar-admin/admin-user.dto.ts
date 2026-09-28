import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { UserStatus } from '../auth/entities/user.entity';

function preserveRawBoolean({ obj, key, value }: TransformFnParams): unknown {
  if (!obj || typeof obj !== 'object') return value;
  return (obj as Record<string, unknown>)[key];
}

export class CreateAdminUserDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsPhoneNumber('CN')
  phone!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(preserveRawBoolean, { toClassOnly: true })
  @IsBoolean()
  isElderly?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(preserveRawBoolean, { toClassOnly: true })
  @IsBoolean()
  careMode?: boolean;
}

export class UpdateAdminUserDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsPhoneNumber('CN')
  phone?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(preserveRawBoolean, { toClassOnly: true })
  @IsBoolean()
  isElderly?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(preserveRawBoolean, { toClassOnly: true })
  @IsBoolean()
  careMode?: boolean;
}

export class AdminUserListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export interface AdminUserView {
  id: string;
  phone: string | null;
  status: UserStatus;
  isElderly: boolean;
  careMode: boolean;
  accountState: 'enabled' | 'disabled';
  disabledAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserListResult {
  items: AdminUserView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
