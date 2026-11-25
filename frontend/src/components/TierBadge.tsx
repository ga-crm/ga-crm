import { Award, Crown, Gem, Heart, Medal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * CUS-2, decided 26/11/2026: each client tier has its own icon and colour, so tiers are told apart
 * at a glance: a heart for "Thân thiết", a medal for "Bạc", a crown for "Vàng", a gem for
 * "Kim Cương". The colours are theme tokens (`tier-*`), text on its own band.
 */
const TIERS: Record<string, { icon: LucideIcon; tone: string }> = {
  'Thân thiết': { icon: Heart, tone: 'bg-tier-member-band text-tier-member' },
  Bạc: { icon: Medal, tone: 'bg-tier-silver-band text-tier-silver' },
  Vàng: { icon: Crown, tone: 'bg-tier-gold-band text-tier-gold' },
  'Kim Cương': { icon: Gem, tone: 'bg-tier-diamond-band text-tier-diamond' },
}

/** A tier written another way (an older file) keeps a neutral badge rather than a wrong colour. */
const OTHER = { icon: Award, tone: 'bg-chrome text-ink-meta' }

export function TierBadge({ tier, className }: { tier: string; className?: string }) {
  const { icon: Icon, tone } = TIERS[tier] ?? OTHER
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-caption font-medium whitespace-nowrap', tone, className)}>
      <Icon aria-hidden size={14} className="flex-none" />
      {tier}
    </span>
  )
}
