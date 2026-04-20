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

/** Todos os follow-ups visíveis ao usuário (RLS filtra). */
export const useFollowups = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['task_followups', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<FollowupRow[]> => {
      const { data, error } = await supabase
        .from('task_followups')
        .select('*')
        .order('activity_date', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as FollowupRow[];
    },
  });
};
