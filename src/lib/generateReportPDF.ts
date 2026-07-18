import { Task } from '@/types/task';
import { fetchTaskForReport } from '@/lib/fetchTaskForReport';

/**
 * DISPATCHER ÚNICO DE GERAÇÃO DE PDF DE TAREFAS
 * ---------------------------------------------
 * Fonte única de verdade para decidir qual gerador de PDF utilizar em função
 * do `taskType`. Nenhum componente da UI deve conter `if (task.taskType === 'checklist')`
 * ou importar diretamente `generateWorkshopChecklistPDF` — todos devem chamar
 * apenas `generateReportPDF`.
 *
 * INTEGRIDADE DE DADOS:
 *   O relatório NUNCA pode depender de uma `Task` parcial vinda de listagem/card/funil.
 *   Formas aceitas de invocação:
 *     1) `generateReportPDF(taskId)`     — o dispatcher hidrata via `fetchTaskForReport`.
 *     2) `generateReportPDF(task, ...)`  — a `task` DEVE já ter sido carregada por
 *        `fetchTaskForReport(id)` ou por `useTaskDetails(id)` (que reutiliza a mesma
 *        RPC + `fetchTaskMedia`). O dispatcher, por segurança, sempre re-hidrata
 *        via `fetchTaskForReport(task.id)` para garantir presença de
 *        `checklistMachine`, respostas do checklist, fotos por item, mídia, etc.
 *
 * Regras de roteamento (uma única lista):
 *   - taskType === 'checklist' → generateWorkshopChecklistPDF (relatório técnico)
 *   - qualquer outro           → `fallback` fornecido pelo caller (relatório
 *                                comercial/genérico daquela tela). Se nenhum
 *                                fallback for passado, cai no gerador geral de
 *                                tarefas em TaskPDFGenerator.
 */

export interface GenerateReportPDFOptions {
  filiais?: any[];
  /**
   * Gerador a ser executado quando o dispatcher não tem uma rota especializada
   * para o `taskType`. Recebe a Task JÁ hidratada por `fetchTaskForReport`.
   */
  fallback?: (fullTask: Task) => Promise<void> | void;
  /** Compat: parâmetros usados pelo gerador geral existente. */
  calculateTotalValue?: (task: any) => number;
  getTaskTypeLabel?: (type: string) => string;
}

export async function generateReportPDF(
  taskOrId: Task | string | null | undefined,
  opts: GenerateReportPDFOptions = {}
): Promise<void> {
  if (!taskOrId) return;

  // Hidratação obrigatória — o PDF nunca depende do estado atual do componente.
  const taskId = typeof taskOrId === 'string' ? taskOrId : taskOrId.id;
  if (!taskId) return;

  let fullTask: Task | null = null;
  try {
    fullTask = await fetchTaskForReport(taskId);
  } catch (e) {
    console.warn('[generateReportPDF] fetchTaskForReport falhou, usando fallback do caller:', e);
  }

  // Se a hidratação falhar (RLS/erro), e o caller passou uma Task, usa como
  // último recurso — mas nunca invertemos a ordem: hidratado tem prioridade.
  if (!fullTask && typeof taskOrId !== 'string') {
    fullTask = taskOrId;
  }
  if (!fullTask) return;

  // Rota 1: Checklist da Oficina — sempre o gerador técnico unificado.
  if (fullTask.taskType === 'checklist') {
    const { generateWorkshopChecklistPDF } = await import('./workshopChecklistPdf');
    await generateWorkshopChecklistPDF(fullTask, opts.filiais ?? []);
    return;
  }

  // Rota 2: qualquer outro tipo — usa o fallback da tela, se houver.
  if (opts.fallback) {
    await opts.fallback(fullTask);
    return;
  }

  // Rota 3: sem fallback → gerador geral de tarefa (visitas, ligações, etc.).
  const { generateTaskPDF } = await import('@/components/TaskPDFGenerator');
  await generateTaskPDF(
    fullTask,
    opts.calculateTotalValue,
    opts.getTaskTypeLabel,
    opts.filiais ?? []
  );
}
