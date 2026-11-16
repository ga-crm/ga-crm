/** CMT-5: the pure parts of @mentions in a comment box. */

const MAX_QUERY = 30

/** The `@query` the caret is in, if any: an @ at the start or after a space, no line break after it. */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0 || (at > 0 && !/\s/.test(before[at - 1]))) return null
  const query = before.slice(at + 1)
  if (query.length > MAX_QUERY || /[\n@]/.test(query) || query.startsWith(' ')) return null
  return { start: at, query }
}

/** Replaces the `@query` with `@Name ` and says where the caret goes. */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const inserted = `@${name} `
  return { text: text.slice(0, start) + inserted + text.slice(caret), caret: start + inserted.length }
}

/** The people still named in the text; someone whose `@Name` was deleted is no longer mentioned. */
export function keptMentions(body: string, picked: { id: string; name: string }[]): string[] {
  return [...new Set(picked.filter((person) => body.includes(`@${person.name}`)).map((person) => person.id))]
}

/** Splits a comment into plain text and `@Name` parts, for the names it really mentions. */
export function splitMentions(body: string, names: string[]): { text: string; mention: boolean }[] {
  const wanted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length)
  if (wanted.length === 0) return [{ text: body, mention: false }]
  const escaped = wanted.map((name) => `@${name}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const parts: { text: string; mention: boolean }[] = []
  let last = 0
  for (const match of body.matchAll(new RegExp(escaped.join('|'), 'g'))) {
    if (match.index > last) parts.push({ text: body.slice(last, match.index), mention: false })
    parts.push({ text: match[0], mention: true })
    last = match.index + match[0].length
  }
  if (last < body.length) parts.push({ text: body.slice(last), mention: false })
  return parts
}
