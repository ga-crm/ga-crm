import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Card, Container, PageHeader, Spinner, Checkbox } from '../components/ui'
import { t, tDynamic } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { NOTIFICATION_TYPES } from '../lib/notificationLabels'
import { keys, queries } from '../lib/queries'
import { toast } from '../lib/toast'
import type { NotificationPref } from '../lib/types'

/** NTF-3: which events reach the person in the app. Push and email arrive later (NTF-1). */
export function NotificationSettingsPage() {
  const queryClient = useQueryClient()
  const prefs = useQuery(queries.notificationPrefs())
  const save = useMutation({
    mutationFn: (item: NotificationPref) => api.put('/notifications/prefs', { items: [item] }),
    onSuccess: async (_, item) => {
      await queryClient.invalidateQueries({ queryKey: keys.notifications })
      const label = tDynamic(`notificationType.${item.type}`, item.type)
      toast.success(item.inApp ? t('toast.notificationOn', { label }) : t('toast.notificationOff', { label }))
    },
    onError: (error) => toast.error(t('toast.notificationPrefFailed'), errorMessage(error)),
  })
  const on = new Map(prefs.data?.items.map((item) => [item.type, item.inApp]))

  return (
    <>
      <PageHeader title={t('settings.notifications')} subtitle={t('notification.settingsSubtitle')} />
      <Container className="min-h-0 flex-1 overflow-y-auto pb-6">
        {prefs.isPending && <Spinner />}
        {prefs.isError && <Alert>{errorMessage(prefs.error)}</Alert>}
        {prefs.data && (
          <Card>
            <ul className="divide-y divide-band px-4 md:px-6">
              {NOTIFICATION_TYPES.map((type) => (
                <li key={type}>
                  <label className="flex cursor-pointer items-start gap-3 py-3">
                    <Checkbox className="mt-1"
                      checked={on.get(type) ?? true}
                      disabled={save.isPending}
                      onChange={(checked) => save.mutate({ type, inApp: checked })}
                    />
                    <span className="min-w-0">
                      <span className="block text-link text-ink">{tDynamic(`notificationType.${type}`, type)}</span>
                      <span className="block text-caption text-ink-meta">{tDynamic(`notificationType.${type}.hint`, '')}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="px-4 pb-4 text-caption text-ink-meta md:px-6">{t('notification.channelsHint')}</p>
          </Card>
        )}
      </Container>
    </>
  )
}
