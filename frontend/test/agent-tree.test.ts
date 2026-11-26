import { describe, expect, it } from 'vitest'
import { indexTree, managerCandidates, normalizeName, pickerLabel, pickerRows, searchTree, visibleRows } from '../src/lib/agentTree'
import type { AgentNode } from '../src/lib/types'

const node = (agentCode: string, name: string, ancestors: string[] = []): AgentNode => ({
  agentCode,
  name,
  rank: 'FC',
  managerCode: ancestors.at(-1) ?? null,
  ancestors,
  depth: ancestors.length,
  status: 'Đang hoạt động',
  userId: null,
})

const items = [
  node('1', 'Lê Văn Cường'),
  node('2', 'Trần Thị Đào', ['1']),
  node('3', 'Nguyễn An', ['1', '2']),
  node('4', 'Phạm Bình', ['1']),
  node('9', 'Gốc Khác'),
]
const codes = (rows: ReturnType<typeof visibleRows>) => rows.map((row) => row.agent.agentCode)

describe('indexTree', () => {
  it('AGT-8: links children and counts each branch at every depth', () => {
    const index = indexTree(items)
    expect(index.roots.map((item) => item.agentCode)).toEqual(['1', '9'])
    expect(index.children.get('1')?.map((item) => item.agentCode)).toEqual(['2', '4'])
    expect(index.teamSize.get('1')).toBe(3)
    expect(index.teamSize.get('2')).toBe(1)
    expect(index.teamSize.get('3')).toBeUndefined()
  })

  it('AGT-6: someone seeing only their branch starts from themselves', () => {
    const index = indexTree([node('2', 'A', ['1']), node('3', 'B', ['1', '2'])])
    expect(index.roots.map((item) => item.agentCode)).toEqual(['2'])
    expect(index.children.get('2')?.map((item) => item.agentCode)).toEqual(['3'])
  })
})

describe('visibleRows', () => {
  const index = indexTree(items)

  it('shows children only under expanded agents, in tree order', () => {
    expect(codes(visibleRows(index, () => false, null))).toEqual(['1', '9'])
    expect(codes(visibleRows(index, (code) => code === '1', null))).toEqual(['1', '2', '4', '9'])
    const all = visibleRows(index, () => true, null)
    expect(codes(all)).toEqual(['1', '2', '3', '4', '9'])
    expect(all.map((row) => row.level)).toEqual([0, 1, 2, 1, 0])
  })

  it('AGT-8: a search shows matches with everyone above them, however the tree is folded', () => {
    const shown = searchTree(items, 'nguyen')
    expect(codes(visibleRows(index, () => false, shown))).toEqual(['1', '2', '3'])
  })
})

describe('searchTree', () => {
  it('DATA-5: finds names with or without Vietnamese marks, and by code', () => {
    expect([...searchTree(items, 'dao')!]).toEqual(['2', '1'])
    expect([...searchTree(items, 'ĐÀO')!]).toEqual(['2', '1'])
    expect([...searchTree(items, '  4 ')!]).toEqual(['4', '1'])
  })

  it('an empty search means no filter; no match means nothing shown', () => {
    expect(searchTree(items, '   ')).toBeNull()
    expect(searchTree(items, 'không ai')?.size).toBe(0)
  })
})

describe('managerCandidates', () => {
  it('AGT-5: leaves out the agent and everyone below them', () => {
    const candidates = managerCandidates(items, '2').map((item) => item.agentCode)
    expect(candidates).toEqual(['1', '4', '9'])
  })

  it('a new agent can report to anyone', () => {
    expect(managerCandidates(items)).toHaveLength(5)
  })
})

describe('normalizeName', () => {
  it('DATA-5', () => {
    expect(normalizeName('  Đặng   Thị  Ánh ')).toBe('DANG THI ANH')
  })
})

describe('pickerRows', () => {
  it('AGT-9: lists agents in tree order, so one added later by hand sits under their manager', () => {
    const later = node('0', 'Mới Thêm Tay', ['1', '2'])
    const rows = pickerRows([later, ...items])
    expect(rows.map((row) => row.agent.agentCode)).toEqual(['1', '2', '0', '3', '4', '9'])
    expect(pickerLabel(rows[2])).toBe('\u00a0\u00a0\u00a0\u00a0Mới Thêm Tay (0)')
  })
})
