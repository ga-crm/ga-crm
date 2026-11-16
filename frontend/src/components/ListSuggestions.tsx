import { useLeadOptions } from '../lib/leadOptions'
import type { LeadOptionKind } from '../lib/types'

/**
 * Section 5.2 + open question D: the GA's own list offered as suggestions under a text field; the
 * field still takes any value, since leads and imports may carry ones the GA has not listed.
 */
export function ListSuggestions({ id, kind }: { id: string; kind: LeadOptionKind }) {
  const catalogue = useLeadOptions()
  return (
    <datalist id={id}>
      {catalogue.active(kind).map((option) => (
        <option key={option.id} value={option.label} />
      ))}
    </datalist>
  )
}
