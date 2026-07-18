import { Task } from '@/types/task';

/**
 * DISPATCHER ÚNICO DE GERAÇÃO DE PDF DE TAREFAS
 * ---------------------------------------------
 * Fonte única de verdade para decidir qual gerador de PDF utilizar em função
 * do `taskType`. Nenhum componente da UI deve conter `if (task.taskType === 'checklist')`
 * ou importar diretamente `generateWorkshopChecklistPDF` — todos devem chamar
 * apenas `generateReportPDF`.
 *
 * Regras de roteamento (uma única lista):
 *   - taskType === 'checklist' → generateWorkshopChecklistPDF (relatório técnico)
 *   - qualquer outro           → `fallback` fornecido pelo caller (relatório
 *                                comercial/genérico daquela tela). Se nenhum
 *                                fallback for passado, cai no gerador geral de
 *                                tarefas em TaskPDFGenerator.
 *
 * Adicionar um novo tipo de PDF significa adicionar UMA linha aqui e nada mais.
 */

export interface GenerateReportPDFOptions {
  filiais?: any[];
  /**
   * Gerador a ser executado quando o dispatcher não tem uma rota especializada
   * para o `taskType`. Permite que telas mantenham layouts próprios (ex.: PDF
   * comercial do funil) sem espalhar `if` por toda a base.
   */
  fallback?: () => Promise<void> | void;
  /** Compat: parâmetros usados pelo gerador geral existente. */
  calculateTotalValue?: (task: any) => number;
  getTaskTypeLabel?: (type: string) => string;
}

export async function generateReportPDF(
  task: Task,
  opts: GenerateReportPDFOptions = {}
): Promise<void> {
  if (!task) return;

  // Rota 1: Checklist da Oficina — sempre o gerador técnico unificado.
  if (task.taskType === 'checklist') {
    const { generateWorkshopChecklistPDF } = await import('./workshopChecklistPdf');
    await generateWorkshopChecklistPDF(task, opts.filiais ?? []);
    return;
  }

  // Rota 2: qualquer outro tipo — usa o fallback da tela, se houver.
  if (opts.fallback) {
    await opts.fallback();
    return;
  }

  // Rota 3: sem fallback → gerador geral de tarefa (visitas, ligações, etc.).
  const { generateTaskPDF } = await import('@/components/TaskPDFGenerator');
  await generateTaskPDF(
    task,
    opts.calculateTotalValue,
    opts.getTaskTypeLabel,
    opts.filiais ?? []
  );
}
