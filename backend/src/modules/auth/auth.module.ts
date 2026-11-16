import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  AuthController,
  InvitesController,
  MeController,
} from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { DevSwitchController } from './dev-switch.controller.js';
import { LoginGuardService } from './login-guard.service.js';
import { MfaAdminController, MfaController } from './mfa.controller.js';
import { MfaService } from './mfa.service.js';
import { MeService } from './me.service.js';

@Module({
  imports: [TenantsModule, UsersModule, NotificationsModule],
  controllers: [
    AuthController,
    MeController,
    InvitesController,
    MfaController,
    DevSwitchController,
    MfaAdminController,
  ],
  providers: [AuthService, LoginGuardService, MeService, MfaService],
  exports: [AuthService, MfaService],
})
export class AuthModule {}
