import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type {
  MyDayBlock,
  MyDayBucket,
  MyDayDetails,
  MyDaySummary,
  MyDayTeamFilters,
  MyDayTeamSummary,
} from '@/lib/myDay';


const STALE_TIME = 5 * 60 * 1000; // 5 minutos
const GC_TIME = 10 * 60 * 1000;

/** Resumo do Meu Dia: 1 única chamada ao abrir a tela. */
export const useMyDaySummary = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['my-day-summary', user?.id ?? null],
    queryFn: async (): Promise<MyDaySummary> => {
      const { data, error } = await supabase.rpc('get_my_day_summary');
      if (error) throw error;
      return data as unknown as MyDaySummary;
    },
    enabled: !!user?.id,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
    // Ao voltar de outra tela (visita/retorno/treinamento concluído), o resumo
    // é revalidado sem reload da página. Continua sendo 1 única chamada.
    refetchOnMount: 'always',

  });

  return query;
};

/**
 * Detalhes paginados (server-side). Só executa quando `enabled` = true,
 * ou seja, quando o modal "Ver todos" está aberto.
 */
export const useMyDayDetails = (
  block: MyDayBlock | null,
  bucket: MyDayBucket | null,
  page: number,
  pageSize: number,
  enabled: boolean,
) => {
  return useQuery({
    queryKey: ['my-day-details', block, bucket, page, pageSize],
    queryFn: async (): Promise<MyDayDetails> => {
      const { data, error } = await supabase.rpc('get_my_day_details', {
        p_block: block as string,
        p_bucket: bucket as string,
        p_limit: pageSize,
        p_offset: page * pageSize,
      });
      if (error) throw error;
      return data as unknown as MyDayDetails;
    },
    enabled: enabled && !!block && !!bucket,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
  });
};

/**
 * Visão de equipe: UMA única chamada agregada (nunca 1 por colaborador).
 * O escopo (própria filial x global) é sempre validado no banco.
 */
export const useMyDayTeamSummary = (filters: MyDayTeamFilters, enabled: boolean) => {
  return useQuery({
    queryKey: ['my-day-team-summary', filters.filialId, filters.role, filters.userId],
    queryFn: async (): Promise<MyDayTeamSummary> => {
      const { data, error } = await supabase.rpc('get_my_day_team_summary' as never, {
        p_filial_id: filters.filialId,
        p_role: filters.role,
        p_user_id: filters.userId,
      } as never);
      if (error) throw error;
      return data as unknown as MyDayTeamSummary;
    },
    enabled,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
  });
};

/** Meu Dia de um colaborador — somente sob demanda (ao abrir o detalhe). */
export const useMyDayUserSummary = (userId: string | null, enabled: boolean) => {
  return useQuery({
    queryKey: ['my-day-user-summary', userId],
    queryFn: async (): Promise<MyDaySummary> => {
      const { data, error } = await supabase.rpc('get_my_day_user_summary' as never, {
        p_user_id: userId,
      } as never);
      if (error) throw error;
      return data as unknown as MyDaySummary;
    },
    enabled: enabled && !!userId,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
  });
};

/** Drill-down do colaborador — só quando o modal de "Ver todos" está aberto. */
export const useMyDayUserDetails = (
  userId: string | null,
  block: MyDayBlock | null,
  bucket: MyDayBucket | null,
  page: number,
  pageSize: number,
  enabled: boolean,
) => {
  return useQuery({
    queryKey: ['my-day-user-details', userId, block, bucket, page, pageSize],
    queryFn: async (): Promise<MyDayDetails> => {
      const { data, error } = await supabase.rpc('get_my_day_user_details' as never, {
        p_user_id: userId,
        p_block: block as string,
        p_bucket: bucket as string,
        p_limit: pageSize,
        p_offset: page * pageSize,
      } as never);
      if (error) throw error;
      return data as unknown as MyDayDetails;
    },
    enabled: enabled && !!userId && !!block && !!bucket,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnWindowFocus: false,
  });
};
