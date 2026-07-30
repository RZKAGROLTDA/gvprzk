import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Consulta LEVE e SOB DEMANDA das fotos dos itens/produtos de uma tarefa.
 *
 * Por quê: `useTaskDetails` é chamado com `includeProductPhotos: false` na
 * visualização (coluna TOAST pesada fora do caminho crítico do modal).
 * Este hook re-hidrata SOMENTE `products.id + products.photos` quando a
 * galeria entra na viewport (`enabled`), com cache por task_id.
 */
export const productPhotosQueryKey = (taskId: string) => ['product-photos', taskId] as const;

export function useProductPhotos(
  taskId: string | null | undefined,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery<Record<string, string[]>>({
    queryKey: taskId ? productPhotosQueryKey(taskId) : ['product-photos', 'none'],
    queryFn: async () => {
      if (!taskId) return {};
      const { data, error } = await supabase
        .from('products')
        .select('id, photos')
        .eq('task_id', taskId);
      if (error) throw error;
      const map: Record<string, string[]> = {};
      (data || []).forEach((row: any) => {
        map[row.id] = Array.isArray(row.photos) ? row.photos.filter(Boolean) : [];
      });
      return map;
    },
    enabled: !!taskId && enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
