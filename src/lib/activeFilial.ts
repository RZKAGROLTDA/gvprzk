/**
 * Estado da "filial ativa" da sessão (M3 — Etapa 1).
 *
 * Regras:
 * - A chave é sempre por usuário (`user_id`), então logout/login ou troca de
 *   conta NUNCA reaproveita a filial ativa de outro usuário.
 * - `null` significa "todas as filiais permitidas" (padrão de admin/manager global).
 * - Nada aqui concede acesso: a validação contra `get_user_filial_ids` é feita
 *   em `useUserFiliais` e no banco (M1/M2).
 */

const PREFIX = 'rzk.activeFilial.';
const EVENT = 'rzk:active-filial-changed';

const storage = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const keyFor = (userId: string) => `${PREFIX}${userId}`;

export const readActiveFilial = (userId?: string | null): string | null => {
  if (!userId) return null;
  return storage()?.getItem(keyFor(userId)) ?? null;
};

export const writeActiveFilial = (userId: string | null | undefined, filialId: string | null): void => {
  if (!userId) return;
  const s = storage();
  if (!s) return;
  if (filialId) s.setItem(keyFor(userId), filialId);
  else s.removeItem(keyFor(userId));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { userId, filialId } }));
};

/** Remove o estado de todos os usuários (usado em logout/troca de conta). */
export const clearAllActiveFiliais = (): void => {
  const s = storage();
  if (!s) return;
  const keys: string[] = [];
  for (let i = 0; i < s.length; i += 1) {
    const k = s.key(i);
    if (k?.startsWith(PREFIX)) keys.push(k);
  }
  keys.forEach((k) => s.removeItem(k));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { userId: null, filialId: null } }));
};

export const subscribeActiveFilial = (listener: () => void): (() => void) => {
  const handler = () => listener();
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
};
