import {
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '../../common/rbac.js';
import type { Env } from '../../config/env.validation.js';
import { AuthModule } from '../auth/auth.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { UsersModule } from '../users/users.module.js';
import { UsersService } from '../users/users.service.js';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';

/** Creates the first Platform Admin from the environment when none exists. */
@Injectable()
class PlatformAdminBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformAdminBootstrap.name);

  constructor(
    private readonly platform: PlatformService,
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (await this.platform.hasPlatformAdmin()) return;

    const email = this.config
      .get('PLATFORM_ADMIN_EMAIL', { infer: true })
      .toLowerCase();
    try {
      await this.users.createActive(null, {
        email,
        name: this.config.get('PLATFORM_ADMIN_NAME', { infer: true }),
        roles: [Role.PlatformAdmin],
        password: this.config.get('PLATFORM_ADMIN_PASSWORD', { infer: true }),
      });
    } catch (error) {
      // Several instances starting on an empty database race for this; losing is not a failure
      if (await this.platform.hasPlatformAdmin()) return;
      throw error;
    }
    this.logger.log(`Created Platform Admin ${email}`);
  }
}

@Module({
  imports: [TenantsModule, UsersModule, AuthModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformAdminBootstrap],
})
export class PlatformModule {}
