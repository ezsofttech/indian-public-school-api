import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User, UserSchema } from './schemas/user.schema';
import { UserRepository } from './user.repository';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('jwt.secret') ||
          configService.get<string>('JWT_SECRET', 'super_secret_ips_admin_jwt_token_key_2026'),
        signOptions: {
          expiresIn: (configService.get<string>('jwt.expiresIn') || configService.get<string>('JWT_EXPIRES_IN', '7d')) as any,
        },
      }),
    }),
  ],
  providers: [UserRepository, AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, UserRepository, JwtStrategy, PassportModule],
})
export class AuthModule {}
