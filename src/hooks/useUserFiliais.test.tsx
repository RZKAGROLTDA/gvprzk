import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const FILIAIS = [
  { id: 'caia', nome: 'CAIAPONIA' },
  { id: 'pv', nome: 'PLANALTO VERDE' },
  { id: 'canarana', nome: 'CANARANA' },
];

const state = {
  userId: 'user-1' as string | null,
  primary: 'caia' as string | null,
  allowed: ['caia'] as string[],
  isAdmin: false,
  isManager: false,
};

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: state.userId ? { id: state.userId } : null }),
}));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: { filial_id: state.primary }, loading: false }),
}));
vi.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: state.isAdmin, isManager: state.isManager, isLoading: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (_fn: string, _args: any) => ({ data: state.allowed, error: null }),
    from: () => ({
      select: () => ({
        in: async (_col: string, ids: string[]) => ({
          data: FILIAIS.filter((f) => ids.includes(f.id)),
          error: null,
        }),
      }),
    }),
  },
}));

import { useUserFiliais } from './useUserFiliais';
import { clearAllActiveFiliais, readActiveFilial } from '@/lib/activeFilial';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const load = async () => {
  const hook = renderHook(() => useUserFiliais(), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  await waitFor(() => expect(hook.result.current.filiais.length).toBeGreaterThan(0));
  return hook;
};

beforeEach(() => {
  window.sessionStorage.clear();
  state.userId = 'user-1';
  state.primary = 'caia';
  state.allowed = ['caia'];
  state.isAdmin = false;
  state.isManager = false;
});

describe('M3 Etapa 1 — useUserFiliais', () => {
  it('usuário com 1 filial: recebe só a principal e não é multi-filial', async () => {
    const { result } = await load();
    expect(result.current.filiais.map((f) => f.id)).toEqual(['caia']);
    expect(result.current.isMultiFilial).toBe(false);
    expect(result.current.activeFilialId).toBe('caia');
  });

  it('usuário com 2 filiais: recebe as duas, principal primeiro e ativa = principal', async () => {
    state.allowed = ['pv', 'caia'];
    const { result } = await load();
    await waitFor(() => expect(result.current.filiais.length).toBe(2));
    expect(result.current.filiais[0]).toMatchObject({ id: 'caia', isPrimary: true });
    expect(result.current.filiais.map((f) => f.id).sort()).toEqual(['caia', 'pv']);
    expect(result.current.filiais.some((f) => f.id === 'canarana')).toBe(false);
    expect(result.current.isMultiFilial).toBe(true);
    expect(result.current.activeFilialId).toBe('caia');
    expect(result.current.primaryFilialId).toBe('caia');
  });

  it('troca para filial autorizada funciona; filial não autorizada é ignorada', async () => {
    state.allowed = ['caia', 'pv'];
    const { result } = await load();
    await waitFor(() => expect(result.current.filiais.length).toBe(2));

    result.current.setActiveFilialId('pv');
    await waitFor(() => expect(result.current.activeFilialId).toBe('pv'));

    result.current.setActiveFilialId('canarana');
    await waitFor(() => expect(result.current.activeFilialId).toBe('pv'));
    expect(readActiveFilial('user-1')).toBe('pv');
  });

  it('valor gravado fora do escopo volta para a principal', async () => {
    window.sessionStorage.setItem('rzk.activeFilial.user-1', 'canarana');
    const { result } = await load();
    expect(result.current.activeFilialId).toBe('caia');
  });

  it('admin/manager permanecem globais (filial ativa nula = todas)', async () => {
    state.isAdmin = true;
    const { result } = await load();
    expect(result.current.isGlobal).toBe(true);
    expect(result.current.activeFilialId).toBeNull();
  });

  it('troca de usuário/logout não reaproveita a filial ativa anterior', async () => {
    state.allowed = ['caia', 'pv'];
    const first = await load();
    await waitFor(() => expect(first.result.current.filiais.length).toBe(2));
    first.result.current.setActiveFilialId('pv');
    await waitFor(() => expect(first.result.current.activeFilialId).toBe('pv'));

    // Logout / troca de conta limpa o estado de todos os usuários.
    clearAllActiveFiliais();
    expect(readActiveFilial('user-1')).toBeNull();

    // Outro usuário nunca lê a chave do anterior.
    window.sessionStorage.setItem('rzk.activeFilial.user-1', 'pv');
    expect(readActiveFilial('user-2')).toBeNull();

    state.userId = 'user-2';
    state.allowed = ['caia'];
    const second = await load();
    expect(second.result.current.activeFilialId).toBe('caia');
  });
});
