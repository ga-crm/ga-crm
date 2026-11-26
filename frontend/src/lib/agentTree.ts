import type { AgentNode } from './types'

/** DATA-5: the same comparison the server uses for names. */
export const normalizeName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()

export interface TreeIndex {
  roots: AgentNode[]
  children: Map<string, AgentNode[]>
  /** How many people are below each agent, at any depth (AGT-8). */
  teamSize: Map<string, number>
  byCode: Map<string, AgentNode>
}

/** Parents come from `ancestors`, which already excludes unknown managers and split-off cycles (AGT-3). */
export function indexTree(items: readonly AgentNode[]): TreeIndex {
  const byCode = new Map(items.map((item) => [item.agentCode, item]))
  const children = new Map<string, AgentNode[]>()
  const teamSize = new Map<string, number>()
  const roots: AgentNode[] = []

  for (const item of items) {
    const parent = item.ancestors.at(-1)
    // Someone seeing only their branch has no visible manager, which makes them a root here
    if (parent && byCode.has(parent)) {
      const siblings = children.get(parent)
      if (siblings) siblings.push(item)
      else children.set(parent, [item])
    } else {
      roots.push(item)
    }
    for (const ancestor of item.ancestors) teamSize.set(ancestor, (teamSize.get(ancestor) ?? 0) + 1)
  }
  return { roots, children, teamSize, byCode }
}

/** The agents a search finds, plus everyone above them, so each result shows where it sits. */
export function searchTree(items: readonly AgentNode[], query: string): Set<string> | null {
  const wanted = normalizeName(query)
  if (!wanted) return null
  const shown = new Set<string>()
  for (const item of items) {
    if (item.agentCode.includes(query.trim()) || normalizeName(item.name).includes(wanted)) {
      shown.add(item.agentCode)
      for (const ancestor of item.ancestors) shown.add(ancestor)
    }
  }
  return shown
}

export interface VisibleRow {
  agent: AgentNode
  level: number
}

/** Rows to draw, top to bottom. A list rather than nested elements keeps large trees fast. */
export function visibleRows(index: TreeIndex, isExpanded: (code: string) => boolean, shown: Set<string> | null): VisibleRow[] {
  const rows: VisibleRow[] = []
  const stack: VisibleRow[] = [...index.roots].reverse().map((agent) => ({ agent, level: 0 }))
  while (stack.length > 0) {
    const row = stack.pop()!
    if (shown && !shown.has(row.agent.agentCode)) continue
    rows.push(row)
    if (shown || isExpanded(row.agent.agentCode)) {
      const below = index.children.get(row.agent.agentCode) ?? []
      for (let i = below.length - 1; i >= 0; i--) stack.push({ agent: below[i], level: row.level + 1 })
    }
  }
  return rows
}

/** Everyone who may become this agent's manager: not themselves and nobody below them (AGT-5). */
export function managerCandidates(items: readonly AgentNode[], code?: string): AgentNode[] {
  return code ? items.filter((item) => item.agentCode !== code && !item.ancestors.includes(code)) : [...items]
}

/**
 * AGT-9: agent pickers list everyone in tree order (each agent under their manager), indented by
 * level. The API sorts by code, which only matches the tree while codes follow it; an agent added
 * by hand later (decided 26/11/2026) would otherwise show at the end under the wrong person.
 */
export function pickerRows(items: readonly AgentNode[]): VisibleRow[] {
  return visibleRows(indexTree(items), () => true, null)
}

/** Plain spaces collapse inside an `<option>`, so the indent uses no-break spaces. */
export const pickerLabel = ({ agent, level }: VisibleRow): string => `${'  '.repeat(level)}${agent.name} (${agent.agentCode})`
