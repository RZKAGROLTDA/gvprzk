import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// =============================================================================
// useClientEquipment
// =============================================================================
// Hook central para o bloco "Parque de Máquinas".
// Padrões do projeto:
//   - staleTime 5 min, sem refetchOnWindowFocus
//   - colunas explícitas, nunca SELECT *
//   - filtros 'Todos'/'all'/'' são convertidos para null antes de consultar
// =============================================================================

const EQUIPMENT_COLUMNS =
  'id, client_code, client_name, filial_id, model, serial_chassis, hours, year, observation, machine_type, product_raw, puk_status, machine_status, last_validation_at, validated_by, import_batch_id, validation_priority, validation_source, validation_priority_reason, validation_priority_updated_at, previous_client_code, previous_client_name, transfer_date, transfer_note, transferred_by, created_at, updated_at';

export interface ClientEquipment {
  id: string;
  client_code: string | null;
  client_name: string;
  filial_id: string | null;
  model: string | null;
  serial_chassis: string | null;
  hours: number | null;
  year: number | null;
  observation: string | null;
  machine_type: string | null;
  product_raw: string | null;
  puk_status: string | null;
  machine_status: string;
  last_validation_at: string | null;
  validated_by: string | null;
  import_batch_id: string | null;
  validation_priority: boolean | null;
  validation_source: string | null;
  validation_priority_reason: string | null;
  validation_priority_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EquipmentFilters {
  search?: string;
  machineType?: string | null;
  machineStatus?: string | null;
  clientCode?: string | null;
  clientName?: string | null;
  validationPriority?: boolean | null;
}

const norm = (v?: string | null) => {
  if (!v) return null;
  const t = v.trim();
  if (!t || ['todos', 'all', 'todas'].includes(t.toLowerCase())) return null;
  return t;
};

// -----------------------------------------------------------------------------
// Autoselect: parque do cliente da tarefa atual
// -----------------------------------------------------------------------------
/**
 * Carrega o parque de máquinas do cliente selecionado.
 * Usa RPC `search_client_equipment` (SECURITY DEFINER) que aplica:
 *   1) match exato por client_code (trim/text)
 *   2) fallback por client_name ILIKE quando o código não retorna nada
 *   3) também aceita serial como critério adicional
 * Isso resolve registros importados sem filial_id/created_by, que ficariam
 * invisíveis pela RLS direta da tabela.
 */
export const useEquipmentByClient = (
  clientCode?: string,
  clientName?: string,
  serial?: string,
) => {
  const code = norm(clientCode);
  const name = norm(clientName);
  const ser = norm(serial);
  return useQuery({
    queryKey: ['client-equipment', 'by-client-rpc', code, name, ser],
    enabled: !!(code || name || ser),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ClientEquipment[]> => {
      const { data, error } = await (supabase as any).rpc('search_client_equipment', {
        p_client_code: code,
        p_client_name: name,
        p_serial: ser,
      });
      if (error) throw error;
      return ((data as unknown) as ClientEquipment[]) ?? [];
    },
  });
};

// -----------------------------------------------------------------------------
// Busca genérica para a tela /equipamentos
// -----------------------------------------------------------------------------
export const useEquipmentSearch = (filters: EquipmentFilters, page = 0, pageSize = 50) => {
  const search = norm(filters.search);
  const machineType = norm(filters.machineType);
  const machineStatus = norm(filters.machineStatus);
  const clientCode = norm(filters.clientCode);
  const clientName = norm(filters.clientName);
  const validationPriority = filters.validationPriority ?? null;
  const isFirstPage = page === 0;

  return useQuery({
    queryKey: [
      'client-equipment',
      'search',
      { search, machineType, machineStatus, clientCode, clientName, validationPriority, page, pageSize },
    ],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let q = supabase
        .from('client_equipment' as any)
        .select(EQUIPMENT_COLUMNS, isFirstPage ? { count: 'exact' } : undefined)
        .order('validation_priority', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);

      if (clientCode) q = q.eq('client_code', clientCode);
      if (clientName) q = q.ilike('client_name', `%${clientName}%`);
      if (machineType) q = q.eq('machine_type', machineType);
      if (machineStatus) q = q.eq('machine_status', machineStatus);
      if (validationPriority === true) q = q.eq('validation_priority', true);

      if (search) {
        // Busca livre: modelo, chassi, nome cliente, código cliente
        const s = search.replace(/[%,]/g, '');
        q = q.or(
          `model.ilike.%${s}%,serial_chassis.ilike.%${s}%,client_name.ilike.%${s}%,client_code.ilike.%${s}%`,
        );
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return {
        rows: (data as unknown as ClientEquipment[]) ?? [],
        totalCount: count ?? null,
      };
    },
  });
};

// -----------------------------------------------------------------------------
// Atualização de equipamento (campos editáveis pela UI)
// -----------------------------------------------------------------------------
export interface EquipmentUpdatePayload {
  model?: string | null;
  year?: number | null;
  hours?: number | null;
  serial_chassis?: string | null;
  observation?: string | null;
  machine_status?: string;
  puk_status?: string | null;
  client_code?: string | null;
  /** Quando true, grava last_validation_at = now() e validated_by = auth.uid() */
  markValidated?: boolean;
}

export const useUpdateEquipment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: EquipmentUpdatePayload }) => {
      const { markValidated, ...rest } = patch;
      const update: Record<string, any> = { ...rest, updated_at: new Date().toISOString() };
      if (markValidated) {
        update.last_validation_at = new Date().toISOString();
        const { data: auth } = await supabase.auth.getUser();
        update.validated_by = auth?.user?.id ?? null;
      }
      const { data, error } = await supabase
        .from('client_equipment' as any)
        .update(update)
        .eq('id', id)
        .select(EQUIPMENT_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error(
          'Não foi possível atualizar o equipamento. Verifique se você tem permissão ou recarregue a página.',
        );
      }
      return data as unknown as ClientEquipment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-equipment'] });
    },
  });
};

// -----------------------------------------------------------------------------
// Vínculo de equipamentos com uma task (task_equipment)
// -----------------------------------------------------------------------------
export const useTaskEquipmentIds = (taskId?: string) => {
  return useQuery({
    queryKey: ['task-equipment', taskId],
    enabled: !!taskId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('task_equipment' as any)
        .select('equipment_id')
        .eq('task_id', taskId);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.equipment_id);
    },
  });
};

export const syncTaskEquipment = async (taskId: string, equipmentIds: string[]) => {
  // Estratégia simples: apaga vínculos antigos da task e reinsere os atuais.
  const { error: delErr } = await supabase
    .from('task_equipment' as any)
    .delete()
    .eq('task_id', taskId);
  if (delErr) throw delErr;
  if (equipmentIds.length === 0) return;
  const { data: auth } = await supabase.auth.getUser();
  const payload = equipmentIds.map((equipment_id) => ({
    task_id: taskId,
    equipment_id,
    created_by: auth?.user?.id,
  }));
  const { error: insErr } = await supabase.from('task_equipment' as any).insert(payload);
  if (insErr) throw insErr;
};
