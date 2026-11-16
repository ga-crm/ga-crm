import { buttonVariants } from '@/components/shadcn/button'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

/** The app's four kinds on top of shadcn/ui variants. Blue acts; red only for destructive actions. */
const SHADCN_VARIANT = { primary: 'default', secondary: 'outline', ghost: 'ghost', danger: 'outline' } as const

/** 44 px on phones, 36 px from 768 px up (ghost buttons 32 px), with the app's type ladder. */
const LOOK: Record<ButtonVariant, string> = {
  primary: 'min-h-11 px-3.5 text-button hover:bg-primary-deep md:min-h-9 md:text-caption md:font-medium',
  secondary: 'min-h-11 border-hairline bg-canvas px-3.5 text-button text-primary-deep hover:bg-chrome hover:text-primary-deep md:min-h-9 md:text-caption md:font-medium',
  ghost: 'min-h-11 px-2 text-caption font-normal text-primary hover:bg-band-blue hover:text-primary md:min-h-8',
  danger: 'min-h-11 border-alert bg-canvas px-3.5 text-button text-alert hover:bg-alert-band hover:text-alert md:min-h-9 md:text-caption md:font-medium',
}

export const BUTTON_VARIANTS = LOOK

/** The look of a button, also for a link that acts as one (a download, or moving to another screen). */
export const buttonClass = (variant: ButtonVariant = 'primary', className?: string) =>
  cn(buttonVariants({ variant: SHADCN_VARIANT[variant] }), 'h-auto cursor-pointer gap-1.5 transition-colors disabled:cursor-not-allowed', LOOK[variant], className)
