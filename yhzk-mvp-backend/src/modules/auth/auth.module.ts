import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { jwtConfig } from '../../config/jwt.config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { User } from './entities/user.entity';
import { SmsCode } from './entities/sms-code.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { DigitalHumanModule } from '../digital-human/digital-human.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => {
        const config = jwtConfig();
        // 如果使用 RSA 密钥对, signOptions 指定 algorithm: 'RS256'
        // 开发环境降级 HS256: algorithm: 'HS256'
        const algorithm = config.privateKey.startsWith('-----BEGIN') ? 'RS256' : 'HS256';

        return {
          secret: algorithm === 'HS256' ? config.privateKey : undefined,
          privateKey: algorithm === 'RS256' ? config.privateKey : undefined,
          signOptions: {
            algorithm: algorithm as any,
            expiresIn: config.accessExpiresIn,
          },
        };
      },
    }),
    TypeOrmModule.forFeature([User, SmsCode, RefreshToken]),
    DigitalHumanModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule, TypeOrmModule],
})
export class AuthModule {}
