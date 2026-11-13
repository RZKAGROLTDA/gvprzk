import { describe, it, expect } from 'vitest';
import { consolidate, consolidateByDivisional, defaultProjectionWeek, projectionPanelMetrics, rowsForWeek, ProjectionRow } from './projection';

const row = (p: Partial<ProjectionRow>): ProjectionRow => ({
  filial_id: 'x', filial_nome: 'X', divisional: 'MT', meta: 0,
  s1_sem: null, s1_com: null, s2_sem: null, s2_com: null, s3_sem: null, s3_com: null, s4_sem: null, s4_com: null,
  ultima_semana: null, ultima_sem_risco: null, ultima_com_risco: null, ultima_atualizacao: null, atualizado_por: null, ...p,
});
// A: MT com S1 e S2; B: MT só S1; C: GO só S2; D: PA sem lançamentos.
const base = [
  row({ filial_id: 'A', divisional: 'MT', meta: 1000, s1_sem: 800, s1_com: 700, s2_sem: 900, s2_com: 850, ultima_semana: 2, ultima_sem_risco: 900, ultima_com_risco: 850 }),
  row({ filial_id: 'B', divisional: 'MT', meta: 500, s1_sem: 400, s1_com: 300, ultima_semana: 1, ultima_sem_risco: 400, ultima_com_risco: 300 }),
  row({ filial_id: 'C', divisional: 'GO', meta: 2000, s2_sem: 2500, s2_com: 2100, ultima_semana: 2, ultima_sem_risco: 2500, ultima_com_risco: 2100 }),
  row({ filial_id: 'D', divisional: 'PA', meta: 300 }),
];

describe('Painel por semana selecionada', () => {
  it('Semana 1 soma só S1, uma vez por filial', () => {
    const t = consolidate(rowsForWeek(base, 1));
    expect([t.meta, t.semRisco, t.comRisco, t.pendentes]).toEqual([3800, 1200, 1000, 2]);
  });
  it('Semana 2 não reaproveita S1 de quem não lançou S2', () => {
    const t = consolidate(rowsForWeek(base, 2));
    expect([t.semRisco, t.comRisco, t.pendentes]).toEqual([3400, 2950, 2]);
  });
  it('meta mensal é igual em todas as semanas', () => {
    expect(([1, 2, 3, 4] as const).map((w) => consolidate(rowsForWeek(base, w)).meta)).toEqual([3800, 3800, 3800, 3800]);
  });
  it('semana sem lançamentos deixa todas as filiais pendentes e projeção zero', () => {
    const t = consolidate(rowsForWeek(base, 3));
    expect([t.semRisco, t.pendentes, t.gapSem]).toEqual([0, 4, -3800]);
  });
  it('divisionais da Semana 2 somam exatamente o total geral', () => {
    const w = rowsForWeek(base, 2);
    const divs = consolidateByDivisional(w);
    expect(divs.map((d) => [d.divisional, d.semRisco, d.pendentes])).toEqual([['MT', 900, 1], ['GO', 2500, 0], ['PA', 0, 1]]);
    expect(divs.reduce((s, d) => s + d.semRisco, 0)).toBe(consolidate(w).semRisco);
    expect(divs.reduce((s, d) => s + d.meta, 0)).toBe(consolidate(w).meta);
  });
  it('soma das filiais = total geral na semana selecionada', () => {
    const w = rowsForWeek(base, 1);
    expect(w.reduce((s, r) => s + consolidate([r]).semRisco, 0)).toBe(consolidate(w).semRisco);
  });
  it('% Meta e GAP seguem a semana selecionada', () => {
    const m = projectionPanelMetrics(rowsForWeek([base[0]], 1));
    expect([m.pctMeta, m.gap]).toEqual([80, -200]);
  });
  it('variação da Semana 2 compara com a Semana 1 da mesma filial', () => {
    expect(projectionPanelMetrics(rowsForWeek([base[0]], 2)).variation).toBeCloseTo(12.5);
  });
  it('semana padrão segue os dias 1–7, 8–14, 15–21 e 22+', () => {
    expect([7, 8, 14, 15, 21, 22, 30].map((d) => defaultProjectionWeek(new Date(2026, 10, d), 2026, 11))).toEqual([1, 2, 2, 3, 3, 4, 4]);
  });
  it('mês passado abre na Semana 4 e mês futuro na Semana 1', () => {
    const today = new Date(2026, 10, 13);
    expect([defaultProjectionWeek(today, 2026, 10), defaultProjectionWeek(today, 2026, 12), defaultProjectionWeek(today, 2025, 11)]).toEqual([4, 1, 4]);
  });
});
