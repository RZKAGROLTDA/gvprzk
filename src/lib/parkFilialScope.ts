/**
 * Escopo de filiais dos painéis de Validação de Máquinas (exceção aprovada:
 * só aqui é permitido consolidar várias filiais autorizadas).
 * Seleção é pela filial CADASTRADA da máquina. O servidor revalida tudo.
 */
export interface ParkFilialScope {
  /** null = modo legado (servidor usa a Filial Ativa). */
  filialIds: string[] | null;
  includeSemFilial: boolean;
}

export const LEGACY_SCOPE: ParkFilialScope = { filialIds: null, includeSemFilial: false };

/** Seleção inicial: Filial Ativa marcada; global sem Filial Ativa = todas + Sem filial. */
export function defaultParkSelection(
  isGlobal: boolean,
  activeFilialId: string | null,
  availableIds: string[],
  primaryFilialId: string | null = null,
): { ids: string[]; semFilial: boolean } {
  if (activeFilialId && availableIds.includes(activeFilialId)) return { ids: [activeFilialId], semFilial: false };
  if (isGlobal) return { ids: [...availableIds], semFilial: true };
  if (primaryFilialId && availableIds.includes(primaryFilialId)) return { ids: [primaryFilialId], semFilial: false };
  return { ids: [], semFilial: false };
}

/** Converte a seleção em parâmetros. Nunca amplia: só filiais disponíveis; vazio = vazio. */
export function toParkScope(
  selectedIds: string[],
  semFilial: boolean,
  availableIds: string[],
  canSemFilial: boolean,
): ParkFilialScope {
  const allowed = new Set(availableIds);
  const ids = Array.from(new Set(selectedIds.filter((id) => allowed.has(id)))).sort();
  return { filialIds: ids, includeSemFilial: canSemFilial && semFilial };
}

export const scopeKey = (s: ParkFilialScope) =>
  s.filialIds === null ? 'legacy' : `${s.filialIds.join(',')}|${s.includeSemFilial ? 1 : 0}`;

export const scopeRpcParams = (s: ParkFilialScope) =>
  s.filialIds === null
    ? {}
    : { p_filial_ids: s.filialIds, p_include_sem_filial: s.includeSemFilial };
