import { IsString, Length, Matches } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @Length(3, 64)
  @Matches(/^[A-Za-z0-9._-]+$/)
  username!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}
