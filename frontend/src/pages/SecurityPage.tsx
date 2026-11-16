import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { MfaSetup, RecoveryCodes } from '../components/MfaSetup'
import { Alert, Badge, Button, Card, Container, Field, FormError, Input, PageHeader, Spinner } from '../components/ui'
import { t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'

/** USER-16: the person's own MFA: turn it on, new recovery codes, turn it off where allowed. */
export function SecurityPage() {
  const queryClient = useQueryClient()
  const status = useQuery(queries.mfaStatus())
  const [settingUp, setSettingUp] = useState(false)
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: keys.me }), queryClient.invalidateQueries({ queryKey: ['mfa'] })])
  const regenerate = useMutation({
    mutationFn: () => api.post<{ recoveryCodes: string[] }>('/auth/mfa/recovery-codes', { code: code.trim() }),
    onSuccess: async ({ recoveryCodes }) => {
      setCodes(recoveryCodes)
      setCode('')
      await refresh()
      toast.success(t('toast.recoveryRegenerated'))
    },
  })
  const disable = useMutation({
    mutationFn: () => api.post('/auth/mfa/disable', { code: code.trim() }),
    onSuccess: async () => {
      setCode('')
      await refresh()
      toast.info(t('toast.mfaDisabled'))
    },
  })
  const failed = regenerate.isError ? regenerate.error : disable.isError ? disable.error : null

  return (
    <>
      <PageHeader title={t('settings.security')} subtitle={t('mfa.settingsSubtitle')} />
      <Container className="min-h-0 flex-1 overflow-y-auto pb-6">
        {status.isPending && <Spinner />}
        {status.isError && <Alert>{errorMessage(status.error)}</Alert>}
        {status.data && (
          <Card>
            <section className="px-4 py-5 md:px-6">
              <h2 className="flex flex-wrap items-center gap-2 text-subhead text-ink">
                {t('mfa.title')}
                <Badge tone={status.data.enabled ? 'success' : 'muted'}>{t(status.data.enabled ? 'mfa.on' : 'mfa.off')}</Badge>
                {status.data.required && <Badge tone="info">{t('mfa.mandatory')}</Badge>}
              </h2>
              {codes ? (
                <div className="mt-3 max-w-md">
                  <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
                </div>
              ) : !status.data.enabled ? (
                <div className="mt-3 max-w-md">
                  {settingUp ? (
                    <MfaSetup
                      onDone={() => {
                        setSettingUp(false)
                        void refresh()
                      }}
                    />
                  ) : (
                    <>
                      <p className="text-link text-ink-body">{t('mfa.offHelp')}</p>
                      <Button className="mt-3" onClick={() => setSettingUp(true)}>
                        {t('mfa.turnOn')}
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-3 max-w-md">
                  <p className="text-link text-ink-body">{t(status.data.required ? 'mfa.onHelpRequired' : 'mfa.onHelp', { count: status.data.recoveryCodesLeft })}</p>
                  <Field label={t('mfa.codeOrRecovery')} htmlFor="mfa-manage-code" hint={t('mfa.codeOrRecoveryHint')}>
                    <Input id="mfa-manage-code" autoComplete="one-time-code" maxLength={20} placeholder={t('placeholder.mfaCode')} value={code} onChange={(event) => setCode(event.target.value)} />
                  </Field>
                  <FormError message={failed ? errorMessage(failed) : undefined} />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" disabled={!code.trim() || regenerate.isPending} onClick={() => regenerate.mutate()}>
                      {t('mfa.newRecovery')}
                    </Button>
                    {!status.data.required && (
                      <Button variant="danger" disabled={!code.trim() || disable.isPending} onClick={() => disable.mutate()}>
                        {t('mfa.turnOff')}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </section>
          </Card>
        )}
      </Container>
    </>
  )
}
