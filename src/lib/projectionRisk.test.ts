import { describe, expect, it } from 'vitest';
import { consolidate, consolidateByDivisional, filterRows, projectionPanelMetrics, rowsForWeek, type ProjectionRow } from './projection';

const row = (id: string, divisional: string, meta: number | null, sem: number, risco: number): ProjectionRow => ({
  filial_id: id, filial_nome: id, divisional, meta,
  s1_sem: 9000, s1_com: 8000, s2_sem: sem, s2_com: risco,
  s3_sem: null, s3_com: null, s4_sem: null, s4_com: null,
  ultima_semana: 2, ultima_sem_risco: sem, ultima_com_risco: risco,
  ultima_atualizacao: null, atualizado_por: null,
});
const source = [row('A', 'MT', 1000, 800, 100), row('B', 'MT', 3000, 1200, 500),
  row('C', 'GO', 2000, 1500, 300), row('D', 'PA', 1000, 900, 200), row('E', 'C&F', 3000, 2100, 400)];

describe('Risco adicional e percentuais da Projeção', () => {
  it('mantém o dinheiro de Risco como adicional original, sem somar Sem risco', () => {
    expect(consolidate([source[0]]).comRisco).toBe(100);
  });
  it('% Sem risco = Sem risco / Meta × 100', () => {
    expect(consolidate([source[0]]).pctSem).toBe(80);
  });
  it('% Risco = (Sem risco + Risco) / Meta × 100', () => {
    expect(consolidate([source[0]]).pctCom).toBe(90);
  });
  it('GAP Risco = Sem risco + Risco - Meta, enquanto GAP Sem risco permanece separado', () => {
    const t = consolidate([source[0]]);
    expect(t.gapCom).toBe(-100); expect(t.gapSem).toBe(-200);
    const total = consolidate(rowsForWeek(source, 2));
    expect(total.gapCom).toBe(-2000); expect(total.gapSem).toBe(-3500);
    expect(projectionPanelMetrics(rowsForWeek(source, 2)).gapCom).toBe(-2000);
  });
  it.each([1, 2, 3, 4] as const)('GAPs seguem somente a Semana %s e o filtro, preservando a meta', (week) => {
    const t = consolidate(rowsForWeek(filterRows(source, 'MT', 'A'), week));
    const expected = week === 1 ? [8000, 16000] : week === 2 ? [-200, -100] : [-1000, -1000];
    expect([t.gapSem, t.gapCom]).toEqual(expected);
    expect(t.meta).toBe(1000);
  });
  it.each([
    ['MT', 4000, 2000, 600, 50, 65], ['GO', 2000, 1500, 300, 75, 90],
    ['PA', 1000, 900, 200, 90, 110], ['C&F', 3000, 2100, 400, 70, 2500 / 3000 * 100],
  ])('%s calcula percentuais sobre totais, não soma nem média das filiais', (div, meta, sem, risco, pctSem, pctCom) => {
    const d = consolidateByDivisional(rowsForWeek(source, 2)).find((d) => d.divisional === div);
    expect(d?.meta).toBe(meta); expect(d?.semRisco).toBe(sem); expect(d?.comRisco).toBe(risco);
    expect(d?.pctSem).toBeCloseTo(Number(pctSem)); expect(d?.pctCom).toBeCloseTo(Number(pctCom));
  });
  it('TOTAL GERAL usa totais: 6500/10000 e (6500+1500)/10000', () => {
    const t = consolidate(rowsForWeek(source, 2));
    expect([t.meta, t.semRisco, t.comRisco]).toEqual([10000, 6500, 1500]);
    expect(t.pctSem).toBe(65); expect(t.pctCom).toBe(80);
  });
  it.each([0, null])('meta %s não gera divisão por zero em nenhuma visualização', (meta) => {
    const r = row('Z', 'PA', meta, 800, 100);
    const t = consolidate([r]), m = projectionPanelMetrics([r]), d = consolidateByDivisional([r])[0];
    expect([t.pctSem, t.pctCom, m.pctMeta, m.pctCom, d.pctSem, d.pctCom]).toEqual([null, null, null, null, null, null]);
  });
  it('usa exclusivamente a semana e os filtros escolhidos sem alterar os lançamentos', () => {
    const original = JSON.stringify(source);
    const t = consolidate(rowsForWeek(filterRows(source, 'MT', 'A'), 2));
    expect([t.meta, t.semRisco, t.comRisco, t.pctSem, t.pctCom]).toEqual([1000, 800, 100, 80, 90]);
    expect(JSON.stringify(source)).toBe(original);
    expect(consolidate(rowsForWeek(source, 3)).comRisco).toBe(0);
  });
});