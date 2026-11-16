import { describe, expect, it } from 'vitest'
import { activeMention, insertMention, keptMentions, splitMentions } from '../src/lib/mentions'

describe('CMT-5 mentions', () => {
  it('finds the @query the caret is in', () => {
    expect(activeMention('Nhờ @Trư', 8)).toEqual({ start: 4, query: 'Trư' })
    expect(activeMention('Nhờ @Trưởng nhóm', 16)).toEqual({ start: 4, query: 'Trưởng nhóm' })
    expect(activeMention('@', 1)).toEqual({ start: 0, query: '' })
    expect(activeMention('mail@ga1', 8)).toBeNull()
    expect(activeMention('@ x', 3)).toBeNull()
    expect(activeMention('@ab\ncd', 6)).toBeNull()
  })

  it('inserts the name and keeps only names still in the text', () => {
    expect(insertMention('Nhờ @Trư xem', 4, 8, 'Trưởng nhóm 1')).toEqual({ text: 'Nhờ @Trưởng nhóm 1  xem', caret: 19 })
    const picked = [
      { id: 'a', name: 'Trưởng nhóm 1' },
      { id: 'b', name: 'Chủ GA 1' },
    ]
    expect(keptMentions('@Trưởng nhóm 1 xem giúp', picked)).toEqual(['a'])
  })

  it('marks the mentioned names when showing a comment', () => {
    expect(splitMentions('@Chủ GA 1 xem @Chủ GA 10 nhé', ['Chủ GA 1', 'Chủ GA 10'])).toEqual([
      { text: '@Chủ GA 1', mention: true },
      { text: ' xem ', mention: false },
      { text: '@Chủ GA 10', mention: true },
      { text: ' nhé', mention: false },
    ])
    expect(splitMentions('không ai', [])).toEqual([{ text: 'không ai', mention: false }])
  })
})
