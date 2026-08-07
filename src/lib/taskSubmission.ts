import { supabase } from '@/integrations/supabase/client';

/**
 * Idempotência de criação de tarefas.
 *
 * O `submission_id` é gerado no frontend quando o formulário é iniciado e
 * permanece o mesmo durante toda a vida do formulário. Ele é o ÚNICO
 * mecanismo de prevenção de duplicidade — não usamos mais comparações por
 * cliente, chassi ou janela de tempo.
 */

export const newSubmissionId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

/** Código Postgres de violação de índice único. */
const UNIQUE_VIOLATION = '23505';

const isUniqueViolation = (error: any) =>
  error?.code === UNIQUE_VIOLATION ||
  /duplicate key|submission_id/i.test(error?.message || '');

/**
 * Busca uma tarefa já criada com este submission_id.
 * Retorna null quando não existe (ou quando não há submission_id).
 */
export async function findTaskBySubmissionId(submissionId?: string | null) {
  if (!submissionId) return null;

  const { data, error } = await supabase
    .from('tasks')
    // Nunca selecionar colunas de mídia (photos/documents/technical_visit_data).
    .select('id, name, client, clientcode, filial, task_type, status, start_date, created_at, created_by, submission_id')
    .eq('submission_id', submissionId)
    .maybeSingle();

  if (error) {
    console.warn('⚠️ Falha ao consultar submission_id existente:', error.message);
    return null;
  }
  return data ?? null;
}

/**
 * Insere a tarefa de forma idempotente.
 *
 * 1. Se já existir tarefa com o mesmo submission_id, retorna a existente.
 * 2. Se o insert violar o índice único (corrida/retry), retorna a existente.
 * 3. Tarefas sem submission_id (legado) seguem o insert normal.
 *
 * `reused` indica que a tarefa já existia — o pipeline deve apenas continuar.
 */
export async function insertTaskIdempotent(
  payload: Record<string, any>,
  submissionId?: string | null,
): Promise<{ task: any; reused: boolean }> {
  // Impede reload automático de atualização durante o salvamento
  beginCriticalTask();
  try {
    if (submissionId) {
      const existing = await findTaskBySubmissionId(submissionId);
      if (existing) {
        console.log('♻️ Tarefa já existente para submission_id, continuando pipeline:', existing.id);
        return { task: existing, reused: true };
      }
    }

    const { data, error } = await (supabase.from('tasks') as any)
      .insert({ ...payload, ...(submissionId ? { submission_id: submissionId } : {}) })
      .select()
      .single();

    if (error) {
      if (submissionId && isUniqueViolation(error)) {
        const existing = await findTaskBySubmissionId(submissionId);
        if (existing) {
          console.log('♻️ Duplicate key tratado — reutilizando tarefa:', existing.id);
          return { task: existing, reused: true };
        }
      }
      throw error;
    }

    return { task: data, reused: false };
  } finally {
    endCriticalTask();
  }
}
