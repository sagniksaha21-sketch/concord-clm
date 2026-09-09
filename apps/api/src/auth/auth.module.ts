import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EntraService } from './entra.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

/**
 * Auth + RBAC. JwtAuthGuard (authentication) and RolesGuard (authorization) are
 * registered as global guards, so every route is protected by default —
 * `@Public()` opens login/SSO/webhooks, `@Roles()` restricts by permission.
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    EntraService,
    JwtAuthGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
