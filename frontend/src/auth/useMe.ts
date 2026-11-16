import { useQuery } from '@tanstack/react-query'
import { queries } from '../lib/queries'

export function useMe() {
  return useQuery(queries.me())
}

/** LEAD-29: the GA's contact deadline in hours (section 5.2), 48 until /me says otherwise. */
export function useContactDeadlineHours(): number {
  const { data } = useMe()
  return data?.settings?.leadRules?.contactDeadlineHours ?? 48
}
