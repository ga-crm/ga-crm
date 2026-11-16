import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { t } from '../i18n'
import { api, errorMessage } from './api'
import { keys } from './queries'
import { toast } from './toast'
import type { NotificationItem } from './types'

/** Opening a notification marks it read and goes where it points; "all read" clears the bell. */
export function useNotificationActions() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.notifications })
  const read = useMutation({
    mutationFn: (body: { ids: string[] } | { all: true }) => api.post('/notifications/read', body),
    onSuccess: refresh,
  })
  const open = (item: NotificationItem) => {
    if (!item.read) read.mutate({ ids: [item.id] })
    navigate(item.link)
  }
  const readAll = () =>
    read.mutate(
      { all: true },
      {
        onSuccess: () => toast.info(t('toast.notificationsRead')),
        onError: (error) => toast.error(t('toast.notificationsReadFailed'), errorMessage(error)),
      },
    )
  return { open, readAll, pending: read.isPending }
}
