import { describe, it, expect } from 'vitest';
import { collectConditionPages, currentConditionPeriod, conditionInPeriod, parseConditionMargin, requireConditionType, weightedConditionMargin } from './specialConditions';

describe('Condição Especial', () => {
  it('abre e limpa do primeiro dia do mês até hoje em data local', () => {
    expect(currentConditionPeriod(new Date(2026, 9, 29, 15))).toEqual({ start: '2026-10-01', end: '2026-10-29' });
    expect(currentConditionPeriod(new Date(2026, 10, 1))).toEqual({ start: '2026-11-01', end: '2026-11-01' });
  });
  it('inclui os extremos de períodos históricos sem inventar datas', () => {
    expect(conditionInPeriod('2020-01-01', '2020-01-01', '2020-01-31')).toBe(true);
    expect(conditionInPeriod('2020-01-31', '2020-01-01', '2020-01-31')).toBe(true);
    expect(conditionInPeriod('2019-12-31', '2020-01-01', '2020-01-31')).toBe(false);
    expect(conditionInPeriod(null, '2020-01-01', '2020-01-31')).toBe(false);
    expect(conditionInPeriod(null, '', '')).toBe(true);
  });
  it('exige Safra ou Normal no salvamento manual', () => {
    expect(requireConditionType('safra')).toBe('safra');
    expect(requireConditionType('normal')).toBe('normal');
    expect(() => requireConditionType('')).toThrow();
    expect(() => requireConditionType('outro')).toThrow();
  });
  it('mantém margem ausente, zero e duas casas sem derivar desconto', () => {
    expect(parseConditionMargin('')).toBeNull();
    expect(parseConditionMargin('0')).toBe(0);
    expect(parseConditionMargin('12,34')).toBe(12.34);
    expect(() => parseConditionMargin('12.345')).toThrow();
    expect(() => parseConditionMargin('abc')).toThrow();
  });
  it('pondera por venda e exclui margens ausentes de ambos os termos', () => {
    expect(weightedConditionMargin([{sale_value:100, margin_percent:10},{sale_value:300, margin_percent:20},{sale_value:900, margin_percent:null}])).toBe(17.5);
  });
  it('inclui margem zero e identifica dados insuficientes', () => {
    expect(weightedConditionMargin([{sale_value:100, margin_percent:0},{sale_value:100, margin_percent:20}])).toBe(10);
    expect(weightedConditionMargin([{sale_value:100, margin_percent:null}])).toBeNull();
    expect(weightedConditionMargin([{sale_value:0, margin_percent:20}])).toBeNull();
  });
  it('busca mais de 1000 pelo último ID até lote vazio sem perdas', async () => {
    const data = Array.from({length:2021}, (_, i) => ({id: String(i + 1).padStart(6, '0')}));
    const cursors: (string | null)[] = [];
    const result = await collectConditionPages(async after => {
      cursors.push(after);
      return data.filter(row => after === null || row.id > after).slice(0,1000);
    });
    expect(result).toEqual(data);
    expect(new Set(result.map(row => row.id)).size).toBe(2021);
    expect(cursors).toEqual([null,'001000','002000','002021']);
  });
  it('continua mesmo com lote menor e não retorna resultado parcial em falha', async () => {
    let calls = 0;
    expect(await collectConditionPages(async () => ++calls === 1 ? [{id:'1'}] : calls === 2 ? [{id:'2'}] : [])).toEqual([{id:'1'},{id:'2'}]);
    await expect(collectConditionPages(async after => after === null ? [{id:'1'}] : Promise.reject(new Error('Falha')))).rejects.toThrow('Falha');
  });
  it('recusa duplicações e falta de avanço', async () => {
    await expect(collectConditionPages(async () => [{id:'1'}])).rejects.toThrow();
    await expect(collectConditionPages(async () => [{id:'2'}, {id:'1'}])).rejects.toThrow();
  });
});