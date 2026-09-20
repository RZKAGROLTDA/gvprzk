/**
 * M3 — Filial Ativa nas tarefas offline (opção D1).
 *
 * - Tarefas offline NOVAS trazem `filialId` (UUID da Filial Ativa no momento da criação),
 *   mantendo também o snapshot textual em `filial`.
 * - Tarefas offline LEGADAS (sem `filialId`) têm o nome resolvido SOMENTE em memória,
 *   com normalização `lower(trim(nome))` e exigindo correspondência única.
 * - Sem correspondência única: a tarefa NÃO é descartada nem alterada — permanece
 *   visível ao próprio autor (pendente de sincronização).
 * - Nada é persistido no banco e não há backfill.
 */

const norm = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

export type FilialRef = { id: string; nome: string };

/** Resolve o nome da filial para UUID exigindo correspondência única. */
export const resolveOfflineFilialId = (
  filialName: unknown,
  filiais: FilialRef[],
): string | null => {
  const target = norm(filialName);
  if (!target) return null;

  const matches = filiais.filter((f) => norm(f.nome) === target);
  return matches.length === 1 ? matches[0].id : null;
};

/**
 * Filtra as tarefas offline pela Filial Ativa.
 * `filialId === null` (admin/manager em visão global) mantém todas.
 */
export const filterOfflineTasksByFilial = <T extends Record<string, any>>(
  tasks: T[],
  filialId: string | null,
  filiais: FilialRef[],
): T[] => {
  if (!filialId) return tasks;

  return tasks.filter((task) => {
    const explicit = typeof task.filialId === 'string' ? task.filialId : null;
    if (explicit) return explicit === filialId;

    const resolved = resolveOfflineFilialId(task.filial, filiais);
    // Nome não resolvido ou ambíguo: preservado (pendente de sincronização).
    if (!resolved) return true;

    return resolved === filialId;
  });
};
