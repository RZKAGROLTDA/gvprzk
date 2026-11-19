import { describe, it, expect } from 'vitest';
import { recordsForStage, sumConsolidatedMetrics } from './salesFunnelView';

const z = { count: 0, value: 0 };
const mk = (v: number, vendas: number, lig = 0) => ({
  overview: { contacts: z, prospects: z, sales: { count: vendas, value: vendas * 100 }, partialSales: z, lostSales: z },
  funnel: { visitas: { count: v, value: 0 }, checklists: z, ligacoes: { count: lig, value: 0 }, totalContatos: v + lig,
    prospeccoesAbertas: z, prospeccoesFechadas: z, prospeccoesPerdidas: z, totalProspeccoes: 0,
    vendasTotal: { count: vendas, value: vendas * 100 }, vendasParcial: z, totalVendas: vendas, taxaConversao: 0 },
});

describe('salesFunnelView', () => {
  it('soma filiais da divisional sem alterar a fórmula da taxa', () => {
    const s = sumConsolidatedMetrics([mk(10, 1), mk(5, 2, 5)])!;
    expect(s.funnel.totalContatos).toBe(20);
    expect(s.funnel.vendasTotal).toEqual({ count: 3, value: 300 });
    expect(s.funnel.taxaConversao).toBeCloseTo(15);
  });
  it('separa registros por etapa e por tipo de atividade', () => {
    const rows = [
      { taskType: 'prospection', isProspect: true, salesConfirmed: false, salesType: null },
      { taskType: 'ligacao', salesConfirmed: true, salesType: 'ganho' },
      { taskType: 'checklist', salesConfirmed: true, salesType: 'parcial' },
      { taskType: 'prospection', isProspect: true, salesType: 'perdido' },
    ];
    expect(recordsForStage(rows, 'contacts', 'ligacao')).toHaveLength(1);
    expect(recordsForStage(rows, 'prospects')).toHaveLength(1);
    expect(recordsForStage(rows, 'sales')).toHaveLength(1);
    expect(recordsForStage(rows, 'partial')).toHaveLength(1);
    expect(recordsForStage(rows, 'lost')).toHaveLength(1);
  });
});
