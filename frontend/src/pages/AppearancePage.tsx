import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useMe } from '../auth/useMe'
import { Button, Container, PageHeader, RadioCard, RadioGroup } from '../components/ui'
import { t, tDynamic } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { keys } from '../lib/queries'
import { ACCENT_PRESETS, DEFAULT_APPEARANCE, THEMES } from '../lib/theme'
import { toast } from '../lib/toast'
import type { Appearance, Me } from '../lib/types'

const SAVE_DELAY_MS = 400

function ThemeSample({ theme }: { theme: string }) {
  return (
    <span data-theme={theme} className="flex flex-1 flex-col gap-1.5 bg-canvas p-2">
      <span className="h-2 bg-chrome" />
      <span className="h-1.5 w-2/3 bg-ink-body" />
      <span className="h-3 w-8 rounded-sm bg-primary" />
    </span>
  )
}

export function AppearancePage() {
  const { data: me } = useMe()
  const queryClient = useQueryClient()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const unsaved = useRef<Appearance | null>(null)
  const lastChange = useRef('')

  const save = useMutation({
    mutationFn: (next: Appearance) => api.patch('/me', { appearance: next }),
    onSuccess: () => {
      toast.success(lastChange.current)
    },
    onError: (error) => {
      toast.error(t('toast.appearanceFailed'), errorMessage(error))
      void queryClient.invalidateQueries({ queryKey: keys.me })
    },
  })

  // Leaving the page must not lose a choice that is still waiting to be saved
  useEffect(() => {
    return () => {
      clearTimeout(timer.current)
      if (unsaved.current) {
        api.patch('/me', { appearance: unsaved.current }).then(
          () => toast.success(lastChange.current),
          (error: unknown) => toast.error(t('toast.appearanceFailed'), errorMessage(error)),
        )
      }
    }
  }, [])

  if (!me) return null
  const appearance = me.appearance
  const accent = appearance.accent.toLowerCase()

  // Applies at once and saves shortly after, because the colour picker fires on every drag step
  const update = (patch: Partial<Appearance>, message: string) => {
    const next = { ...appearance, ...patch }
    lastChange.current = message
    queryClient.setQueryData<Me | null>(keys.me, (current) => current && { ...current, appearance: next })
    unsaved.current = next
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      unsaved.current = null
      save.mutate(next)
    }, SAVE_DELAY_MS)
  }

  return (
    <>
      <PageHeader
        title={t('settings.appearance')}
        subtitle={t('settings.appearanceSubtitle')}
        action={
          <Button variant="secondary" onClick={() => update(DEFAULT_APPEARANCE, t('toast.appearanceReset'))}>
            {t('settings.reset')}
          </Button>
        }
      />
      <Container className="pt-2 pb-8">
        <fieldset>
          <legend className="mb-3 text-nav font-medium text-ink">{t('settings.theme')}</legend>
          <RadioGroup
            aria-label={t('settings.theme')}
            value={appearance.theme}
            onValueChange={(theme) => update({ theme }, t('toast.themeChanged', { name: tDynamic(`theme.${theme}`, theme) }))}
            className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
          >
            {THEMES.map((theme) => (
              <RadioCard key={theme} value={theme} className="flex flex-col gap-2 p-2">
                <span aria-hidden className="flex h-16 overflow-hidden rounded-sm border border-band">
                  {theme === 'system' ? (
                    <>
                      <ThemeSample theme="light" />
                      <ThemeSample theme="dark" />
                    </>
                  ) : (
                    <ThemeSample theme={theme} />
                  )}
                </span>
                <span className="flex min-h-6 items-center justify-between gap-1 text-caption text-ink-list">
                  {tDynamic(`theme.${theme}`, theme)}
                  {appearance.theme === theme && <Check aria-hidden size={16} className="shrink-0 text-primary" />}
                </span>
              </RadioCard>
            ))}
          </RadioGroup>
        </fieldset>

        <fieldset className="mt-8">
          <legend className="mb-1 text-nav font-medium text-ink">{t('settings.accent')}</legend>
          <p className="mb-4 max-w-2xl text-caption text-ink-meta">{t('settings.accentHint')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <RadioGroup
              aria-label={t('settings.accent')}
              value={accent}
              onValueChange={(color) => {
                const preset = ACCENT_PRESETS.find((item) => item.color === color)
                update({ accent: color }, t('toast.accentChanged', { name: preset ? tDynamic(`accent.${preset.id}`, preset.id) : color }))
              }}
              className="flex flex-wrap items-center gap-3"
            >
              {ACCENT_PRESETS.map(({ id, color }) => (
                <RadioCard key={id} value={color} title={tDynamic(`accent.${id}`, id)} aria-label={tDynamic(`accent.${id}`, id)} className="flex size-11 items-center justify-center">
                  <span aria-hidden className="flex size-8 items-center justify-center rounded-sm text-white" style={{ backgroundColor: color }}>
                    {accent === color && <Check size={16} />}
                  </span>
                </RadioCard>
              ))}
            </RadioGroup>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-band px-2 text-caption text-ink-list hover:bg-chrome has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary">
              <input
                type="color"
                className="size-8 cursor-pointer"
                aria-label={t('settings.customAccent')}
                value={accent}
                onChange={(event) => update({ accent: event.target.value }, t('toast.accentChanged', { name: event.target.value }))}
              />
              {t('settings.customAccent')}
              <span className="text-ink-meta">{accent}</span>
            </label>
          </div>
        </fieldset>
      </Container>
    </>
  )
}
