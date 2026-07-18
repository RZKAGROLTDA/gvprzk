// ============================================================================
// FONTE ÚNICA DE HIDRATAÇÃO DE TASK PARA RELATÓRIOS/PDF
// ----------------------------------------------------------------------------
// Nenhum botão de exportação de PDF pode gerar relatório a partir de uma
// `Task` vinda de listagem, card, funil ou estado parcial. Toda geração
// obrigatoriamente passa por `fetchTaskForReport(taskId)` (ou o dispatcher
// `generateReportPDF` chamado com uma string de id, que internamente executa
// esta função).
//
// Esta função:
//  1) chama `get_secure_task_by_id` (dados principais respeitando RLS),
//  2) chama `get_secure_task_media` via `fetchTaskMedia` (fotos, documentos,
//     technical_visit_data — camada única de mídia pesada),
//  3) busca `checklist_machine`, `products` (com response_status/notes/photos)
//     e `reminders`,
//  4) faz o merge em um único ponto e aplica o `mapSupabaseTaskToTask`,
//  5) retorna a `Task` completa pronta para o gerador de relatório.
//
// Se o registro histórico realmente possui menos itens ou não possui máquina,
// o retorno reflete o dado como está — nenhuma inferência é feita aqui. É o
// `buildWorkshopChecklistReport` que classifica legado x persistence_error.
// ============================================================================

import { supabase } from '@/integrations/supabase/client';
import { fetchTaskMedia } from '@/lib/taskMedia';
import { mapSupabaseTaskToTask } from '@/lib/taskMapper';
import type { Task } from '@/types/task';

export async function fetchTaskForReport(taskId: string): Promise<Task | null> {
  if (!taskId) return null;

  const [taskResult, extraResult, productsResult, remindersResult, media] = await Promise.all([
    supabase.rpc('get_secure_task_by_id', { p_task_id: taskId }),
    supabase.from('tasks').select('checklist_machine').eq('id', taskId).maybeSingle(),
    supabase
      .from('products')
      .select('id, task_id, name, category, selected, quantity, price, observations, photos, response_status, response_notes')
      .eq('task_id', taskId),
    supabase
      .from('reminders')
      .select('id, task_id, title, description, date, time, completed')
      .eq('task_id', taskId),
    fetchTaskMedia(taskId),
  ]);

  if (taskResult.error) throw taskResult.error;
  const taskRow = taskResult.data?.[0] ?? null;
  if (!taskRow) return null;

  const merged = {
    ...taskRow,
    checklist_machine: extraResult.data?.checklist_machine ?? null,
    photos: media.photos,
    documents: media.documents,
    technical_visit_data: media.technicalVisitData,
    products: productsResult.data || [],
    reminders: remindersResult.data || [],
  };

  return mapSupabaseTaskToTask(merged);
}
