import type { CampaignStatus } from './types'

/** Badge tones for a campaign's status (CMP-1): running stands out, ended steps back. */
export const campaignStatusTone = (status: CampaignStatus) => (status === 'ACTIVE' ? 'success' : status === 'PLANNED' ? 'info' : 'muted')
