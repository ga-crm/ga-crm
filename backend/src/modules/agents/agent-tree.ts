export interface TreeNode {
  agentCode: string;
  managerCode?: string | null;
}

export interface TreePosition {
  ancestors: string[];
  depth: number;
}

/**
 * AGT-3: flattens manager links into ancestors, root first. A manager that is not loaded makes its
 * agent a root for now, and everyone on a cycle becomes a root so the rest of the tree stays usable.
 * Loops rather than recursion, because a file can describe a chain of any length.
 */
export function buildTree(nodes: readonly TreeNode[]): {
  positions: Map<string, TreePosition>;
  cycles: string[];
} {
  const codes = new Set(nodes.map((node) => node.agentCode));
  const parent = new Map<string, string | null>();
  for (const { agentCode, managerCode } of nodes) {
    const linked =
      managerCode && managerCode !== agentCode && codes.has(managerCode);
    parent.set(agentCode, linked ? managerCode : null);
  }

  const cycles = new Set<string>();
  const finished = new Set<string>();
  for (const code of codes) {
    const path: string[] = [];
    const onPath = new Set<string>();
    let current: string | null = code;
    while (current && !finished.has(current) && !onPath.has(current)) {
      path.push(current);
      onPath.add(current);
      current = parent.get(current) ?? null;
    }
    if (current && onPath.has(current)) {
      for (const member of path.slice(path.indexOf(current))) {
        cycles.add(member);
      }
    }
    for (const visited of path) finished.add(visited);
  }
  for (const member of cycles) parent.set(member, null);

  const positions = new Map<string, TreePosition>();
  for (const code of codes) {
    const pending: string[] = [];
    let current: string | null = code;
    while (current && !positions.has(current)) {
      pending.push(current);
      current = parent.get(current) ?? null;
    }
    while (pending.length > 0) {
      const next = pending.pop()!;
      const manager = parent.get(next);
      const above = manager ? positions.get(manager)! : undefined;
      positions.set(next, {
        ancestors: above ? [...above.ancestors, manager!] : [],
        depth: above ? above.depth + 1 : 0,
      });
    }
  }
  return { positions, cycles: [...cycles] };
}
