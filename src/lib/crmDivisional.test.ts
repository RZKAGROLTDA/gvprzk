import { describe, it, expect } from 'vitest';
import { divisionalOfFilial } from './crmDivisional';

describe('divisionalOfFilial', () => {
  it('mapeia filiais oficiais', () => {
    expect(divisionalOfFilial('Querência')).toBe('MT');
    expect(divisionalOfFilial('Alto Taquari')).toBe('GO');
    expect(divisionalOfFilial('Marabá')).toBe('PA');
  });
  it('C&F tem divisional própria, mesmo com nome igual a outra filial', () => {
    expect(divisionalOfFilial('C&F - Mineiros')).toBe('C&F');
    expect(divisionalOfFilial('Mineiros')).toBe('GO');
  });
  it('Tele Vendas fica fora', () => {
    expect(divisionalOfFilial('Tele Vendas')).toBeNull();
  });
});
