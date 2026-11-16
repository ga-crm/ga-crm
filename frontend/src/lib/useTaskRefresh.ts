import { useQueryClient } from '@tanstack/react-query'
import { keys } from './queries'

/** Every list of tasks, Today and the calendar read the same keys, so all refresh together. */
export function useTaskRefresh() {
  const queryClient = useQueryClient()
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: keys.tasks }), queryClient.invalidateQueries({ queryKey: keys.leads }), queryClient.invalidateQueries({ queryKey: keys.clients })])
}
