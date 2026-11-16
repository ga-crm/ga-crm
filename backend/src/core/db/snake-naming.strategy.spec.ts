import { SnakeNamingStrategy } from './snake-naming.strategy.js';

describe('SnakeNamingStrategy', () => {
  const naming = new SnakeNamingStrategy();

  it('maps camelCase properties to snake_case columns', () => {
    expect(naming.columnName('aiTokensPerMonth', undefined, [])).toBe(
      'ai_tokens_per_month',
    );
    expect(naming.columnName('mfaLastStep', undefined, [])).toBe(
      'mfa_last_step',
    );
  });

  it('keeps an explicit column name', () => {
    expect(naming.columnName('x', 'CustomName', [])).toBe('CustomName');
  });
});
