import type { ConsolidatedMetrics } from '@/hooks/useConsolidatedSalesMetrics';

/** Etapas clicáveis do funil gráfico. Mesmas classificações da tela atual. */
export type FunnelStage = 'contacts' | 'prospects' | 'sales' | 'partial' | 'lost';
export type ActivityKind = 'prospection' | 'ligacao' | 'checklist';

interface StageRecord {
  taskType?: string;
  isProspect?: boolean;
  salesConfirmed?: boolean;
  salesType?: string | null;
}

/** Registros de cada etapa, usando exatamente as regras já existentes no funil. */
export function recordsForStage<T extends StageRecord>(rows: T[], stage: FunnelStage, activity?: ActivityKind | null): T[] {
  switch (stage) {
    case 'contacts':
      return rows.filter(r => (activity ? r.taskType === activity : ['prospection', 'ligacao', 'checklist'].includes(r.taskType ?? '')));
    case 'prospects':
      return rows.filter(r => r.isProspect && !r.salesConfirmed && r.salesType !== 'perdido');
    case 'sales':
      return rows.filter(r => r.salesConfirmed && r.salesType === 'ganho');
    case 'partial':
      return rows.filter(r => r.salesConfirmed && r.salesType === 'parcial');
    case 'lost':
      return rows.filter(r => r.salesType === 'perdido');
  }
}

const add = (a: { count: number; value: number }, b: { count: number; value: number }) => ({
  count: a.count + b.count,
  value: a.value + b.value,
});

/**
 * Soma as métricas de várias filiais (Divisional). Cada atividade pertence a
 * uma única filial, então quantidades e valores somam sem duplicar; a taxa
 * é recalculada com a mesma fórmula do servidor.
 */
export function sumConsolidatedMetrics(list: ConsolidatedMetrics[]): ConsolidatedMetrics | null {
  if (list.length === 0) return null;
  const [first, ...rest] = list;
  const out: ConsolidatedMetrics = JSON.parse(JSON.stringify(first));
  for (const m of rest) {
    (Object.keys(out.overview) as (keyof ConsolidatedMetrics['overview'])[]).forEach(k => {
      out.overview[k] = add(out.overview[k], m.overview[k]);
    });
    const f = out.funnel, g = m.funnel;
    f.visitas = add(f.visitas, g.visitas);
    f.checklists = add(f.checklists, g.checklists);
    f.ligacoes = add(f.ligacoes, g.ligacoes);
    f.prospeccoesAbertas = add(f.prospeccoesAbertas, g.prospeccoesAbertas);
    f.prospeccoesFechadas = add(f.prospeccoesFechadas, g.prospeccoesFechadas);
    f.prospeccoesPerdidas = add(f.prospeccoesPerdidas, g.prospeccoesPerdidas);
    f.vendasTotal = add(f.vendasTotal, g.vendasTotal);
    f.vendasParcial = add(f.vendasParcial, g.vendasParcial);
  }
  const f = out.funnel;
  f.totalContatos = f.visitas.count + f.checklists.count + f.ligacoes.count;
  f.totalProspeccoes = f.prospeccoesAbertas.count;
  f.totalVendas = f.vendasTotal.count + f.vendasParcial.count;
  f.taxaConversao = f.totalContatos > 0 ? (f.totalVendas / f.totalContatos) * 100 : 0;
  out.overview.contacts = { count: f.totalContatos, value: 0 };
  return out;
}
