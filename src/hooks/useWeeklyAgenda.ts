import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type WeeklyAgendaDay = {
  day: string; // YYYY-MM-DD
  total_activities: number;
  visitas: number;
  ligacoes: number;
  checklists: number;
  unique_clients: number;
};

const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const useWeeklyAgenda = (params: {
  startDate: Date;
  endDate: Date;
  responsibleUserId?: string | null;
  filialId?: string | null;
}) => {
  const { user } = useAuth();
  const startStr = toISODate(params.startDate);
  const endStr = toISODate(params.endDate);
  const responsible = params.responsibleUserId || null;
  const filial = params.filialId || null;

  return useQuery({
    queryKey: ['weekly_followups_agenda', user?.id, startStr, endStr, responsible, filial],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<WeeklyAgendaDay[]> => {
      const { data, error } = await supabase.rpc('get_weekly_followups_agenda', {
        p_start_date: startStr,
        p_end_date: endStr,
        p_responsible_user_id: responsible,
        p_filial_id: filial,
      });
      if (error) throw error;
      return (data ?? []).map((r: {
        day: string;
        total_activities: number | string;
        visitas: number | string;
        ligacoes: number | string;
        checklists: number | string;
        unique_clients: number | string;
      }) => ({
        day: r.day,
        total_activities: Number(r.total_activities) || 0,
        visitas: Number(r.visitas) || 0,
        ligacoes: Number(r.ligacoes) || 0,
        checklists: Number(r.checklists) || 0,
        unique_clients: Number(r.unique_clients) || 0,
      }));
    },
  });
};
