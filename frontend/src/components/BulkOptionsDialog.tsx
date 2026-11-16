import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { MAX_BULK, previewLabels, readLabels, splitLines } from '../lib/bulkLabels'
import { keys } from '../lib/queries'
import { toast } from '../lib/toast'
import type { LeadOptionKind } from '../lib/types'
import { Button, Dialog, Field, FormError, MODAL_FOOTER, Textarea } from './ui'

/**
 * Open question D (decided 14/11/2026): the GA head sends a whole list at once, pasted (one value
 * per line, straight from Excel) or from a file. The preview says what will be added and what is
 * skipped before anything is saved.
 */
export function BulkOptionsDialog({
  kind,
  existing,
  open,
  onClose,
}: {
  kind: LeadOptionKind
  /** Labels already in the list, hidden ones included. */
  existing: string[]
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const list = t(`catalog.kind.${kind}`)
  const lines = splitLines(text)
  const preview = previewLabels(lines, existing)
  const tooMany = preview.labels.length > MAX_BULK

  const save = useMutation({
    mutationFn: () => api.post<{ created: string[]; skipped: string[] }>('/lead-options/bulk', { kind, labels: preview.labels }),
    onSuccess: async ({ created, skipped }) => {
      await queryClient.invalidateQueries({ queryKey: keys.leadOptions })
      toast.success(t('toast.optionsAdded', { count: created.length, list }), skipped.length ? t('toast.optionsSkipped', { count: skipped.length }) : undefined)
      setText('')
      onClose()
    },
  })

  const close = () => {
    save.reset()
    setFileError(null)
    onClose()
  }
  const sample = (labels: string[]) => labels.slice(0, 5).join(', ') + (labels.length > 5 ? ', ...' : '')

  return (
    <Dialog title={t('catalog.bulk.title', { list })} open={open} onClose={close} wide>
      <p className="mb-3 text-caption text-ink-meta">{t('catalog.bulk.hint')}</p>
      <Field label={t('catalog.bulk.box')} htmlFor="bulk-labels">
        <Textarea
          id="bulk-labels"
          rows={10}
          className="h-56"
          placeholder={t('catalog.bulk.placeholder')}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            if (save.isError) save.reset()
          }}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => picker.current?.click()}>
          <FileUp aria-hidden size={16} />
          {t('catalog.bulk.file')}
        </Button>
        <input
          ref={picker}
          type="file"
          accept=".xlsx,.xls,.csv,.txt"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            try {
              const labels = await readLabels(file, list)
              setFileError(null)
              setText((current) => [current.trim(), ...labels].filter(Boolean).join('\n'))
            } catch {
              setFileError(t('catalog.bulk.readFailed'))
            }
          }}
        />
        <span aria-live="polite" className="text-caption text-ink-body">
          {t('catalog.bulk.summary', { count: preview.labels.length })}
        </span>
      </div>
      {/* Reserved lines, so the dialog keeps its height while the list is typed */}
      <p className="mt-2 min-h-5 truncate text-caption text-ink-meta" title={preview.duplicates.join(', ')}>
        {preview.duplicates.length > 0 && t('catalog.bulk.duplicates', { count: preview.duplicates.length, labels: sample(preview.duplicates) })}
      </p>
      <FormError
        message={
          fileError ??
          (preview.tooLong.length > 0
            ? t('catalog.bulk.tooLong', { count: preview.tooLong.length, labels: sample(preview.tooLong) })
            : tooMany
              ? t('catalog.bulk.tooMany', { count: preview.labels.length })
              : save.isError
                ? errorMessage(save.error)
                : undefined)
        }
      />
      <div className={MODAL_FOOTER}>
        <Button variant="secondary" onClick={close}>
          {t('common.cancel')}
        </Button>
        <Button disabled={preview.labels.length === 0 || preview.tooLong.length > 0 || tooMany || save.isPending} onClick={() => save.mutate()}>
          {t('catalog.bulk.submit', { count: preview.labels.length })}
        </Button>
      </div>
    </Dialog>
  )
}
