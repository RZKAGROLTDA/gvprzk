import { getRoleLabel } from '@/lib/roles';
import { formatDateDisplay } from '@/lib/utils';
import type {
  ServiceOpportunitiesSummary,
  ServiceOpportunityDetailRow,
} from '@/hooks/useServiceOpportunities';

/**
 * Oportunidades de Serviços — helpers de apresentação e exportação.
 * Regra de negócio (classificação item → tipo de serviço) vive no banco,
 * em public.map_checklist_item_to_service. Aqui só formatação.
 */

export const SERVICE_TYPES = [
  'Pneus',
  'Fluidos / Arrefecimento',
  'Sistema Elétrico',
  'Lubrificação / Motor',
  'Transmissão',
  'Baterias',
  'Suspensão',
  'Outros Serviços',
] as const;

export const SEVERITY_LABELS: Record<string, string> = {
  alta: 'Alta',
  media: 'Média',
};

export const severityVariant = (severity: string): 'destructive' | 'warning' =>
  severity === 'alta' ? 'destructive' : 'warning';

export const monthLabel = (mes: string): string => {
  const [y, m] = (mes || '').split('-');
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const idx = Number(m) - 1;
  if (!y || Number.isNaN(idx) || idx < 0 || idx > 11) return mes;
  return `${names[idx]}/${y}`;
};

const asText = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export const exportServiceOpportunitiesExcel = async (
  rows: ServiceOpportunityDetailRow[],
  summary: ServiceOpportunitiesSummary,
) => {
  const sheet1 = rows.map((r) => ({
    'Data do Checklist': r.checklist_date ? formatDateDisplay(r.checklist_date) : '',
    'Filial': r.filial_nome,
    'Responsável': r.seller_name,
    'Cargo': getRoleLabel(r.seller_role),
    'Cliente': r.client_name,
    'Código do Cliente': asText(r.client_code),
    'Tipo de Máquina': r.machine_type,
    'Modelo': r.machine_model,
    'Chassi/Série': asText(r.machine_serial),
    'Ano': asText(r.machine_year),
    'Horímetro': asText(r.machine_hours),
    'Tipo de Serviço': r.service_type,
    'Item do Checklist': r.item_name,
    'Severidade': SEVERITY_LABELS[r.severity] ?? r.severity,
    'response_status': r.response_status,
    'Observação': r.observation,
    'ID do Checklist': r.task_id,
  }));

const XLSX = await import('xlsx');
  const ws1 = XLSX.utils.json_to_sheet(sheet1);
  // Preserva código do cliente e chassi/série como texto (não perder zeros à esquerda).
  const textCols = ['F', 'I', 'J', 'K', 'Q'];
  for (let i = 2; i <= sheet1.length + 1; i++) {
    textCols.forEach((col) => {
      const cell = ws1[`${col}${i}`];
      if (cell) {
        cell.t = 's';
        cell.z = '@';
        cell.v = asText(cell.v);
      }
    });
  }

  const k = summary.kpis;
  const resumo: (string | number)[][] = [
    ['Indicador', 'Valor'],
    ['Oportunidades Potenciais', k.oportunidades],
    ['Clientes com Oportunidade', k.clientes],
    ['Máquinas com Oportunidade', k.maquinas],
    ['Checklists com Oportunidade', k.checklists_com_oportunidade],
    ['Taxa de Oportunidade (%)', k.taxa_oportunidade],
    ['Itens Não Avaliados', k.itens_nao_avaliados],
    [],
    ['Ranking por Tipo de Serviço'],
    ['Tipo de Serviço', 'Oportunidades Potenciais', 'Alta', 'Média', 'Clientes', 'Máquinas', '% do Total'],
    ...summary.by_service.map((s) => [
      s.service_type,
      s.oportunidades,
      s.alta,
      s.media,
      s.clientes,
      s.maquinas,
      k.oportunidades > 0 ? Number(((s.oportunidades / k.oportunidades) * 100).toFixed(1)) : 0,
    ]),
    [],
    ['Oportunidades por Filial'],
    ['Filial', 'Oportunidades Potenciais', 'Alta', 'Média', 'Clientes', 'Checklists'],
    ...summary.by_filial.map((f) => [f.filial_nome, f.oportunidades, f.alta, f.media, f.clientes, f.checklists]),
    [],
    ['Oportunidades por Responsável'],
    ['Responsável', 'Cargo', 'Filial', 'Oportunidades Potenciais', 'Alta', 'Média', 'Clientes', 'Checklists'],
    ...summary.by_seller.map((s) => [
      s.seller_name,
      getRoleLabel(s.seller_role),
      s.filial_nome,
      s.oportunidades,
      s.alta,
      s.media,
      s.clientes,
      s.checklists,
    ]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(resumo);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Oportunidades');
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumo');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `oportunidades_de_servicos_${stamp}.xlsx`);
};
