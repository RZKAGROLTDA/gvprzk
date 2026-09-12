/**
 * Relatório Excel "POPS — Máquinas Serviçadas".
 *
 * Somente leitura: exporta as máquinas já concluídas (status = 'servicada' e
 * active = true) usando exclusivamente os dados registrados na conclusão.
 * Respeita o escopo do usuário (RLS) e os filtros aplicados na tela do POPS.
 */
import { supabase } from '@/integrations/supabase/client';

export interface PopsServicedExcelFilters {
  programId: string;
  filialId?: string | null;
  platform?: 'all' | 'Large' | 'Small';
  client?: string;
  serial?: string;
  model?: string;
  executedBy?: string | null;
}

const crush = (v?: string | null) =>
  (v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/** Mapa fixo Loja (Dealer Location) → Divisional. */
const DIVISIONAL_BY_STORE: Record<string, string> = {};
const GO = ['MINEIROS', 'ALTO TAQUARI', 'BARRA DO GARCAS', 'PLANALTO VERDE', 'CAIAPONIA'];
const MT = [
  'QUERENCIA', 'CANARANA', 'AGUA BOA', 'SAO FELIX DO ARAGUAIA', 'PORTO ALEGRE DO NORTE',
  'GAUCHA DO NORTE', 'SAO JOSE DO XINGU', 'VILA RICA',
];
GO.forEach((s) => { DIVISIONAL_BY_STORE[crush(s)] = 'GO'; });
MT.forEach((s) => { DIVISIONAL_BY_STORE[crush(s)] = 'MT'; });

const divisionalFor = (store?: string | null) => DIVISIONAL_BY_STORE[crush(store)] ?? '';

type MachineRow = {
  pops_serial: string | null;
  pops_model: string | null;
  pops_client_code: string | null;
  pops_client_name: string | null;
  pops_dealer_location: string | null;
  pops_product_series: string | null;
  pops_platform: string | null;
  os_number: string | null;
  executed_by: string | null;
  executed_at: string | null;
  final_service_id: string | null;
};

const PAGE = 1000;

const fetchServicedMachines = async (f: PopsServicedExcelFilters): Promise<MachineRow[]> => {
  const rows: MachineRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from('pops_machines')
      .select(
        'pops_serial, pops_model, pops_client_code, pops_client_name, pops_dealer_location, pops_product_series, pops_platform, os_number, executed_by, executed_at, final_service_id',
      )
      .eq('program_id', f.programId)
      .eq('active', true)
      .eq('status', 'servicada')
      .order('executed_at', { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (f.filialId) q = q.eq('pops_filial_id', f.filialId);
    if (f.platform && f.platform !== 'all') q = q.eq('pops_platform', f.platform);
    if (f.executedBy) q = q.eq('executed_by', f.executedBy);
    if (f.serial?.trim()) q = q.ilike('pops_serial', `%${f.serial.trim()}%`);
    if (f.client?.trim()) {
      const s = f.client.trim();
      q = q.or(`pops_client_name.ilike.%${s}%,pops_client_code.ilike.%${s}%`);
    }

    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as MachineRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  // Modelo/série: mesma regra flexível usada na tela (sem acento/pontuação)
  const model = crush(f.model);
  return model
    ? rows.filter((r) => crush(r.pops_model).includes(model) || crush(r.pops_product_series).includes(model))
    : rows;
};

const fetchServiceNames = async (ids: string[]) => {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase.from('pops_services').select('id, name').in('id', ids);
  if (error) throw error;
  (data ?? []).forEach((s) => map.set(s.id, s.name));
  return map;
};

/**
 * Nomes dos executores (PM RAC) via RPC de resultados por executor — respeita o
 * escopo do usuário e não depende de leitura direta de profiles.
 */
const fetchExecutorNames = async (f: PopsServicedExcelFilters) => {
  const map = new Map<string, string>();
  const { data, error } = await supabase.rpc('pops_executor_results', {
    p_program_id: f.programId,
    p_filial_id: f.filialId ?? undefined,
  });
  if (error) throw error;
  const payload = (data ?? {}) as { rows?: { user_id: string; executor_name: string }[] };
  (payload.rows ?? []).forEach((r) => {
    if (r.user_id) map.set(r.user_id, r.executor_name ?? '');
  });
  return map;
};

export async function exportPopsServicedExcel(
  f: PopsServicedExcelFilters,
): Promise<number> {
  const machines = await fetchServicedMachines(f);
  if (machines.length === 0) return 0;

  const [services, executors] = await Promise.all([
    fetchServiceNames([...new Set(machines.map((m) => m.final_service_id).filter(Boolean) as string[])]),
    fetchExecutorNames(f),
  ]);

  const data = machines.map((m, i) => ({
    '#': i + 1,
    'PM RAC': (m.executed_by && executors.get(m.executed_by)) || '',
    'Divisional': divisionalFor(m.pops_dealer_location),
    'Loja': m.pops_dealer_location ?? '',
    'OS': m.os_number ?? '',
    'Chassis': m.pops_serial ?? '',
    'Código Cliente': m.pops_client_code ?? '',
    'Cliente': m.pops_client_name ?? '',
    'Serviços': (m.final_service_id && services.get(m.final_service_id)) || '',
  }));

  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 6 }, { wch: 26 }, { wch: 11 }, { wch: 22 }, { wch: 14 },
    { wch: 20 }, { wch: 16 }, { wch: 36 }, { wch: 30 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Serviçadas');

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  XLSX.writeFile(wb, `pops-maquinas-servicadas-${stamp}.xlsx`);
  return data.length;
}
