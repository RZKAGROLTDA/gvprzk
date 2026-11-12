import { describe, it, expect } from 'vitest';
import { consolidate, consolidateByDivisional, validateGoalImport, ProjectionRow } from './projection';

const row = (p: Partial<ProjectionRow>): ProjectionRow => ({
  filial_id: 'x', filial_nome: 'X', divisional: 'MT', meta: 0,
  s1_sem: null, s1_com: null, s2_sem: null, s2_com: null, s3_sem: null, s3_com: null, s4_sem: null, s4_com: null,
  ultima_semana: null, ultima_sem_risco: null, ultima_com_risco: null, ultima_atualizacao: null, atualizado_por: null, ...p,
});

describe('Projeção', () => {
  it('usa só a última semana, sem somar S1..S4', () => {
    const r = row({ meta: 1000, s1_sem: 500, s1_com: 400, s2_sem: 800, s2_com: 700, ultima_semana: 2, ultima_sem_risco: 800, ultima_com_risco: 700 });
    const c = consolidate([r]);
    expect(c.semRisco).toBe(800);
    expect(c.comRisco).toBe(700);
    expect(c.pctSem).toBe(80);
    expect(c.gapCom).toBe(-300);
  });
  it('filial sem lançamento é pendente, não zero somado', () => {
    const c = consolidate([row({ meta: 500 }), row({ meta: 500, ultima_semana: 1, ultima_sem_risco: 600, ultima_com_risco: 300 })]);
    expect(c.pendentes).toBe(1);
    expect(c.meta).toBe(1000);
    expect(c.semRisco).toBe(600);
  });
  it('consolida por divisional', () => {
    const d = consolidateByDivisional([
      row({ divisional: 'MT', meta: 100, ultima_semana: 4, ultima_sem_risco: 90, ultima_com_risco: 80 }),
      row({ divisional: 'MT', meta: 100, ultima_semana: 3, ultima_sem_risco: 110, ultima_com_risco: 100 }),
      row({ divisional: 'GO', meta: 50, ultima_semana: 1, ultima_sem_risco: 40, ultima_com_risco: 30 }),
    ]);
    const mt = d.find((x) => x.divisional === 'MT')!;
    expect(mt.meta).toBe(200); expect(mt.semRisco).toBe(200); expect(mt.comRisco).toBe(180);
    expect(d.find((x) => x.divisional === 'GO')!.semRisco).toBe(40);
  });
  it('importação: aceita válidas e recusa Tele Vendas, filial desconhecida, mês 13 e meta negativa', () => {
    const f = [{ filial_id: '1', filial_nome: 'Sinop' }];
    const r = validateGoalImport([
      { Filial: 'sinop', Mês: 11, Ano: 2026, Meta: 'R$ 1.500.000,50' },
      { Filial: 'Tele Vendas', Mês: 11, Ano: 2026, Meta: 10 },
      { Filial: 'Xpto', Mês: 11, Ano: 2026, Meta: 10 },
      { Filial: 'Sinop', Mês: 13, Ano: 2026, Meta: 10 },
      { Filial: 'Sinop', Mês: 12, Ano: 2026, Meta: -1 },
    ], f);
    expect(r.valid).toEqual([{ filial_id: '1', filial_nome: 'Sinop', ano: 2026, mes: 11, meta: 1500000.5 }]);
    expect(r.errors).toHaveLength(4);
  });
});
