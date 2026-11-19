import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, Button, Card, Checkbox, ConfirmDialog, Container, FormError, PageHeader, Spinner } from '../components/ui'
import { t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import type { PlatformSettings } from '../lib/types'

/** USER-16: what the Platform Admin decides for every GA at once (docs/decisions.md, 20/11/2026). */
export function PlatformSettingsPage() {
  const queryClient = useQueryClient()
  const settings = useQuery(queries.platformSettings())
  // Null until the box is changed; from then on the stored value no longer drives it
  const [draft, setDraft] = useState<boolean | null>(null)
  const [confirming, setConfirming] = useState(false)
  const stored = settings.data?.mfaEnforced
  const enforced = draft ?? stored ?? true
  const dirty = stored !== undefined && enforced !== stored

  const save = useMutation({
    mutationFn: (mfaEnforced: boolean) => api.put('/platform/settings', { mfaEnforced }),
    onSuccess: async (_saved, mfaEnforced) => {
      // The saved value first, so the box does not flip back while the list refetches
      queryClient.setQueryData<PlatformSettings>(keys.platformSettings, { mfaEnforced })
      setDraft(null)
      setConfirming(false)
      // The Platform Admin's own "required" flag follows the switch
      await Promise.all([queryClient.invalidateQueries({ queryKey: keys.platformSettings }), queryClient.invalidateQueries({ queryKey: keys.me })])
      if (mfaEnforced) toast.success(t('toast.platformMfaOn'), t('toast.platformMfaOnDetail'))
      else toast.warning(t('toast.platformMfaOff'), t('toast.platformMfaOffDetail'))
    },
  })

  return (
    <>
      <PageHeader
        title={t('settingsPlatform.title')}
        subtitle={t('settingsPlatform.subtitle')}
        action={
          // Turning it off weakens every GA at once, so that direction asks first
          <Button disabled={!dirty || save.isPending} onClick={() => (enforced ? save.mutate(true) : setConfirming(true))}>
            {t('common.save')}
          </Button>
        }
      />
      <Container className="min-h-0 flex-1 overflow-y-auto pb-6">
        {settings.isPending && <Spinner />}
        {settings.isError && <Alert>{errorMessage(settings.error)}</Alert>}
        {settings.data && (
          <Card>
            <section className="px-4 py-5 md:px-6">
              <h2 className="mb-3 text-subhead text-ink">{t('settingsPlatform.security')}</h2>
              <label className="flex items-start gap-3">
                <Checkbox className="mt-1" checked={enforced} onChange={setDraft} />
                <span>
                  <span className="block text-link text-ink">{t('settingsPlatform.mfaEnforced')}</span>
                  <span className="block text-caption text-ink-meta">{t('settingsPlatform.mfaEnforcedHint')}</span>
                </span>
              </label>
              {/* While the question is open, the error shows there */}
              <FormError message={save.isError && !confirming ? errorMessage(save.error) : undefined} />
            </section>
          </Card>
        )}
      </Container>
      <ConfirmDialog
        message={confirming ? t('settingsPlatform.confirmMfaOff') : null}
        danger
        pending={save.isPending}
        error={save.isError ? errorMessage(save.error) : undefined}
        onConfirm={() => save.mutate(false)}
        onClose={() => {
          setConfirming(false)
          save.reset()
        }}
      />
    </>
  )
}
