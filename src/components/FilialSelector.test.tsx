import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const hookState = {
  filiais: [] as { id: string; nome: string; isPrimary: boolean }[],
  activeFilialId: null as string | null,
  isMultiFilial: false,
  isGlobal: false,
  isLoading: false,
};
const setActiveFilialId = vi.fn();

vi.mock('@/hooks/useUserFiliais', () => ({
  useUserFiliais: () => ({ ...hookState, setActiveFilialId }),
}));

import { FilialSelector } from './FilialSelector';

beforeEach(() => {
  setActiveFilialId.mockClear();
  hookState.filiais = [{ id: 'caia', nome: 'CAIAPONIA', isPrimary: true }];
  hookState.activeFilialId = 'caia';
  hookState.isMultiFilial = false;
  hookState.isGlobal = false;
  hookState.isLoading = false;
});

describe('M3 Etapa 2 — FilialSelector', () => {
  it('usuário com 1 filial: seletor não aparece', () => {
    render(<FilialSelector />);
    expect(screen.queryByLabelText('Filial ativa')).toBeNull();
  });

  it('supervisor com 1 filial: seletor não aparece', () => {
    hookState.filiais = [{ id: 'canarana', nome: 'CANARANA', isPrimary: true }];
    hookState.activeFilialId = 'canarana';
    render(<FilialSelector />);
    expect(screen.queryByLabelText('Filial ativa')).toBeNull();
  });

  it('principal + adicional: seletor aparece com a principal selecionada', () => {
    hookState.filiais = [
      { id: 'caia', nome: 'CAIAPONIA', isPrimary: true },
      { id: 'pv', nome: 'PLANALTO VERDE', isPrimary: false },
    ];
    hookState.isMultiFilial = true;
    render(<FilialSelector />);
    const trigger = screen.getByLabelText('Filial ativa');
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toContain('CAIAPONIA');
    expect(trigger.textContent).toContain('principal');
  });

  it('só oferece filiais autorizadas (nenhuma terceira)', () => {
    hookState.filiais = [
      { id: 'caia', nome: 'CAIAPONIA', isPrimary: true },
      { id: 'pv', nome: 'PLANALTO VERDE', isPrimary: false },
    ];
    hookState.isMultiFilial = true;
    render(<FilialSelector />);
    expect(screen.queryByText('CANARANA')).toBeNull();
  });

  it('admin/manager global: opção "Todas as filiais" ativa por padrão', () => {
    hookState.filiais = [
      { id: 'caia', nome: 'CAIAPONIA', isPrimary: true },
      { id: 'pv', nome: 'PLANALTO VERDE', isPrimary: false },
    ];
    hookState.isMultiFilial = true;
    hookState.isGlobal = true;
    hookState.activeFilialId = null;
    render(<FilialSelector />);
    expect(screen.getByLabelText('Filial ativa').textContent).toContain('Todas as filiais');
  });

  it('durante o carregamento não renderiza nada', () => {
    hookState.isLoading = true;
    hookState.isMultiFilial = true;
    render(<FilialSelector />);
    expect(screen.queryByLabelText('Filial ativa')).toBeNull();
  });
});
