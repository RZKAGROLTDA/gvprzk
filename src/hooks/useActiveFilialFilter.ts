import { useCallback, useEffect, useRef, useState } from 'react';
import { useUserFiliais } from '@/hooks/useUserFiliais';

/**
 * M3 — Etapa 3: ponte entre a Filial Ativa do cabeçalho e o filtro local de filial
 * de cada tela.
 *
 * Regras:
 * - O valor inicial do filtro é a Filial Ativa (`'all'` quando global = todas).
 * - Ao trocar a Filial Ativa no cabeçalho, o filtro local acompanha imediatamente.
 * - O usuário pode ajustar o filtro local, mas nunca para uma filial fora do escopo
 *   autorizado (`get_user_filial_ids`). Global pode escolher qualquer filial da lista.
 * - Com 1 filial o comportamento é idêntico ao atual (filtro já vinha restrito pelo banco).
 */
export const useActiveFilialFilter = () => {
  const {
    filiais,
    filialIds,
    activeFilialId,
    isGlobal,
    isMultiFilial,
    isLoading,
  } = useUserFiliais();

  const [filial, setFilialState] = useState<string>(() => activeFilialId ?? 'all');
  const lastActive = useRef<string | null | undefined>(undefined);

  // Sincroniza com o cabeçalho apenas quando a Filial Ativa realmente muda,
  // preservando um ajuste manual feito pelo usuário na própria tela.
  useEffect(() => {
    if (isLoading) return;
    if (lastActive.current === activeFilialId) return;
    lastActive.current = activeFilialId;
    setFilialState(activeFilialId ?? 'all');
  }, [activeFilialId, isLoading]);

  const setFilial = useCallback(
    (next: string) => {
      if (next !== 'all' && !isGlobal && !filialIds.includes(next)) return;
      setFilialState(next);
    },
    [isGlobal, filialIds],
  );

  return {
    /** Valor do Select local (`'all'` = todas as permitidas). */
    filial,
    setFilial,
    /** Valor para enviar às consultas (`null` = sem filtro de filial). */
    filialId: filial === 'all' ? null : filial,
    /** Filiais autorizadas do usuário (principal primeiro). */
    allowedFiliais: filiais,
    allowedIds: filialIds,
    isGlobal,
    isMultiFilial,
    isLoading,
  };
};
