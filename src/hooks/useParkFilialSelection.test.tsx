import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useParkFilialSelection } from './useParkFilialSelection';

describe('machine panels local filial selection', () => {
  it('stays disabled with an explicit empty scope until options are ready', () => {
    const { result, rerender } = renderHook(({ ready }) => useParkFilialSelection(ready, false, 'a', ['a', 'b'], 'a'), { initialProps: { ready: false } });
    expect(result.current.isReady).toBe(false);
    expect(result.current.scope).toEqual({ filialIds: [], includeSemFilial: false });
    rerender({ ready: true });
    expect(result.current.isReady).toBe(true);
    expect(result.current.scope.filialIds).toEqual(['a']);
  });
  it('preserves several selected filiais and Sem filial after a header switch', () => {
    const ids = ['a', 'b', 'c'];
    const { result, rerender } = renderHook(({ active }) => useParkFilialSelection(true, true, active, ids, 'a'), { initialProps: { active: 'a' } });
    act(() => result.current.setSelection({ ids: ['b', 'c'], semFilial: true }));
    rerender({ active: 'b' });
    expect(result.current.scope).toEqual({ filialIds: ['b', 'c'], includeSemFilial: true });
  });
  it('keeps none selected after a header switch instead of widening scope', () => {
    const ids = ['a', 'b'];
    const { result, rerender } = renderHook(({ active }) => useParkFilialSelection(true, false, active, ids, 'a'), { initialProps: { active: 'a' } });
    act(() => result.current.setSelection({ ids: [], semFilial: false }));
    rerender({ active: 'b' });
    expect(result.current.scope).toEqual({ filialIds: [], includeSemFilial: false });
  });
  it('uses only an authorized primary filial when no initial active filial exists', () => {
    const { result } = renderHook(() => useParkFilialSelection(true, false, null, ['a', 'b'], 'b'));
    expect(result.current.scope.filialIds).toEqual(['b']);
  });
  it('global default selects all and Sem filial, non-global cannot include Sem filial or unauthorized IDs', () => {
    const global = renderHook(() => useParkFilialSelection(true, true, null, ['a', 'b'], null));
    expect(global.result.current.scope).toEqual({ filialIds: ['a', 'b'], includeSemFilial: true });
    const restricted = renderHook(() => useParkFilialSelection(true, false, null, ['a'], 'a'));
    act(() => restricted.result.current.setSelection({ ids: ['a', 'x'], semFilial: true }));
    expect(restricted.result.current.scope).toEqual({ filialIds: ['a'], includeSemFilial: false });
  });
});