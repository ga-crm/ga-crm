import { useMutation } from '@tanstack/react-query'
import { MessageCircle, Phone, Users } from 'lucide-react'
import { useState } from 'react'
import { t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { toast } from '../lib/toast'
import { Button, FormError, Segmented, Textarea } from './ui'


const CONTACT_CHIPS = [
  {
    type: 'CALL',
    icon: Phone,
    label: 'leads.contactCall',
    save: 'leads.saveCall',
  },
  {
    type: 'ZALO',
    icon: MessageCircle,
    label: 'leads.contactZalo',
    save: 'leads.saveZalo',
  },
  {
    type: 'MEETING',
    icon: Users,
    label: 'leads.contactMeeting',
    save: 'leads.saveMeeting',
  },
] as const

/**
 * NOTE-3: one box, with three chips that turn the note into a contact. `path` is the lead or the
 * client (NOTE-5), which both take `/notes` and `/activities`.
 */
export function NoteComposer({ path, onSaved }: { path: string; onSaved: () => Promise<unknown> }) {
  const [text, setText] = useState('')
  const [chip, setChip] = useState<(typeof CONTACT_CHIPS)[number] | null>(null)
  const add = useMutation({
    mutationFn: () => (chip ? api.post(`${path}/activities`, { type: chip.type, note: text.trim() }) : api.post(`${path}/notes`, { body: text.trim() })),
    onSuccess: async () => {
      await onSaved()
      toast.success(chip ? t('toast.contactSaved', { type: t(chip.label) }) : t('toast.noteAdded'))
      setText('')
      setChip(null)
    },
  })
  return (
    <div className="mt-3">
      <Textarea aria-label={t('leads.notes')} rows={3} maxLength={4000} placeholder={t('leads.notePlaceholder')} value={text} onChange={(event) => setText(event.target.value)} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Segmented
          label={t('leads.contactType')}
          value={chip?.type ?? null}
          onValueChange={(type) => setChip(CONTACT_CHIPS.find((item) => item.type === type) ?? null)}
          onClear={() => setChip(null)}
          options={CONTACT_CHIPS.map((item) => ({
            value: item.type,
            label: (
              <>
                <item.icon aria-hidden size={14} />
                {t(item.label)}
              </>
            ),
          }))}
        />
        <Button className="ml-auto" disabled={!text.trim() || add.isPending} onClick={() => add.mutate()}>
          {t(chip ? chip.save : 'leads.addNote')}
        </Button>
      </div>
      <FormError message={add.isError ? errorMessage(add.error) : undefined} />
    </div>
  )
}
