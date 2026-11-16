import { useMutation, useQuery } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { formatDateTime, t } from '../i18n'
import { api, errorMessage } from '../lib/api'
import { activeMention, insertMention, keptMentions, splitMentions } from '../lib/mentions'
import { queries } from '../lib/queries'
import { toast } from '../lib/toast'
import type { MentionCandidate, ThreadComment } from '../lib/types'
import { Button, FormError, Textarea } from './ui'

/** The comment text, with the people it mentions picked out. */
function CommentBody({ comment, userNames }: { comment: ThreadComment; userNames: Record<string, string> }) {
  const names = comment.mentions.map((id) => userNames[id]).filter(Boolean)
  return (
    <p className="whitespace-pre-wrap text-ink-body">
      {splitMentions(comment.body, names).map((part, index) =>
        part.mention ? (
          <strong key={index} className="font-medium text-ink">
            {part.text}
          </strong>
        ) : (
          part.text
        ),
      )}
    </p>
  )
}

/**
 * CMT-1 + CMT-5: a thread of comments, oldest first, and a box to add one. Typing "@" offers the
 * people who see the lead or client (`path` is `/leads/{id}` or `/clients/{code}`).
 */
export function CommentThread({
  comments,
  userNames,
  path,
  sentDetail,
  onSaved,
}: {
  comments: ThreadComment[]
  userNames: Record<string, string>
  path: string
  sentDetail: string
  onSaved: () => Promise<unknown>
}) {
  const [body, setBody] = useState('')
  const [picked, setPicked] = useState<MentionCandidate[]>([])
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLTextAreaElement>(null)
  const listId = useId()
  const candidates = useQuery({ ...queries.mentionable(path, mention?.query ?? ''), enabled: mention !== null })
  const options = mention ? (candidates.data?.items ?? []) : []
  const open = mention !== null && options.length > 0

  const add = useMutation({
    mutationFn: () => api.post(`${path}/comments`, { body: body.trim(), mentions: keptMentions(body, picked) }),
    onSuccess: async () => {
      await onSaved()
      toast.success(t('toast.commentSent'), sentDetail)
      setBody('')
      setPicked([])
      setMention(null)
    },
  })

  const track = (text: string, caret: number) => {
    setMention(activeMention(text, caret))
    setActive(0)
  }
  const choose = (person: MentionCandidate) => {
    if (!mention || !box.current) return
    const next = insertMention(body, mention.start, box.current.selectionStart, person.name)
    setBody(next.text)
    setPicked((list) => [...list.filter((item) => item.id !== person.id), person])
    setMention(null)
    requestAnimationFrame(() => {
      box.current?.focus()
      box.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  return (
    <>
      {comments.length === 0 ? (
        <p className="mt-2 text-caption text-ink-meta">{t('comments.empty')}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-md bg-chrome px-3 py-2 text-caption">
              <CommentBody comment={comment} userNames={userNames} />
              <p className="mt-1 text-ink-meta">
                {userNames[comment.authorUserId] ?? '-'} · {formatDateTime(comment.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="relative mt-3">
        <Textarea
          ref={box}
          role="combobox"
          aria-label={t('comments.box')}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          rows={2}
          maxLength={2000}
          placeholder={t('comments.placeholder')}
          value={body}
          onChange={(event) => {
            setBody(event.target.value)
            track(event.target.value, event.target.selectionStart)
          }}
          onClick={(event) => track(body, event.currentTarget.selectionStart)}
          onBlur={() => setMention(null)}
          onKeyDown={(event) => {
            if (!open) return
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const step = event.key === 'ArrowDown' ? 1 : -1
              setActive((index) => (index + step + options.length) % options.length)
            } else if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault()
              choose(options[active])
            } else if (event.key === 'Escape') {
              event.preventDefault()
              setMention(null)
            }
          }}
         
        />
        {open && (
          <ul id={listId} role="listbox" aria-label={t('comments.mentionList')} className="absolute top-full left-0 z-10 mt-1 max-h-56 w-full max-w-sm overflow-y-auto rounded-md border border-hairline bg-canvas py-1">
            {options.map((person, index) => (
              <li
                key={person.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                // Keep the focus in the text box
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(person)}
                className={`flex min-h-10 cursor-pointer items-center justify-between gap-2 px-3 text-caption ${index === active ? 'bg-chrome' : ''}`}
              >
                <span className="truncate text-ink">{person.name}</span>
                {person.agentCode && <span className="flex-none text-ink-meta tabular-nums">{person.agentCode}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-1 text-caption text-ink-meta">{t('comments.mentionHint')}</p>
      <FormError message={add.isError ? errorMessage(add.error) : undefined} />
      <Button variant="secondary" className="mt-1" disabled={!body.trim() || add.isPending} onClick={() => add.mutate()}>
        {t('leads.addComment')}
      </Button>
    </>
  )
}
