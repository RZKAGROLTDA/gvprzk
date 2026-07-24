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
  /**
   * true  -> a RPC respondeu (mesmo que sem itens: "tarefa sem fotos")
   * false -> a RPC falhou (função inexistente, erro de rede, sem permissão etc.)
   *          Nesse caso `error` contém a mensagem original e os arrays vêm vazios.
   */
  ok: boolean;
  error?: string;
}

const EMPTY_OK: TaskMedia = {
  photos: [],
  documents: [],
  technicalVisitData: null,
  ok: true,
};

/**
 * Chama a RPC segura `get_secure_task_media` para carregar SOMENTE
 * as colunas pesadas de mídia de uma task.
 *
 * IMPORTANTE: um retorno vazio da RPC ("nenhuma foto") NÃO é erro e vem com
 * `ok: true`. Já falhas reais (função inexistente, timeout, permissão negada
 * antes da execução) retornam `ok: false` com `error` preenchido — assim o
 * caller consegue diferenciar "tarefa sem fotos" de "erro ao buscar fotos".
 */
export async function fetchTaskMedia(taskId: string | null | undefined): Promise<TaskMedia> {
  if (!taskId) return EMPTY_OK;

  const { data, error } = await (supabase.rpc as any)('get_secure_task_media', {
    p_task_id: taskId,
  });

  if (error) {
    console.error('[fetchTaskMedia] RPC error:', error);
    return {
      photos: [],
      documents: [],
      technicalVisitData: null,
      ok: false,
      error: error.message || 'Erro ao carregar mídia da tarefa',
    };
  }

  const row: any = Array.isArray(data) ? data[0] : data;
  if (!row) return EMPTY_OK;

  return {
    photos: Array.isArray(row.photos) ? row.photos.filter(Boolean) : [],
    documents: Array.isArray(row.documents) ? row.documents.filter(Boolean) : [],
    technicalVisitData: row.technical_visit_data ?? null,
    ok: true,
  };
}

export const taskMediaQueryKey = (taskId: string) => ['task-media', taskId] as const;
