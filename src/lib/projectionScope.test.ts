import { describe, it, expect } from 'vitest';
import { resolveProjectionScopeFilial as r, hasProjectionFullAccess as full } from './projection';
describe('acesso da Projeção por função', () => {
  it('administrador tem acesso completo', () => expect(full({ isAdmin: true, isManager: false })).toBe(true));
  it('gerente tem o mesmo acesso completo do administrador', () => expect(full({ isAdmin: false, isManager: true })).toBe(true));
  it('supervisor não tem acesso completo', () => expect(full({ isAdmin: false, isManager: false })).toBe(false));
  it('gerente vê todas as filiais mesmo com Filial Ativa escolhida', () => expect(r({ isAdmin: false, isManager: true, activeFilialId: 'b' })).toBeNull());
  it('gerente não depende de Filial Ativa', () => expect(r({ isAdmin: false, isManager: true, activeFilialId: null })).toBeNull());
  it('admin mantém escopo global', () => expect(r({ isAdmin: true, isManager: false, activeFilialId: 'a' })).toBeNull());
  it('supervisor fica só na Filial Ativa', () => expect(r({ isAdmin: false, isManager: false, activeFilialId: 'a' })).toBe('a'));
  it('supervisor sem Filial Ativa fica sem escopo', () => expect(r({ isAdmin: false, isManager: false, activeFilialId: null })).toBeNull());
});
