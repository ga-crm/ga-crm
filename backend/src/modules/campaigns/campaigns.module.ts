import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { CampaignsController } from './campaigns.controller.js';
import { CampaignsService } from './campaigns.service.js';
import { PublicFormService } from './public-form.service.js';
import { PublicFormsController } from './public-forms.controller.js';
import { TurnstileVerifier } from './turnstile.verifier.js';

/** Chapter 11 (CMP), with the public lead form (CMP-4). */
@Module({
  imports: [AccessModule, LeadsModule],
  controllers: [CampaignsController, PublicFormsController],
  providers: [CampaignsService, PublicFormService, TurnstileVerifier],
})
export class CampaignsModule {}
