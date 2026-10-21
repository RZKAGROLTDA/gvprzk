import { useEffect, useMemo, useState } from 'react';
import { defaultParkSelection, toParkScope } from '@/lib/parkFilialScope';

/** Explicit local scope: initialize once, never replace it on a header switch. */
export function useParkFilialSelection(
  optionsReady: boolean,
  isGlobal: boolean,
  activeFilialId: string | null,
  optionIds: string[],
  primaryFilialId: string | null,
) {
  const [selection, setSelection] = useState<{ ids: string[]; semFilial: boolean } | null>(null);
  useEffect(() => {
    if (!optionsReady) return;
    setSelection((previous) => previous ?? defaultParkSelection(isGlobal, activeFilialId, optionIds, primaryFilialId));
  }, [optionsReady, isGlobal, activeFilialId, optionIds, primaryFilialId]);
  const scope = useMemo(
    () => toParkScope(selection?.ids ?? [], selection?.semFilial ?? false, optionIds, isGlobal),
    [selection, optionIds, isGlobal],
  );
  return { selection, setSelection, scope, isReady: optionsReady && selection !== null };
}