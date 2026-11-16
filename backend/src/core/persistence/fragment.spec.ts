import { and, namedParams, or, positional, raw, sql } from './fragment.js';

describe('sql fragments', () => {
  it('numbers the values of nested fragments in order', () => {
    const visible = sql`c.codes && ${['A', 'B']}`;
    const where = and(sql`c.tenant_id = ${'t1'}`, null, visible);
    expect(
      positional(sql`SELECT * FROM clients c WHERE ${where} LIMIT ${5}`),
    ).toEqual([
      'SELECT * FROM clients c WHERE (c.tenant_id = $1 AND c.codes && $2) LIMIT $3',
      ['t1', ['A', 'B'], 5],
    ]);
  });

  it('gives TRUE for no conditions and FALSE for no alternatives', () => {
    expect(positional(and())).toEqual(['TRUE', []]);
    expect(positional(or(false, undefined))).toEqual(['FALSE', []]);
    expect(positional(or(sql`a = ${1}`, sql`b = ${2}`))).toEqual([
      '(a = $1 OR b = $2)',
      [1, 2],
    ]);
  });

  it('keeps user input out of the text', () => {
    const [text, values] = positional(
      sql`name = ${"x'; DROP TABLE users; --"}`,
    );
    expect(text).toBe('name = $1');
    expect(values).toEqual(["x'; DROP TABLE users; --"]);
    expect(positional(sql`ORDER BY ${raw('name')}`)).toEqual([
      'ORDER BY name',
      [],
    ]);
  });

  it('names parameters uniquely for the query builder', () => {
    const [first, params] = namedParams(sql`a = ${1} AND b = ${2}`);
    const [second] = namedParams(sql`a = ${1}`);
    expect(first).toMatch(/^a = :p\d+ AND b = :p\d+$/);
    expect(Object.values(params)).toEqual([1, 2]);
    expect(second).not.toBe(first.slice(0, second.length));
  });
});
