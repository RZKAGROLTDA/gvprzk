import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type FollowupRow = {
  id: string;
  task_id: string | null;
  client_name: string;
  client_code: string | null;
  activity_type: 'visita' | 'ligacao' | 'checklist' | 'reuniao' | 'outro';
  activity_date: string;
  next_return_date: string | null;
  return_notes: string | null;
  followup_status: 'pendente' | 'concluido' | 'cancelado' | 'reagendado';
  priority: 'baixa' | 'media' | 'alta';
  client_temperature: 'frio' | 'morno' | 'quente' | null;
  responsible_user_id: string;
  filial_id: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/** Identidade única do cliente: client_code ou client_name (lowercase). */
export const getClientKey = (f: Pick<FollowupRow, 'client_code' | 'client_name'>) => {
  const code = (f.client_code ?? '').trim();
  if (code) return `code:${code.toLowerCase()}`;
  return `name:${(f.client_name ?? '').trim().toLowerCase()}`;
};

const FOLLOWUP_COLUMNS =
  'id, task_id, client_name, client_code, activity_type, activity_date, next_return_date, return_notes, followup_status, priority, client_temperature, responsible_user_id, filial_id, notes, created_by, created_at, updated_at';

/**
 * Paginação interna para evitar o teto de 1000 linhas do PostgREST
 * sem impor um limite artificial (ex.: limit(2000)).
 */
const PAGE_SIZE = 1000;
const HARD_CAP = 50_000; // proteção contra loop em caso de erro

async function fetchAllFollowups(filterProspectsOnly: boolean): Promise<FollowupRow[]> {
  const out: FollowupRow[] = [];
  let from = 0;

  while (from < HARD_CAP) {
    const to = from + PAGE_SIZE - 1;
    let query = filterProspectsOnly
      ? supabase
          .from('task_followups')
          .select(`${FOLLOWUP_COLUMNS}, tasks!inner(sales_type)`)
          .eq('tasks.sales_type', 'prospect')
      : supabase.from('task_followups').select(FOLLOWUP_COLUMNS);

    const { data, error } = await query
      .order('activity_date', { ascending: false })
      .range(from, to);

    if (error) throw error;
    const rows = (data ?? []) as any[];
    for (const row of rows) {
      const { tasks: _t, ...rest } = row;
      out.push(rest as FollowupRow);
    }
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return out;
}

/**
 * Fonte única para Agenda Semanal e Gerencial.
 * Lê task_followups direto, SEM filtro por sales_type, SEM JOIN.
 * RLS já restringe o que cada usuário enxerga.
 */
export const useFollowups = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['task_followups', 'all', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: () => fetchAllFollowups(false),
  });
};

/**
 * Variante usada pela tela Retornos: apenas follow-ups de tasks do tipo prospect.
 */
export const useFollowupsProspectsOnly = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['task_followups', 'prospects', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: () => fetchAllFollowups(true),
  });
};
