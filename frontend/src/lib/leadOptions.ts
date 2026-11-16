import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { tDynamic } from '../i18n'
import { queries } from './queries'
import type { LeadOption, LeadOptionKind } from './types'

export interface LeadCatalogue {
  /** Shown values, in the GA's order: what a picker offers (OPT-8). */
  active: (kind: LeadOptionKind) => LeadOption[]
  /** Every value, hidden ones too: what a filter offers, since old leads still carry them. */
  all: (kind: LeadOptionKind) => LeadOption[]
  /** OPT-9: the GA's label for a code; the code itself when the catalogue does not know it. */
  label: (kind: LeadOptionKind, code: string) => string
}

/** The fallback keeps system codes readable while the catalogue loads; text lists store the words themselves. */
const FALLBACK_KEY: Partial<Record<LeadOptionKind, string>> = { interest: 'interest', care_status: 'care' }

export function useLeadOptions(): LeadCatalogue {
  const { data } = useQuery(queries.leadOptions())
  return useMemo(() => {
    const items = data?.items ?? []
    const byKey = new Map(items.map((item) => [`${item.kind}:${item.code}`, item]))
    return {
      all: (kind) => items.filter((item) => item.kind === kind),
      active: (kind) => items.filter((item) => item.kind === kind && item.active),
      label: (kind, code) => byKey.get(`${kind}:${code}`)?.label ?? (FALLBACK_KEY[kind] ? tDynamic(`${FALLBACK_KEY[kind]}.${code}`, code) : code),
    }
  }, [data])
}
