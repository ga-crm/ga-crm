import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDateTime, t, tDynamic } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { showDate } from '../lib/leadLabels'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import type { LeadDetail, LinkSuggestion } from '../lib/types'
import { Badge, Button, Container, Dialog, EmptyState, Field, FormError, Input, MODAL_FOOTER, Notice, Panel, SearchInput, Select, Spinner } from './ui'

function useRefresh() {
  const queryClient = useQueryClient()
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: keys.leads }), queryClient.invalidateQueries({ queryKey: keys.clients })])
}

/** LEAD-32: one suggested client, with why it was suggested and what Success knows about it. */
function SuggestionCard({ leadId, item, onLinked }: { leadId: string; item: LinkSuggestion; onLinked: () => void }) {
  const refresh = useRefresh()
  const [applicationNo, setApplicationNo] = useState('')
  const link = useMutation({
    mutationFn: () => api.post(`/leads/${leadId}/link`, { clientId: item.clientId, ...(applicationNo && { applicationNo }) }),
    onSuccess: async () => {
      await refresh()
      toast.success(t('toast.leadLinked', { name: item.name }), t('toast.leadLinkedDetail'))
      onLinked()
    },
  })
  return (
    <Panel as="li" className="sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink-body">{item.name}</p>
          <p className="text-caption text-ink-meta tabular-nums">{[item.ageBand, item.gender].filter(Boolean).join(' · ') || '-'}</p>
        </div>
        <Badge tone={item.score >= 0.6 ? 'success' : 'muted'}>{t('link.score', { score: Math.round(item.score * 100) })}</Badge>
      </div>
      {item.reasons.length > 0 && <p className="mt-2 text-caption text-ink-body">{item.reasons.map((reason) => tDynamic(`link.reason.${reason}`, reason)).join(' · ')}</p>}
      <dl className="mt-2 grid gap-1 text-caption sm:grid-cols-[8rem_1fr]">
        <dt className="text-ink-meta">{t('link.policies')}</dt>
        <dd className="text-ink-body tabular-nums">{item.policies.map((policy) => (policy.status ? `${policy.policyNo} (${policy.status})` : policy.policyNo)).join(', ') || t('link.none')}</dd>
        <dt className="text-ink-meta">{t('link.applications')}</dt>
        <dd className="text-ink-body tabular-nums">{item.applications.map((application) => `${application.applicationNo} (${application.status}, ${showDate(application.createdDate)})`).join(', ') || t('link.none')}</dd>
      </dl>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        {/* LEAD-32: the application is optional; naming it lets LEAD-33 follow that one */}
        <div className="sm:w-72">
          <Select aria-label={t('link.application')} title={t('link.applicationHint')} value={applicationNo} disabled={item.applications.length === 0} onChange={(event) => setApplicationNo(event.target.value)}>
            <option value="">{t('link.applicationNone')}</option>
            {item.applications.map((application) => (
              <option key={application.applicationNo} value={application.applicationNo}>
                {`${application.applicationNo} · ${application.status}`}
              </option>
            ))}
          </Select>
        </div>
        <Button disabled={link.isPending} onClick={() => link.mutate()}>
          {t('link.confirm')}
        </Button>
      </div>
      <FormError message={link.isError ? errorMessage(link.error) : undefined} />
    </Panel>
  )
}

/** LEAD-32: undoing a link asks why. */
function UnlinkDialog({ detail, open, onClose }: { detail: LeadDetail; open: boolean; onClose: () => void }) {
  const refresh = useRefresh()
  const [reason, setReason] = useState('')
  // CUS-5 + PDP-4: someone who may not open the client does not get its name
  const name = detail.link?.clientName
  const unlink = useMutation({
    mutationFn: () => api.delete(`/leads/${detail.lead.id}/link`, { reason: reason.trim() }),
    onSuccess: async () => {
      await refresh()
      toast.info(name ? t('toast.leadUnlinked', { name }) : t('toast.leadUnlinkedHidden'))
      setReason('')
      onClose()
    },
  })
  return (
    <Dialog title={name ? t('link.unlinkTitle', { name }) : t('link.unlinkTitleHidden')} open={open} onClose={onClose}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (reason.trim()) unlink.mutate()
        }}
      >
        <Field label={t('link.reason')} htmlFor="unlink-reason" required>
          <Input id="unlink-reason" maxLength={500} placeholder={t('placeholder.unlinkReason')} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <FormError message={unlink.isError ? errorMessage(unlink.error) : undefined} />
        <div className={MODAL_FOOTER}>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="danger" disabled={!reason.trim() || unlink.isPending}>
            {t('link.unlink')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Section 16 (lead): "Khách hàng liên kết". */
export function LeadLinkTab({ detail }: { detail: LeadDetail }) {
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [unlinking, setUnlinking] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), 300)
    return () => clearTimeout(timer)
  }, [input])
  const showSuggestions = !detail.link && detail.canLink
  const suggestions = useQuery({ ...queries.linkSuggestions(detail.lead.id, q), enabled: showSuggestions })
  const items = suggestions.data?.items ?? []

  return (
    <Container className="pb-8">
      <p className="mb-4 max-w-3xl text-caption text-ink-meta">{t('link.help')}</p>
      {detail.link ? (
        <section className="max-w-3xl rounded-lg bg-chrome p-5">
          <p className="text-caption text-ink-meta">{t('link.linkedTo')}</p>
          {detail.link.clientId ? (
            <p className="mt-1">
              <Link to={`/clients/${detail.link.clientId}`} className="text-subhead text-primary hover:underline">
                {detail.link.clientName ?? t('clients.client')}
              </Link>
            </p>
          ) : (
            // CUS-5 + PDP-4: the person does not see client pages, so only the fact of the link
            <p className="mt-1 text-link text-ink-body">{t('link.hiddenClient')}</p>
          )}
          {detail.link.linkedAt && <p className="mt-1 text-caption text-ink-meta">{t('link.linkedAt', { at: formatDateTime(detail.link.linkedAt) })}</p>}
          {detail.canWork && (
            <Button variant="ghost" className="mt-3" onClick={() => setUnlinking(true)}>
              {t('link.unlink')}
            </Button>
          )}
          <UnlinkDialog detail={detail} open={unlinking} onClose={() => setUnlinking(false)} />
        </section>
      ) : !detail.canWork ? (
        <Notice>{t('link.readOnly')}</Notice>
      ) : !detail.canLink ? (
        <Notice>{t('link.notYet')}</Notice>
      ) : (
        <section className="max-w-3xl">
          <div className="mb-3 sm:w-96">
            <SearchInput label={t('link.search')} placeholder={t('placeholder.clientSearch')} value={input} onValueChange={setInput} />
          </div>
          <h2 className="mb-2 text-subhead text-ink">{q ? t('link.search') : t('link.suggested')}</h2>
          {suggestions.isPending && <Spinner />}
          {suggestions.data && items.length === 0 && <EmptyState>{q ? t('link.noMatch') : t('link.noSuggestions')}</EmptyState>}
          <ul className="space-y-3">
            {items.map((item) => (
              <SuggestionCard key={item.clientId} leadId={detail.lead.id} item={item} onLinked={() => setInput('')} />
            ))}
          </ul>
        </section>
      )}
    </Container>
  )
}
