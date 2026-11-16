import { useMutation } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { toast } from '../lib/toast'
import { Button, Field, FormError, Input } from './ui'

/** USER-16: the ten recovery codes, shown once, to copy or save. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join('\n')
  return (
    <div>
      <p className="text-link text-ink-body">{t('mfa.recoveryHelp')}</p>
      <ol className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-chrome p-3 font-mono text-caption text-ink tabular-nums">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => toast.info(t('toast.recoveryCopied')))
          }}
        >
          {t('common.copy')}
        </Button>
        <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download="ga-crm-ma-du-phong.txt" className="inline-flex min-h-9 items-center text-caption text-primary hover:underline">
          {t('mfa.recoveryDownload')}
        </a>
      </div>
      <Button className="mt-4 w-full" onClick={onDone}>
        {t('mfa.recoverySaved')}
      </Button>
    </div>
  )
}

/** USER-16: scan, confirm with the first code, keep the recovery codes. */
export function MfaSetup({ onDone }: { onDone: () => void }) {
  const [qr, setQr] = useState('')
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const start = useMutation({ mutationFn: () => api.post<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup') })
  const enable = useMutation({
    mutationFn: () => api.post<{ recoveryCodes: string[] }>('/auth/mfa/enable', { code: code.trim() }),
    onSuccess: ({ recoveryCodes }) => {
      toast.success(t('toast.mfaEnabled'))
      setCodes(recoveryCodes)
    },
  })
  const setup = start.data
  useEffect(() => {
    if (!setup) return
    let alive = true
    QRCode.toDataURL(setup.otpauthUrl, { width: 360, margin: 1 })
      .then((data) => {
        if (alive) setQr(data)
      })
      .catch(() => setQr(''))
    return () => {
      alive = false
    }
  }, [setup])

  if (codes) return <RecoveryCodes codes={codes} onDone={onDone} />
  if (!setup)
    return (
      <div>
        <p className="text-link text-ink-body">{t('mfa.intro')}</p>
        <FormError message={start.isError ? errorMessage(start.error) : undefined} />
        <Button className="mt-2" disabled={start.isPending} onClick={() => start.mutate()}>
          {t('mfa.begin')}
        </Button>
      </div>
    )
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (/^\d{6}$/.test(code.trim())) enable.mutate()
      }}
    >
      <p className="text-link text-ink-body">{t('mfa.scan')}</p>
      <div className="mt-3 flex flex-col items-center gap-2">
        {qr && <img src={qr} alt={t('mfa.qrAlt')} className="size-44 rounded-md border border-band" />}
        <p className="text-caption text-ink-meta">{t('mfa.manual')}</p>
        <code className="rounded-sm bg-chrome px-2 py-1 font-mono text-caption break-all text-ink">{setup.secret}</code>
      </div>
      <Field label={t('mfa.code')} htmlFor="mfa-enable-code" required>
        <Input id="mfa-enable-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder={t('placeholder.mfaCode')} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} />
      </Field>
      <FormError message={enable.isError ? errorMessage(enable.error) : undefined} />
      <Button type="submit" className="w-full" disabled={code.length !== 6 || enable.isPending}>
        {t('mfa.confirm')}
      </Button>
    </form>
  )
}
