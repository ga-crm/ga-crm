import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { t } from '../../i18n'
import { queries } from '../../lib/queries'
import { useDebounced } from '../../lib/useListSearch'
import type { ChatPerson } from '../../lib/types'
import { Checkbox, SearchInput, Spinner } from '../ui'

/** K1: pick several people of the GA; those already in the conversation are left out. */
export function MemberPicker({
  value,
  onChange,
  exclude = [],
}: {
  value: ChatPerson[]
  /** A state setter: ticks apply to the latest list, however fast they come. */
  onChange: Dispatch<SetStateAction<ChatPerson[]>>
  exclude?: string[]
}) {
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const people = useQuery(queries.chatPeople(q))
  const chosen = new Set(value.map((person) => person.id))
  const options = (people.data?.items ?? []).filter((person) => !exclude.includes(person.id))
  const toggle = (person: ChatPerson, on: boolean) =>
    onChange((list) => (on ? [...list.filter((item) => item.id !== person.id), person] : list.filter((item) => item.id !== person.id)))

  return (
    <div>
      <SearchInput value={search} onValueChange={setSearch} label={t('chat.searchPeople')} placeholder={t('chat.searchPeople')} />
      {/* Always reserved, so the list does not move when the first person is picked */}
      <p className="mt-2 min-h-5 text-caption text-ink-meta">{value.length > 0 ? t('chat.picked', { count: value.length, names: value.map((person) => person.name).join(', ') }) : t('chat.pickHint')}</p>
      <ul className="mt-1 h-64 overflow-y-auto rounded-md border border-band">
        {people.isPending && <Spinner />}
        {options.map((person) => (
          <li key={person.id} className="border-b border-band last:border-b-0">
            <label className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 hover:bg-chrome md:min-h-10">
              <Checkbox checked={chosen.has(person.id)} onChange={(on) => toggle(person, on)} aria-label={person.name} />
              <span className="min-w-0 flex-1 truncate text-caption text-ink">{person.name}</span>
              <span className="max-w-[40%] flex-none truncate text-caption text-ink-meta">{person.agentCode ?? person.email}</span>
            </label>
          </li>
        ))}
        {people.data && options.length === 0 && <li className="px-3 py-6 text-center text-caption text-ink-meta">{t('chat.noPeople')}</li>}
      </ul>
    </div>
  )
}
