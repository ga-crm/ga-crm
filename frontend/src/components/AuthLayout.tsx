import type { ReactNode } from 'react'
import { t } from '../i18n'
import { HexBackdrop } from './HexBackdrop'
import { LoginScene } from './LoginScene'
import { Logo } from './ui'

/**
 * A navy brand panel beside the form, with no global bar: the brand sits on the panel, which is all
 * picture: the CRM's blocks in motion (LoginScene) over a honeycomb that answers the pointer
 * (HexBackdrop). The panel takes 60% of the width and the form 40%; below 1024px the panel drops
 * away and the logo moves above the form.
 */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[3fr_2fr]">
      {/* `isolate` keeps the pattern (-z-10) above the panel's own gradient and under everything else */}
      <aside className="relative isolate hidden min-w-0 flex-col overflow-hidden bg-gradient-to-br from-panel-from to-panel-to p-10 text-white lg:flex">
        <HexBackdrop className="-z-10" />
        <span className="flex flex-none items-center gap-2 whitespace-nowrap">
          <span aria-hidden className="flex size-8 flex-none items-center justify-center rounded-md bg-white text-caption font-bold text-panel-from">
            GA
          </span>
          <span className="text-nav font-medium">{t('app.name')}</span>
        </span>
        {/* The picture takes all the room that is left, at whatever shape the window gives it */}
        <div className="relative min-h-0 flex-1">
          <LoginScene className="absolute inset-0 size-full" />
        </div>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-section-title text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-link text-ink-body">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
