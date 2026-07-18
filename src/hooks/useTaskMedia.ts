import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTaskMedia, taskMediaQueryKey, TaskMedia } from '@/lib/taskMedia';

interface UseTaskMediaOptions {
  enabled?: boolean;
}

/**
 * Hook único de leitura de mídia pesada de uma task.
 * - Cache por taskId (compartilhado entre visualização e PDF)
 * - Dedupe automático (React Query)
 * - Só executa quando `enabled` (não busca em listagens)
 */
export function useTaskMedia(taskId: string | null | undefined, { enabled = true }: UseTaskMediaOptions = {}) {
  return useQuery<TaskMedia>({
    queryKey: taskId ? taskMediaQueryKey(taskId) : ['task-media', 'none'],
    queryFn: () => fetchTaskMedia(taskId),
    enabled: !!taskId && enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

/**
 * Busca mídia usando o cache do React Query (evita chamada duplicada
 * quando a visualização já carregou e o PDF é gerado em seguida).
 */
export function useEnsureTaskMedia() {
  const queryClient = useQueryClient();
  return async (taskId: string): Promise<TaskMedia> => {
    return queryClient.fetchQuery({
      queryKey: taskMediaQueryKey(taskId),
      queryFn: () => fetchTaskMedia(taskId),
      staleTime: 5 * 60 * 1000,
    });
  };
}
