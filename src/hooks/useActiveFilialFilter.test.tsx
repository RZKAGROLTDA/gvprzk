import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useActiveFilialFilter } from './useActiveFilialFilter';

const CAIAPONIA = '502c311e-9c14-4198-a356-85e1419fa666';
const PLANALTO = '11111111-1111-1111-1111-111111111111';
const CANARANA = '5202c983-737b-4f78-a00d-6d9d12f713c3';

const state = {
  filiais: [] as { id: string; nome: string; isPrimary: boolean }[],
  filialIds: [] as string[],
  activeFilialId: null as string | null,
  isGlobal: false,
  isMultiFilial: false,
  isLoading: false,
};

vi.mock('@/hooks/useUserFiliais', () => ({
  useUserFiliais: () => state,
}));

const single = () => {
  state.filiais = [{ id: CAIAPONIA, nome: 'Caiapônia', isPrimary: true }];
  state.filialIds = [CAIAPONIA];
  state.activeFilialId = CAIAPONIA;
  state.isGlobal = false;
  state.isMultiFilial = false;
};

const multi = () => {
  state.filiais = [
    { id: CAIAPONIA, nome: 'Caiapônia', isPrimary: true },
    { id: PLANALTO, nome: 'Planalto Verde', isPrimary: false },
  ];
  state.filialIds = [CAIAPONIA, PLANALTO];
  state.activeFilialId = CAIAPONIA;
  state.isGlobal = false;
  state.isMultiFilial = true;
};

describe('useActiveFilialFilter', () => {
  beforeEach(() => {
    state.isLoading = false;
  });

  it('usuário com 1 filial: filtro começa na própria filial', () => {
    single();
    const { result } = renderHook(() => useActiveFilialFilter());
    expect(result.current.filialId).toBe(CAIAPONIA);
    expect(result.current.isMultiFilial).toBe(false);
    expect(result.current.allowedFiliais).toHaveLength(1);
  });

  it('multi-filial: começa na principal e acompanha a troca no cabeçalho', () => {
    multi();
    const { result, rerender } = renderHook(() => useActiveFilialFilter());
    expect(result.current.filialId).toBe(CAIAPONIA);

    state.activeFilialId = PLANALTO;
    rerender();
    expect(result.current.filialId).toBe(PLANALTO);

    state.activeFilialId = CAIAPONIA;
    rerender();
    expect(result.current.filialId).toBe(CAIAPONIA);
  });

  it('multi-filial: filtro local aceita filial autorizada', () => {
    multi();
    const { result } = renderHook(() => useActiveFilialFilter());
    act(() => result.current.setFilial(PLANALTO));
    expect(result.current.filialId).toBe(PLANALTO);
  });

  it('filial não autorizada é ignorada', () => {
    multi();
    const { result } = renderHook(() => useActiveFilialFilter());
    act(() => result.current.setFilial(CANARANA));
    expect(result.current.filialId).toBe(CAIAPONIA);
    expect(result.current.allowedIds).not.toContain(CANARANA);
  });

  it('admin/manager global começa em todas as filiais', () => {
    state.filiais = [];
    state.filialIds = [];
    state.activeFilialId = null;
    state.isGlobal = true;
    state.isMultiFilial = false;
    const { result } = renderHook(() => useActiveFilialFilter());
    expect(result.current.filial).toBe('all');
    expect(result.current.filialId).toBeNull();

    // Escolhendo uma filial no cabeçalho, a tela acompanha; ao voltar, global de novo.
    state.activeFilialId = PLANALTO;
    const { result: r2 } = renderHook(() => useActiveFilialFilter());
    expect(r2.current.filialId).toBe(PLANALTO);
  });
});
