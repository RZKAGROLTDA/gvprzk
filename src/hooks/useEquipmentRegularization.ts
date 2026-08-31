import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import type { RegBatchDetail } from '@/lib/equipmentRegularizationPdf';

export type { RegBatchDetail };

export type RegSituation = 'vendida' | 'inativa' | 'sucata';

export interface RegFilters {
  filialId: string | null;
  withoutFilial: boolean;
  client: string | null;
  situation: RegSituation | null;
  chassis: string | null;
}

export interface RegKpis {
  total_pending: number;
  total_clients: number;
  total_regularized: number;
  by_situation: { vendida: number; inativa: number; sucata: number };
}

export interface RegClientGroup {
  client_key: string;
  client_code: string | null;
  client_name: string | null;
  filial_id: string | null;
  filial_nome: string | null;
  total_pending: number;
  last_validation_at: string | null;
  by_situation: { vendida: number; inativa: number; sucata: number };
}

export interface RegMachine {
  equipment_id: string;
  client_code: string | null;
  client_name: string | null;
  filial_id: string | null;
  model: string | null;
  serial_chassis: string | null;
  year: number | null;
  machine_situation: RegSituation;
  last_validation_at: string | null;
  validation_source: string | null;
}

const baseArgs = (f: RegFilters) => ({
  p_filial_id: f.filialId,
  p_without_filial: f.withoutFilial,
  p_client: f.client,
  p_situation: f.situation,
  p_chassis: f.chassis,
});

const CACHE = { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } as const;

export const useRegularizationKpis = (filters: RegFilters) =>
  useQuery({
    queryKey: ['reg-kpis', filters],
    queryFn: async (): Promise<RegKpis> => {
      const { data, error } = await supabase.rpc(
        'equipment_regularization_pending_kpis' as never,
        baseArgs(filters) as never,
      );
      if (error) throw error;
      return data as unknown as RegKpis;
    },
    ...CACHE,
  });

export const useRegularizationClients = (
  filters: RegFilters,
  page: number,
  pageSize: number,
) =>
  useQuery({
    queryKey: ['reg-clients', filters, page, pageSize],
    queryFn: async (): Promise<{ total_groups: number; clients: RegClientGroup[] }> => {
      const { data, error } = await supabase.rpc(
        'equipment_regularization_pending_clients' as never,
        { ...baseArgs(filters), p_page: page, p_page_size: pageSize } as never,
      );
      if (error) throw error;
      const d = (data ?? {}) as { total_groups?: number; clients?: RegClientGroup[] };
      return { total_groups: Number(d.total_groups ?? 0), clients: d.clients ?? [] };
    },
    ...CACHE,
  });

export const useRegularizationMachines = (
  clientKey: string | null,
  filters: RegFilters,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ['reg-machines', clientKey, filters],
    enabled: enabled && !!clientKey,
    queryFn: async (): Promise<RegMachine[]> => {
      const { data, error } = await supabase.rpc(
        'equipment_regularization_pending_machines' as never,
        { p_client_key: clientKey, ...baseArgs(filters) } as never,
      );
      if (error) throw error;
      return (data ?? []) as unknown as RegMachine[];
    },
    ...CACHE,
  });

/**
 * Criação do lote — NÃO regulariza nada.
 * O lote nasce em "aguardando_envio", grava apenas o snapshot das máquinas e
 * não altera client_equipment. As máquinas continuam pendentes.
 */
export interface CreateBatchInput {
  equipmentIds: string[];
  headerCity?: string | null;
  headerState?: string | null;
  documentDate?: string | null;
  signerName?: string | null;
  signerRole?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  pmpNumber?: string | null;
  notes?: string | null;
}

export const useCreateRegularizationBatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBatchInput) => {
      const { data, error } = await supabase.rpc(
        'equipment_regularization_create_batch' as never,
        {
          p_equipment_ids: input.equipmentIds,
          p_header_city: input.headerCity ?? null,
          p_header_state: input.headerState ?? null,
          p_document_date: input.documentDate ?? null,
          p_signer_name: input.signerName ?? null,
          p_signer_role: input.signerRole ?? null,
          p_recipient_name: input.recipientName ?? null,
          p_recipient_email: input.recipientEmail ?? null,
          p_pmp_number: input.pmpNumber ?? null,
          p_notes: input.notes ?? null,
        } as never,
      );
      if (error) throw error;
      return data as unknown as { batch_id: string; total: number; status: string };
    },
    onSuccess: (d) => {
      toast({
        title: 'Lote criado',
        description: `${d.total} máquina(s) no lote. Status: aguardando envio — nada foi alterado no Parque.`,
      });
      qc.invalidateQueries({ queryKey: ['reg-batch'] });
    },
    onError: (e) => {
      toast({
        title: 'Erro ao criar o lote',
        description: (e as Error)?.message,
        variant: 'destructive',
      });
    },
  });
};

/** Detalhe do lote (snapshot dos itens) — base única do PDF. */
export const useRegularizationBatch = (batchId: string | null) =>
  useQuery({
    queryKey: ['reg-batch', batchId],
    enabled: !!batchId,
    queryFn: async (): Promise<RegBatchDetail> => {
      const { data, error } = await supabase.rpc(
        'equipment_regularization_get_batch' as never,
        { p_batch_id: batchId } as never,
      );
      if (error) throw error;
      return data as unknown as RegBatchDetail;
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

/** Marca que o PDF foi gerado — auditoria apenas, não regulariza. */
export const useMarkPdfGenerated = () =>
  useMutation({
    mutationFn: async (batchId: string) => {
      const { error } = await supabase.rpc(
        'equipment_regularization_mark_pdf_generated' as never,
        { p_batch_id: batchId } as never,
      );
      if (error) throw error;
    },
  });

export const useFiliaisList = () =>
  useQuery({
    queryKey: ['reg-filiais'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('filiais')
        .select('id, nome')
        .order('nome');
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
