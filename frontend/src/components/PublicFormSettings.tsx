import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { t } from '../i18n'
import type { MessageKey } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { keys } from '../lib/queries'
import { toast } from '../lib/toast'
import type { PublicFormField, PublicFormSettings } from '../lib/types'
import { Badge, Button, Checkbox, Field, FormError, Input, Panel, Textarea } from './ui'

const FIELDS: PublicFormField[] = ['email', 'province', 'need']

/** CMP-4: the link and its QR code, to share or print. */
function ShareLink({ slug, campaignName }: { slug: string; campaignName: string }) {
  const link = `${window.location.origin}/f/${slug}`
  const [qr, setQr] = useState('')
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(link, { width: 480, margin: 2, errorCorrectionLevel: 'M' })
      .then((data) => {
        if (alive) setQr(data)
      })
      .catch(() => setQr(''))
    return () => {
      alive = false
    }
  }, [link])
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <Field label={t('campaigns.formLink')} htmlFor="form-link" hint={t('campaigns.formLinkHint')}>
          <Input id="form-link" readOnly value={link} onFocus={(event) => event.target.select()} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(link).then(() => toast.info(t('toast.linkCopied')))
            }}
          >
            {t('common.copy')}
          </Button>
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center text-caption text-primary hover:underline">
            {t('campaigns.formOpen')}
          </a>
        </div>
      </div>
      {qr && (
        <div className="flex flex-col items-center gap-2">
          <img src={qr} alt={t('campaigns.formQr', { name: campaignName })} className="size-36 rounded-md border border-band" />
          <a href={qr} download={`qr-${slug}.png`} className="inline-flex items-center gap-1 text-caption text-primary hover:underline">
            <Download aria-hidden size={14} />
            {t('campaigns.formQrDownload')}
          </a>
        </div>
      )}
    </div>
  )
}

/** CMP-4 + section 16 "cài đặt form công khai và QR": for campaigns.manage on the campaign page. */
export function PublicFormSettingsCard({ campaignId, campaignName, form }: { campaignId: string; campaignName: string; form: PublicFormSettings | null }) {
  const queryClient = useQueryClient()
  const [enabled, setEnabled] = useState(form?.enabled ?? true)
  const [fields, setFields] = useState<PublicFormField[]>(form?.fields ?? ['email', 'need'])
  const [consentText, setConsentText] = useState(form?.consentText ?? t('campaigns.formConsentDefault'))
  const [privacyNotice, setPrivacyNotice] = useState(form?.privacyNotice ?? t('campaigns.formPrivacyDefault'))
  const save = useMutation({
    mutationFn: () => api.put<PublicFormSettings>(`/campaigns/${campaignId}/form`, { enabled, fields, consentText: consentText.trim(), privacyNotice: privacyNotice.trim() }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: keys.campaigns })
      toast.success(t(saved.enabled ? 'toast.formOn' : 'toast.formOff', { name: campaignName }))
    },
  })
  const ready = consentText.trim() !== '' && privacyNotice.trim() !== ''
  return (
    <Panel className="p-5">
      <h2 className="flex flex-wrap items-center gap-2 text-subhead text-ink">
        {t('campaigns.form')}
        {form && <Badge tone={form.enabled ? 'success' : 'muted'}>{t(form.enabled ? 'campaigns.formOn' : 'campaigns.formOff')}</Badge>}
      </h2>
      <p className="mt-1 text-caption text-ink-meta">{t('campaigns.formHelp')}</p>
      {form && <ShareLink slug={form.slug} campaignName={campaignName} />}
      <form
        className="mt-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (ready) save.mutate()
        }}
      >
        <label className="flex items-center gap-2 py-1 text-link text-ink">
          <Checkbox checked={enabled} onChange={(checked) => setEnabled(checked)} />
          {t('campaigns.formEnabled')}
        </label>
        <fieldset className="mt-2">
          <legend className="text-caption font-medium text-ink">{t('campaigns.formFields')}</legend>
          <p className="text-caption text-ink-meta">{t('campaigns.formFieldsHint')}</p>
          <div className="mt-1 flex flex-wrap gap-x-4">
            {FIELDS.map((field) => (
              <label key={field} className="flex items-center gap-2 py-1 text-caption text-ink-body">
                <Checkbox checked={fields.includes(field)} onChange={(checked) => setFields((list) => (checked ? [...list, field] : list.filter((item) => item !== field)))} />
                {t(`campaigns.formField.${field}` as MessageKey)}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={t('campaigns.formConsent')} htmlFor="form-consent" required hint={t('campaigns.formConsentHint')}>
          <Textarea id="form-consent" rows={3} maxLength={2000} value={consentText} onChange={(event) => setConsentText(event.target.value)} />
        </Field>
        <Field label={t('campaigns.formPrivacy')} htmlFor="form-privacy" required>
          <Textarea id="form-privacy" rows={4} maxLength={4000} value={privacyNotice} onChange={(event) => setPrivacyNotice(event.target.value)} />
        </Field>
        <FormError message={save.isError ? errorMessage(save.error) : undefined} />
        <Button type="submit" disabled={!ready || save.isPending}>
          {form ? t('common.save') : t('campaigns.formCreate')}
        </Button>
      </form>
    </Panel>
  )
}
