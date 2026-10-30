import { supabase } from '@/integrations/supabase/client';

export type ActivityExportKind = 'ligacao' | 'visita' | 'checklist';

export interface ActivityExportParams {
  kind: ActivityExportKind;
  startDate?: string | null;
  endDate?: string | null;
  filialId?: string | null;
  sellerRole?: string | null;
  sellerId?: string | null;
  clientName?: string | null;
  filialAtendida?: string | null;
  taskTypes?: string[] | null;
}

type Row = Record<string, any>;

const PAGE = 1000; // limite de linhas por resposta do Supabase
const MAX_BATCHES = 1000;

const TYPE_LABEL: Record<string, string> = {
  ligacao: 'Ligação', visita: 'Visita', prospection: 'Prospecção',
  technical_visit: 'Visita Técnica', checklist: 'Checklist',
};

const nn = (v: unknown) => (v === undefined || v === '' || v === 'all' || v === 'Todos' ? null : v);

/** Busca todas as atividades em lotes keyset (por ID). Lança erro se incompleto/duplicado. */
export async function fetchAllActivities(
  p: ActivityExportParams,
  onProgress?: (n: number) => void,
): Promise<Row[]> {
  const all: Row[] = [];
  const seen = new Set<string>();
  let after: string | null = null;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await (supabase.rpc as any)('get_management_activity_export', {
      p_kind: p.kind,
      p_start_date: nn(p.startDate),
      p_end_date: nn(p.endDate),
      p_filial_id: nn(p.filialId),
      p_seller_role: nn(p.sellerRole),
      p_seller_id: nn(p.sellerId),
      p_client_code: null,
      p_client_name: nn(p.clientName?.trim()),
      p_filial_atendida: nn(p.filialAtendida?.trim()),
      p_task_types: p.taskTypes && p.taskTypes.length ? p.taskTypes : null,
      p_after_id: after,
      p_limit: PAGE,
    });
    if (error) throw new Error(error.message);
    const rows = (data || []) as Row[];
    if (rows.length === 0) return all;
    for (const r of rows) {
      if (seen.has(r.task_id)) throw new Error('Exportação interrompida: atividade duplicada detectada.');
      seen.add(r.task_id);
      all.push(r);
    }
    const last = rows[rows.length - 1].task_id as string;
    if (after !== null && last <= after) throw new Error('Exportação interrompida: paginação não avançou.');
    after = last;
    onProgress?.(all.length);
  }
  throw new Error('Exportação interrompida: limite de lotes excedido.');
}

const arr = (v: any): any[] => (Array.isArray(v) ? v : []);

function activityRow(r: Row) {
  return {
    'ID Atividade': r.task_id,
    'Tipo': TYPE_LABEL[r.task_type] ?? r.task_type,
    'Data': r.start_date,
    'Hora': r.start_time,
    'Status': r.status,
    'Filial': r.filial,
    'Filial Atendida': r.filial_atendida,
    'Vendedor': r.seller_name,
    'Cargo': r.seller_role,
    'Cliente': r.client,
    'Código Cliente': r.client_code,
    'Propriedade': r.property,
    'Área Total (ha)': r.property_hectares,
    'Contato': r.contact_name,
    'Função Contato': r.contact_function,
    'Telefone': r.phone,
    'E-mail': r.email,
    'Observações': r.observations,
    'Tipo de Venda': r.sales_type,
    'Valor Venda': r.sales_value,
    'Valor Venda Parcial': r.partial_sales_value,
    'Venda Confirmada': r.sales_confirmed == null ? '' : r.sales_confirmed ? 'Sim' : 'Não',
    'Prospect': r.is_prospect == null ? '' : r.is_prospect ? 'Sim' : 'Não',
    'Próxima Ação': r.next_action,
    'Data Próxima Ação': r.next_action_date,
    'Qtd. Máquinas Informada': r.equipment_quantity,
    'Status Oportunidade': r.opportunity_status,
    'Valor Oportunidade': r.opportunity_total,
    'Valor Venda Fechada': r.opportunity_closed,
    'Acompanhamento': r.followup_status,
    'Próximo Retorno': r.followup_next_return,
    'Temperatura': r.followup_temperature,
    'Notas Acompanhamento': r.followup_notes,
  };
}

/** Monta as abas (puro, testável). */
export function buildActivitySheets(kind: ActivityExportKind, rows: Row[]) {
  const sheets: Record<string, Row[]> = {};
  if (kind === 'ligacao') {
    sheets['Ligações'] = rows.map(activityRow);
  } else if (kind === 'checklist') {
    sheets['Checklists'] = rows.map(r => ({
      ...activityRow(r),
      'Chassi da Máquina': r.checklist_machine?.chassi_serie ?? '',
    }));
    sheets['Checklist - Máquina'] = rows.filter(r => r.checklist_machine).map(r => {
      const m = r.checklist_machine || {};
      return {
        'ID Atividade': r.task_id, 'Data': r.start_date, 'Cliente': r.client,
        'Chassi/Série': m.chassi_serie ?? '', 'Modelo': m.modelo ?? '', 'Tipo': m.tipo ?? m.machine_type ?? '',
        'Ano': m.ano ?? '', 'Horímetro': m.horimetro ?? '', 'Situação': m.situacao ?? '',
        'Observações': m.observacao ?? '',
      };
    });
  } else {
    sheets['Visitas'] = rows.map(activityRow);
    const surveyed: Row[] = [];
    const tech: Row[] = [];
    const park: Row[] = [];
    for (const r of rows) {
      arr(r.surveyed_machines).forEach((m, i) => surveyed.push({
        'ID Atividade': r.task_id, 'Nº': i + 1, 'Cliente': r.client,
        'Família': m.family ?? '', 'Tipo': m.machine_type ?? '', 'Modelo': m.model ?? '',
        'Chassi/Série': m.serial_chassis ?? '', 'Ano': m.year ?? '', 'Horímetro': m.hours ?? '',
        'Quantidade': m.quantity ?? '', 'Status PUK': m.puk_status ?? '',
      }));
      const tv = r.technical_visit;
      if (tv) arr(tv.equipments).forEach((m, i) => tech.push({
        'ID Atividade': r.task_id, 'Nº': i + 1, 'Cliente': r.client,
        'Tipo de Serviço': typeof tv.service_type === 'string' ? tv.service_type : JSON.stringify(tv.service_type ?? ''),
        'Orçamento Total': tv.total_estimate ?? '',
        'Tipo': m.machine_type ?? m.type ?? '', 'Modelo': m.model ?? m.modelo ?? '',
        'Chassi/Série': m.serial_chassis ?? m.chassi ?? '', 'Ano': m.year ?? m.ano ?? '',
        'Horímetro': m.hours ?? m.horimetro ?? '',
      }));
      arr(r.park_machines).forEach(m => park.push({
        'ID Atividade': r.task_id, 'Cliente': r.client, 'ID Equipamento (Parque)': m.equipment_id,
        'Tipo': m.machine_type ?? '', 'Modelo': m.model ?? '', 'Chassi/Série': m.serial_chassis ?? '',
        'Ano': m.year ?? '', 'Horímetro': m.hours ?? '', 'Status PUK': m.puk_status ?? '',
        'Situação': m.machine_status ?? '', 'Última Validação': m.last_validation_at ?? '',
        'Filial (cadastro)': m.filial ?? '',
      }));
    }
    sheets['Visita - Máq. Levantadas'] = surveyed;
    sheets['Visita Técnica - Máquinas'] = tech;
    sheets['Parque Atual (cadastro)'] = park;
  }
  return sheets;
}

export async function exportActivitiesExcel(
  p: ActivityExportParams,
  onProgress?: (n: number) => void,
): Promise<number> {
  const rows = await fetchAllActivities(p, onProgress);
  if (rows.length === 0) return 0;
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const [name, data] of Object.entries(buildActivitySheets(p.kind, rows))) {
    const ws = data.length ? XLSX.utils.json_to_sheet(data) : XLSX.utils.aoa_to_sheet([['Sem registros']]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const file = { ligacao: 'ligacoes', visita: 'visitas', checklist: 'checklists' }[p.kind];
  XLSX.writeFile(wb, `${file}_${stamp}.xlsx`);
  return rows.length;
}
