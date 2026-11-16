import { DefaultNamingStrategy } from 'typeorm';

const snake = (value: string) =>
  value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/** Columns are snake_case in SQL and camelCase in TypeScript, so migrations read like plain SQL. */
export class SnakeNamingStrategy extends DefaultNamingStrategy {
  override columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ): string {
    return customName ?? snake([...embeddedPrefixes, propertyName].join('_'));
  }

  override relationName(propertyName: string): string {
    return snake(propertyName);
  }

  override joinColumnName(
    relationName: string,
    referencedColumnName: string,
  ): string {
    return snake(`${relationName}_${referencedColumnName}`);
  }
}
