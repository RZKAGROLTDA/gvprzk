import { describe, it, expect } from 'vitest';
import { resolveProjectionScopeFilial as r } from './projection';
const A = { id: 'a', nome: 'Mineiros' }, B = { id: 'b', nome: 'Jataí' }, T = { id: 't', nome: 'Tele Vendas' };
describe('escopo da Projeção', () => {
  it('gerente com uma filial usa ela automaticamente', () => expect(r({ isAdmin: false, isManager: true, activeFilialId: null, filiais: [A] })).toBe('a'));
  it('gerente com várias filiais precisa escolher', () => expect(r({ isAdmin: false, isManager: true, activeFilialId: null, filiais: [A, B] })).toBeNull());
  it('gerente com várias respeita a Filial Ativa', () => expect(r({ isAdmin: false, isManager: true, activeFilialId: 'b', filiais: [A, B] })).toBe('b'));
  it('Tele Vendas não conta e nunca é escolhida', () => {
    expect(r({ isAdmin: false, isManager: true, activeFilialId: null, filiais: [A, T] })).toBe('a');
    expect(r({ isAdmin: false, isManager: true, activeFilialId: null, filiais: [T] })).toBeNull();
  });
  it('supervisor sem Filial Ativa não ganha escolha automática', () => expect(r({ isAdmin: false, isManager: false, activeFilialId: null, filiais: [A] })).toBeNull());
  it('admin mantém escopo global', () => expect(r({ isAdmin: true, isManager: false, activeFilialId: 'a', filiais: [A] })).toBeNull());
  it('gerente sem filiais fica sem acesso', () => expect(r({ isAdmin: false, isManager: true, activeFilialId: null, filiais: [] })).toBeNull());
});
