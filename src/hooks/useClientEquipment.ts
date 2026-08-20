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
  pukStatus?: string | null;
  filialId?: string | null;
  /** Lista de user_ids de validadores a filtrar (aplica .in em validated_by). */
  validatedByIn?: string[] | null;
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
// (removido) useEquipmentSearch — era o único caminho SELECT direto com
// count:'exact' sobre client_equipment e estava sem consumidores. A tela
// /equipamentos usa exclusivamente `useEquipmentPark` (RPC paginada).
// -----------------------------------------------------------------------------



// -----------------------------------------------------------------------------
// Parque de Máquinas (tela /equipamentos) — via RPC server-side
// -----------------------------------------------------------------------------
// get_equipment_park_paginated / get_equipment_park_kpis são SECURITY DEFINER,
// autorizadas por can_view_equipment_park() (approved + active) e devolvem o
// universo completo do parque com total_count agregado no servidor.
// A RPC paginada cobre TODOS os filtros da tela (busca livre, código e nome do
// cliente, tipo, status, PUK, prioridade, filial e validadores), portanto não
// existe mais fallback para SELECT direto + count exact.
// -----------------------------------------------------------------------------

export interface EquipmentParkRow extends Omit<ClientEquipment, 'import_batch_id' | 'transfer_history'> {
  filial_nome: string | null;
  import_batch_id: string | null;
  transfer_history: EquipmentTransferHistoryEntry[] | null;
}

export interface EquipmentParkResult {
  rows: ClientEquipment[];
  totalCount: number | null;
  source: 'rpc' | 'direct';
}

const buildParkParams = (filters: EquipmentFilters) => {
  const validatedByIn = (filters.validatedByIn ?? null)?.filter(Boolean) ?? null;
  return {
    search: norm(filters.search),
    clientCode: norm(filters.clientCode),
    clientName: norm(filters.clientName),
    machineStatus: norm(filters.machineStatus),
    machineType: norm(filters.machineType),
    pukStatus: norm(filters.pukStatus),
    filialId: norm(filters.filialId),
    validationPriority: filters.validationPriority ?? null,
    validatedByIn: validatedByIn && validatedByIn.length > 0 ? validatedByIn : null,
  };
};

export const useEquipmentPark = (filters: EquipmentFilters, page = 0, pageSize = 50) => {
  const p = buildParkParams(filters);
  const validatedByKey = p.validatedByIn ? [...p.validatedByIn].sort().join(',') : null;

  return useQuery<EquipmentParkResult>({
    queryKey: [
      'client-equipment',
      'park-list',
      {
        search: p.search,
        clientCode: p.clientCode,
        clientName: p.clientName,
        machineStatus: p.machineStatus,
        machineType: p.machineType,
        pukStatus: p.pukStatus,
        filialId: p.filialId,
        validationPriority: p.validationPriority,
        validatedByKey,
        page,
        pageSize,
      },
    ],
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<EquipmentParkResult> => {
      const { data, error } = await (supabase as any).rpc('get_equipment_park_paginated', {
        p_search: p.search,
        p_filial_id: p.filialId,
        p_machine_status: p.machineStatus,
        p_puk_status: p.pukStatus,
        p_validation_priority: p.validationPriority,
        p_machine_type: p.machineType,
        p_validated_by: p.validatedByIn,
        p_client_code: p.clientCode,
        p_client_name: p.clientName,
        p_limit: pageSize,
        p_offset: page * pageSize,
      });
      if (error) throw error;
      const raw = ((data as unknown) as (EquipmentParkRow & { total_count: number })[]) ?? [];
      return {
        rows: raw.map(({ total_count, filial_nome, ...rest }) => ({
          ...(rest as unknown as ClientEquipment),
          import_batch_id: rest.import_batch_id ?? null,
          transfer_history: rest.transfer_history ?? null,
        })),
        totalCount: raw.length > 0 ? Number(raw[0].total_count) : 0,
        source: 'rpc',
      };
    },
  });
};



export interface EquipmentParkKpis {
  total: number;
  total_validadas: number;
  prioridades: number;
  nao_prioridades: number;
  clientes: number;
  pendentes: number;
  validacoes_7d: number;
}

export const useEquipmentParkKpis = (filters?: {
  search?: string | null;
  filialId?: string | null;
  machineStatus?: string | null;
  pukStatus?: string | null;
  validationPriority?: boolean | null;
}) => {
  const search = norm(filters?.search);
  const filialId = norm(filters?.filialId);
  const machineStatus = norm(filters?.machineStatus);
  const pukStatus = norm(filters?.pukStatus);
  const validationPriority = filters?.validationPriority ?? null;

  return useQuery<EquipmentParkKpis | null>({
    queryKey: [
      'client-equipment',
      'park-kpis',
      { search, filialId, machineStatus, pukStatus, validationPriority },
    ],
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async (): Promise<EquipmentParkKpis | null> => {
      const { data, error } = await (supabase as any).rpc('get_equipment_park_kpis', {
        p_search: search,
        p_filial_id: filialId,
        p_machine_status: machineStatus,
        p_puk_status: pukStatus,
        p_validation_priority: validationPriority,
      });
      if (error) throw error;
      const row = (((data as unknown) as any[]) ?? [])[0];
      if (!row) return null;
      return {
        total: Number(row.total ?? 0),
        total_validadas: Number(row.total_validadas ?? 0),
        prioridades: Number(row.prioridades ?? 0),
        nao_prioridades: Number(row.nao_prioridades ?? 0),
        clientes: Number(row.clientes ?? 0),
        pendentes: Number(row.pendentes ?? 0),
        validacoes_7d: Number(row.validacoes_7d ?? 0),
      };
    },
  });
};

// -----------------------------------------------------------------------------
// Resumo de validações por filial (tabela "Execução das Validações")
// -----------------------------------------------------------------------------
export interface EquipmentValidationSummaryRow {
  filial_nome: string;
  validated_count: number;
  priority_count: number;
  non_priority_count: number;
  client_count: number;
}

export interface EquipmentValidationSummary {
  total_validated: number;
  priority_validated: number;
  non_priority_validated: number;
  distinct_validated_clients: number;
  by_filial: EquipmentValidationSummaryRow[];
}

export const useEquipmentValidationSummary = () => {
  return useQuery<EquipmentValidationSummary | null>({
    queryKey: ['client-equipment', 'validation-summary'],
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async (): Promise<EquipmentValidationSummary | null> => {
      const { data, error } = await (supabase as any).rpc('get_equipment_validation_summary');
      if (error) throw error;
      const row = (((data as unknown) as any[]) ?? [])[0];
      if (!row) return null;
      const byFilialRaw = Array.isArray(row.by_filial) ? row.by_filial : [];
      const by_filial: EquipmentValidationSummaryRow[] = byFilialRaw.map((f: any) => ({
        filial_nome: String(f.filial_nome ?? '—'),
        validated_count: Number(f.validated_count ?? 0),
        priority_count: Number(f.priority_count ?? 0),
        non_priority_count: Number(f.non_priority_count ?? 0),
        client_count: Number(f.client_count ?? 0),
      }));
      return {
        total_validated: Number(row.total_validated ?? 0),
        priority_validated: Number(row.priority_validated ?? 0),
        non_priority_validated: Number(row.non_priority_validated ?? 0),
        distinct_validated_clients: Number(row.distinct_validated_clients ?? 0),
        by_filial,
      };
    },
  });
};

// -----------------------------------------------------------------------------
// Diretório de validadores (para filtros e export do Parque de Máquinas)
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

/**
 * Verifica no servidor se o usuário atual pode EDITAR uma máquina específica.
 * A visualização do Parque é ampla (RPC SECURITY DEFINER), mas o UPDATE segue
 * a RLS de client_equipment. Esta RPC espelha exatamente o critério da policy,
 * sem ampliar permissão nenhuma.
 */
export const useCanEditEquipment = (equipmentId?: string | null) => {
  return useQuery({
    queryKey: ['client-equipment', 'can-edit', equipmentId ?? null],
    enabled: !!equipmentId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await (supabase as any).rpc('can_edit_client_equipment', {
        p_equipment_id: equipmentId,
      });
      if (error) throw error;
      return data === true;
    },
  });
};

export type EquipmentErrorKind =
  | 'forbidden'
  | 'session'
  | 'timeout'
  | 'conflict'
  | 'validation'
  | 'unexpected';

export class EquipmentMutationError extends Error {
  kind: EquipmentErrorKind;
  constructor(kind: EquipmentErrorKind, message: string) {
    super(message);
    this.name = 'EquipmentMutationError';
    this.kind = kind;
  }
}

const EQUIPMENT_ERROR_TITLES: Record<EquipmentErrorKind, string> = {
  forbidden: 'Sem permissão para editar esta máquina',
  session: 'Sessão expirada',
  timeout: 'Tempo de resposta excedido',
  conflict: 'Conflito de dados',
  validation: 'Dados inválidos',
  unexpected: 'Erro inesperado',
};

export const equipmentErrorTitle = (err: unknown) =>
  EQUIPMENT_ERROR_TITLES[
    (err as EquipmentMutationError)?.kind ?? 'unexpected'
  ] ?? EQUIPMENT_ERROR_TITLES.unexpected;

/** Traduz erros do PostgREST/Postgres em causas específicas e acionáveis. */
export const classifyEquipmentError = (err: any): EquipmentMutationError => {
  if (err instanceof EquipmentMutationError) return err;
  const code = String(err?.code ?? '');
  const status = Number(err?.status ?? 0);
  const msg = String(err?.message ?? '');

  if (code === '42501' || status === 403) {
    return new EquipmentMutationError(
      'forbidden',
      'Esta máquina pertence a outra filial e é somente leitura para o seu perfil.',
    );
  }
  if (code === 'PGRST301' || status === 401 || /jwt|token/i.test(msg)) {
    return new EquipmentMutationError(
      'session',
      'Sua sessão expirou. Faça login novamente para salvar as alterações.',
    );
  }
  if (code === '57014' || /timeout|statement canceled/i.test(msg)) {
    return new EquipmentMutationError(
      'timeout',
      'O banco levou muito tempo para responder. Tente novamente em alguns segundos.',
    );
  }
  if (code === '23505' || code === '23P01' || status === 409) {
    return new EquipmentMutationError(
      'conflict',
      'Já existe um registro com estes dados (ex.: chassi/série duplicado).',
    );
  }
  if (code.startsWith('23') || code === '22P02' || code === '22003') {
    return new EquipmentMutationError(
      'validation',
      msg || 'Verifique os campos preenchidos (ano, horas, status).',
    );
  }
  return new EquipmentMutationError(
    'unexpected',
    msg || 'Não foi possível concluir a operação. Tente novamente.',
  );
};

/** Renova a sessão quando o token está expirado/ausente. */
const ensureFreshSession = async () => {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session ?? null;
  }
  const expiresAt = (session.expires_at ?? 0) * 1000;
  if (expiresAt && expiresAt - Date.now() < 60_000) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session ?? session;
  }
  return session;
};

export const useUpdateEquipment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: EquipmentUpdatePayload }) => {
      const session = await ensureFreshSession();
      if (!session) {
        throw new EquipmentMutationError(
          'session',
          'Sua sessão expirou. Faça login novamente para salvar as alterações.',
        );
      }

      const { markValidated, ...rest } = patch;
      const update: Record<string, any> = { ...rest, updated_at: new Date().toISOString() };
      if (markValidated) {
        update.last_validation_at = new Date().toISOString();
        update.validated_by = session.user.id;
      }
      const { data, error } = await supabase
        .from('client_equipment' as any)
        .update(update)
        .eq('id', id)
        .select(EQUIPMENT_COLUMNS)
        .maybeSingle();
      if (error) throw classifyEquipmentError(error);
      if (!data) {
        // 0 linhas: RLS de UPDATE barrou (outra filial) ou o registro sumiu.
        const { data: canEdit } = await (supabase as any).rpc('can_edit_client_equipment', {
          p_equipment_id: id,
        });
        if (canEdit === true) {
          throw new EquipmentMutationError(
            'conflict',
            'O registro foi alterado ou removido por outro usuário. Recarregue a lista e tente novamente.',
          );
        }
        throw new EquipmentMutationError(
          'forbidden',
          'Esta máquina pertence a outra filial e é somente leitura para o seu perfil.',
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
      const session = await ensureFreshSession();
      if (!session) {
        throw new EquipmentMutationError(
          'session',
          'Sua sessão expirou. Faça login novamente para transferir a máquina.',
        );
      }
      const userId = session.user.id;
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
      if (error) throw classifyEquipmentError(error);
      if (!data) {
        const { data: canEdit } = await (supabase as any).rpc('can_edit_client_equipment', {
          p_equipment_id: p.id,
        });
        throw canEdit === true
          ? new EquipmentMutationError(
              'conflict',
              'O registro foi alterado por outro usuário. Recarregue a lista e tente novamente.',
            )
          : new EquipmentMutationError(
              'forbidden',
              'Esta máquina pertence a outra filial e é somente leitura para o seu perfil.',
            );
      }
      return data as unknown as ClientEquipment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-equipment'] });
    },
  });
};

