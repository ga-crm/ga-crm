import { buildTree } from './agent-tree.js';

const node = (agentCode: string, managerCode?: string) => ({
  agentCode,
  managerCode,
});

describe('buildTree', () => {
  it('AGT-3: flattens ancestors from the root to the direct manager', () => {
    const { positions, cycles } = buildTree([
      node('3', '2'),
      node('1'),
      node('2', '1'),
    ]);
    expect(positions.get('1')).toEqual({ ancestors: [], depth: 0 });
    expect(positions.get('2')).toEqual({ ancestors: ['1'], depth: 1 });
    expect(positions.get('3')).toEqual({ ancestors: ['1', '2'], depth: 2 });
    expect(cycles).toEqual([]);
  });

  it('AGT-3: a manager that is not loaded makes the agent a root for now', () => {
    const { positions } = buildTree([node('2', '999'), node('3', '2')]);
    expect(positions.get('2')).toEqual({ ancestors: [], depth: 0 });
    expect(positions.get('3')).toEqual({ ancestors: ['2'], depth: 1 });
  });

  it('AGT-3: everyone on a cycle becomes a root; those below keep their branch', () => {
    const { positions, cycles } = buildTree([
      node('1', '2'),
      node('2', '3'),
      node('3', '1'),
      node('4', '3'),
      node('5', '4'),
    ]);
    expect(cycles.sort()).toEqual(['1', '2', '3']);
    for (const code of ['1', '2', '3']) {
      expect(positions.get(code)).toEqual({ ancestors: [], depth: 0 });
    }
    expect(positions.get('5')).toEqual({ ancestors: ['3', '4'], depth: 2 });
  });

  it('treats an agent managing itself as a root, not as a cycle', () => {
    const { positions, cycles } = buildTree([node('1', '1')]);
    expect(positions.get('1')?.depth).toBe(0);
    expect(cycles).toEqual([]);
  });

  it('handles a chain far deeper than any call stack', () => {
    const chain = Array.from({ length: 20_000 }, (_, index) =>
      node(String(index), index > 0 ? String(index - 1) : undefined),
    );
    // Reversed, so the walk up has to do the whole length at once
    const { positions } = buildTree(chain.slice(-3000).reverse());
    expect(positions.size).toBe(3000);
    expect(positions.get('19999')?.depth).toBe(2999);
  });
});
