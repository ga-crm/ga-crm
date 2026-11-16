import { describe, expect, it } from 'vitest'
import { addMessage, attachmentProblem, fileSize, flattenPages, noteTyping, sensitiveNumbers, stopTyping, systemText, typingIn } from '../src/lib/chat'
import type { MessagePages } from '../src/lib/chat'
import type { ChatMessage } from '../src/lib/types'

const message = (seq: number, body = `tin ${seq}`): ChatMessage => ({
  conversationId: 'c',
  seq,
  id: `m${seq}`,
  senderId: 'u',
  senderName: 'Lan',
  kind: 'TEXT',
  body,
  data: {},
  mentions: [],
  editedAt: null,
  deletedAt: null,
  createdAt: '2026-11-14T03:00:00Z',
})
const pages = (...groups: number[][]): MessagePages => ({
  pages: groups.map((seqs) => ({ items: seqs.map((seq) => message(seq)), hasMore: false })),
  pageParams: groups.map(() => undefined),
})

describe('chat', () => {
  it('lists loaded pages oldest first', () => {
    expect(flattenPages(pages([3, 4], [1, 2])).map((item) => item.seq)).toEqual([1, 2, 3, 4])
  })

  it('adds the next message, replaces one already there, and reports a gap', () => {
    const data = pages([1, 2])
    expect(flattenPages(addMessage(data, message(3)).data).map((item) => item.seq)).toEqual([1, 2, 3])
    const edited = addMessage(data, message(2, 'đã sửa')).data
    expect(flattenPages(edited)[1].body).toBe('đã sửa')
    expect(addMessage(data, message(5)).gap).toBe(true)
  })

  it('words system messages with the names stored at the time', () => {
    const text = systemText({
      data: { event: 'removed', actorName: 'Lan', userIds: ['a', 'b'], names: { a: 'Hùng', b: 'Mai' } },
    })
    expect(text).toContain('Lan')
    expect(text).toContain('Hùng, Mai')
  })

  it('K4: warns on ID card and bank account numbers, not on phone numbers', () => {
    expect(sensitiveNumbers('CCCD 012345678901')).toEqual(['idCard'])
    expect(sensitiveNumbers('CCCD 0123 4567 8901')).toEqual(['idCard'])
    expect(sensitiveNumbers('STK 19031234567890 Techcombank')).toEqual(['bankAccount'])
    expect(sensitiveNumbers('Gọi 0912345678 hoặc 84912345678')).toEqual([])
    expect(sensitiveNumbers('Hẹn lúc 9 giờ, phòng 302')).toEqual([])
  })

  it('K8: refuses other types and files over 10 MB before uploading', () => {
    expect(attachmentProblem({ name: 'Hợp đồng.PDF', size: 1_000 })).toBeNull()
    expect(attachmentProblem({ name: 'logo.svg', size: 1_000 })).toContain('logo.svg')
    expect(attachmentProblem({ name: 'scan.jpg', size: 11 * 1024 * 1024 })).toContain('10 MB')
    expect(fileSize(2_516_582)).toBe('2,4 MB')
    expect(fileSize(300)).toBe('1 KB')
  })

  it('forgets typing after 5 seconds or when the person sends', () => {
    noteTyping('c1', 'u1', 1_000)
    expect(typingIn('c1', 2_000)).toEqual(['u1'])
    expect(typingIn('c1', 7_000)).toEqual([])
    noteTyping('c2', 'u2', 1_000)
    stopTyping('c2', 'u2')
    expect(typingIn('c2', 2_000)).toEqual([])
  })
})
