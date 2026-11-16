/**
 * Composable SQL with bound values, for queries built from many optional conditions (filters,
 * visibility, signals). Values never become part of the SQL text.
 *
 *   const visible = sql`c.visible_agent_codes && ${codes}`;
 *   const where = and(sql`c.tenant_id = ${tenantId}`, reach.all ? null : visible);
 *   db.query(...positional(sql`SELECT * FROM clients c WHERE ${where}`));
 */
export class Sql {
  constructor(
    readonly strings: readonly string[],
    readonly values: readonly unknown[],
  ) {}
}

export function sql(strings: TemplateStringsArray, ...args: unknown[]): Sql {
  const parts: string[] = [strings[0]];
  const values: unknown[] = [];
  args.forEach((arg, index) => {
    const next = strings[index + 1];
    if (arg instanceof Sql) {
      parts[parts.length - 1] += arg.strings[0];
      arg.values.forEach((value, at) => {
        values.push(value);
        parts.push(arg.strings[at + 1]);
      });
      parts[parts.length - 1] += next;
    } else {
      values.push(arg);
      parts.push(next);
    }
  });
  return new Sql(parts, values);
}

/** Trusted SQL text, such as a column name chosen by the code. Never user input. */
export const raw = (text: string): Sql => new Sql([text], []);

type Part = Sql | null | undefined | false | '';

export function join(parts: readonly Sql[], separator: string): Sql {
  return (
    parts.reduce<Sql | null>(
      (joined, part) =>
        joined ? sql`${joined}${raw(separator)}${part}` : part,
      null,
    ) ?? raw('')
  );
}

/** All conditions; none at all means TRUE. */
export const and = (...parts: Part[]): Sql => {
  const kept = parts.filter((part): part is Sql => part instanceof Sql);
  return kept.length ? sql`(${join(kept, ' AND ')})` : raw('TRUE');
};

/** Any condition; none at all means FALSE. */
export const or = (...parts: Part[]): Sql => {
  const kept = parts.filter((part): part is Sql => part instanceof Sql);
  return kept.length ? sql`(${join(kept, ' OR ')})` : raw('FALSE');
};

/** `$1, $2, ...` text and values, for `db.query(text, values)`. */
export function positional(query: Sql): [string, unknown[]] {
  const text = query.strings.reduce(
    (built, part, index) => `${built}$${index}${part}`,
  );
  return [text, [...query.values]];
}

let named = 0;

/** `:p1, :p2, ...` text and parameters, for TypeORM's query builder `.where(text, params)`. */
export function namedParams(query: Sql): [string, Record<string, unknown>] {
  const params: Record<string, unknown> = {};
  const text = query.strings.reduce((built, part, index) => {
    const name = `p${++named}`;
    params[name] = query.values[index - 1];
    return `${built}:${name}${part}`;
  });
  return [text, params];
}
