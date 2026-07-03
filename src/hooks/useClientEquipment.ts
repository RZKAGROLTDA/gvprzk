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
  'id, client_code, client_name, filial_id, model, serial_chassis, hours, year, observation, machine_type, product_raw, puk_status, machine_status, last_validation_at, validated_by, import_batch_id, validation_priority, validation_source, validation_priority_reason, validation_priority_updated_at, previous_client_code, previous_client_name, transferred_at, transfer_observation, transferred_by, transfer_history, created_at, updated_at';

export interface EquipmentTransferHistoryEntry {
  at: string;
  by: string | null;
  from_client_code: string | null;
  from_client_name: string | null;
  to_client_code: string | null;
  to_client_name: string;
  observation: string | null;
}

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
  previous_client_code: string | null;
  previous_client_name: string | null;
  transferred_at: string | null;
  transfer_observation: string | null;
  transferred_by: string | null;
  transfer_history: EquipmentTransferHistoryEntry[] | null;
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
  validatedBy?: string | null;
  validatorFilialId?: string | null;
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
      // [DIAG-TEMP]
      console.log('[EquipmentSearch] parâmetros p/ search_client_equipment:', {
        p_client_code: code,
        p_client_name: name,
        p_serial: ser,
      });
      console.log('[EquipmentSearch] client_code:', code, '| client_name:', name);
      const { data, error } = await (supabase as any).rpc('search_client_equipment', {
        p_client_code: code,
        p_client_name: name,
        p_serial: ser,
      });
      if (error) {
        console.log('[EquipmentRPC] ERRO:', error);
        throw error;
      }
      const rows = ((data as unknown) as ClientEquipment[]) ?? [];
      console.log('[EquipmentRPC] qtd máquinas retornadas:', rows.length);
      console.log('[EquipmentRPC] primeiros 5:', rows.slice(0, 5).map((e) => ({
        model: e.model, serial: e.serial_chassis,
      })));
      return rows;
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
// Diretório de validadores (para o painel Parque de Máquinas)
// -----------------------------------------------------------------------------
export interface EquipmentValidator {
  user_id: string;
  name: string | null;
  filial_id: string | null;
  filial_nome: string | null;
  validated_count: number;
}

export const useEquipmentValidators = () => {
  return useQuery({
    queryKey: ['client-equipment', 'validators'],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<EquipmentValidator[]> => {
      const { data, error } = await (supabase as any).rpc('get_equipment_validators');
      if (error) throw error;
      return ((data as unknown) as EquipmentValidator[]) ?? [];
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

// -----------------------------------------------------------------------------
// Criação manual de equipamento (durante visita: máquina não estava na lista)
// -----------------------------------------------------------------------------
export interface EquipmentCreatePayload {
  client_code: string | null;
  client_name: string;
  machine_type?: string | null;
  model?: string | null;
  serial_chassis?: string | null;
  year?: number | null;
  hours?: number | null;
  machine_status?: string;
  observation?: string | null;
}

export class DuplicateEquipmentError extends Error {
  constructor(message = 'Já existe uma máquina cadastrada com este chassi/série.') {
    super(message);
    this.name = 'DuplicateEquipmentError';
  }
}

const normalizeClientCode = (code?: string | null) => {
  const t = code?.trim() || '';
  return t.replace(/^0+/, '');
};

export const useCreateEquipment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: EquipmentCreatePayload) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? null;
      if (!userId) throw new Error('Usuário não autenticado.');
      if (!p.client_name?.trim()) throw new Error('Cliente é obrigatório.');

      const insertPayload: Record<string, any> = {
        client_code: p.client_code?.trim() || null,
        client_name: p.client_name.trim(),
        machine_type: p.machine_type?.trim() || null,
        model: p.model?.trim() || null,
        serial_chassis: p.serial_chassis?.trim() || null,
        year: p.year ?? null,
        hours: p.hours ?? null,
        machine_status: p.machine_status || 'ativa',
        observation: p.observation?.trim() || null,
        validation_priority: false,
        validation_source: 'manual_visita',
        created_by: userId,
      };

      // Validação prévia: evita duplicidade de cliente + chassi/série,
      // respeitando a normalização de zeros à esquerda do client_code.
      if (insertPayload.client_code && insertPayload.serial_chassis) {
        const { data: existing, error: searchErr } = await (supabase as any).rpc(
          'search_client_equipment',
          {
            p_client_code: insertPayload.client_code,
            p_client_name: null,
            p_serial: null,
          },
        );
        if (searchErr) throw searchErr;
        const pCode = normalizeClientCode(insertPayload.client_code);
        const pSerial = insertPayload.serial_chassis.toLowerCase();
        const duplicate = (existing as unknown as ClientEquipment[] | null)?.find((e) => {
          const eCode = normalizeClientCode(e.client_code);
          const eSerial = e.serial_chassis?.trim().toLowerCase() || '';
          return eCode === pCode && eSerial && eSerial === pSerial;
        });
        if (duplicate) throw new DuplicateEquipmentError();
      }

      const { data, error } = await supabase
        .from('client_equipment' as any)
        .insert(insertPayload)
        .select(EQUIPMENT_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Não foi possível cadastrar o equipamento.');
      return data as unknown as ClientEquipment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-equipment'] });
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

// -----------------------------------------------------------------------------
// Transferência de máquina (ação operacional, não é status permanente)
// -----------------------------------------------------------------------------
export interface EquipmentTransferPayload {
  id: string;
  destClientCode: string | null;
  destClientName: string;
  transferDate: string; // ISO
  note?: string | null;
  current: Pick<ClientEquipment, 'client_code' | 'client_name'>;
}

export const useTransferEquipment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: EquipmentTransferPayload) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? null;
      const at = p.transferDate;
      const observation = p.note?.trim() || null;

      // Read existing history to append, preserving validação/prioridade intactas.
      const { data: existing, error: readErr } = await supabase
        .from('client_equipment' as any)
        .select('transfer_history')
        .eq('id', p.id)
        .maybeSingle();
      if (readErr) throw readErr;

      const prev = Array.isArray((existing as any)?.transfer_history)
        ? ((existing as any).transfer_history as EquipmentTransferHistoryEntry[])
        : [];
      const entry: EquipmentTransferHistoryEntry = {
        at,
        by: userId,
        from_client_code: p.current.client_code,
        from_client_name: p.current.client_name,
        to_client_code: p.destClientCode,
        to_client_name: p.destClientName,
        observation,
      };

      const update: Record<string, any> = {
        previous_client_code: p.current.client_code,
        previous_client_name: p.current.client_name,
        client_code: p.destClientCode,
        client_name: p.destClientName,
        transferred_at: at,
        transfer_observation: observation,
        transferred_by: userId,
        transfer_history: [...prev, entry],
        machine_status: 'ativa',
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('client_equipment' as any)
        .update(update)
        .eq('id', p.id)
        .select(EQUIPMENT_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Não foi possível transferir o equipamento.');
      return data as unknown as ClientEquipment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-equipment'] });
    },
  });
};

