// ============================================================================
// FONTE ÚNICA DE MÍDIA PESADA (photos, documents, technical_visit_data)
// ----------------------------------------------------------------------------
// Toda leitura das colunas pesadas da tabela `tasks` deve passar por esta
// função. Nenhum SELECT direto de `tasks.photos`, `tasks.documents` ou
// `tasks.technical_visit_data` é permitido em qualquer outro ponto do código.
//
// Regra registrada em mem://architecture/task-media-access.
// ============================================================================

import { supabase } from '@/integrations/supabase/client';

export interface TaskMedia {
  photos: string[];
  documents: string[];
  technicalVisitData: any | null;
}

const EMPTY_MEDIA: TaskMedia = {
  photos: [],
  documents: [],
  technicalVisitData: null,
};

/**
 * Chama a RPC segura `get_secure_task_media` para carregar SOMENTE
 * as colunas pesadas de mídia de uma task. Retorno vazio é comportamento
 * esperado (sem mídia ou sem acesso) e NÃO deve ser tratado como erro.
 */
export async function fetchTaskMedia(taskId: string | null | undefined): Promise<TaskMedia> {
  if (!taskId) return EMPTY_MEDIA;

  const { data, error } = await (supabase.rpc as any)('get_secure_task_media', {
    p_task_id: taskId,
  });

  if (error) {
    console.warn('[fetchTaskMedia] RPC error:', error.message);
    return EMPTY_MEDIA;
  }

  const row: any = Array.isArray(data) ? data[0] : data;
  if (!row) return EMPTY_MEDIA;

  return {
    photos: Array.isArray(row.photos) ? row.photos.filter(Boolean) : [],
    documents: Array.isArray(row.documents) ? row.documents.filter(Boolean) : [],
    technicalVisitData: row.technical_visit_data ?? null,
  };
}

export const taskMediaQueryKey = (taskId: string) => ['task-media', taskId] as const;
