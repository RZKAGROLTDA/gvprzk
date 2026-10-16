import { describe, it, expect } from 'vitest';
import { defaultParkSelection, toParkScope, scopeRpcParams, LEGACY_SCOPE } from './parkFilialScope';

describe('escopo de filiais da Validação de Máquinas', () => {
  it('limpar seleção não amplia a consulta', () => {
    expect(toParkScope([], false, ['a', 'b'], true)).toEqual({ filialIds: [], includeSemFilial: false });
  });
  it('descarta filial não disponível ao usuário', () => {
    expect(toParkScope(['a', 'x'], false, ['a', 'b'], false).filialIds).toEqual(['a']);
  });
  it('Sem filial só vale para visão global', () => {
    expect(toParkScope([], true, ['a'], false).includeSemFilial).toBe(false);
    expect(toParkScope([], true, ['a'], true).includeSemFilial).toBe(true);
  });
  it('padrão: Filial Ativa marcada; global sem Filial Ativa = todas + Sem filial', () => {
    expect(defaultParkSelection(false, 'a', ['a', 'b'])).toEqual({ ids: ['a'], semFilial: false });
    expect(defaultParkSelection(true, null, ['a', 'b'])).toEqual({ ids: ['a', 'b'], semFilial: true });
  });
  it('modo legado não envia parâmetros novos', () => {
    expect(scopeRpcParams(LEGACY_SCOPE)).toEqual({});
  });
});
