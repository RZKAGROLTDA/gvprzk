import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { Task, ProductType } from '@/types/task';

export interface FieldVisitSnapshot {
  task: Partial<Task>;
  checklist: ProductType[];
  equipmentList: { id: string; familyProduct: string; quantity: number }[];
}

interface SnapshotContextValue {
  snapshot: FieldVisitSnapshot;
  publish: (s: Partial<FieldVisitSnapshot>) => void;
}

const empty: FieldVisitSnapshot = { task: {}, checklist: [], equipmentList: [] };

const Ctx = createContext<SnapshotContextValue | null>(null);

export const FieldVisitSnapshotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<FieldVisitSnapshot>(empty);
  const publish = useCallback((s: Partial<FieldVisitSnapshot>) => {
    setSnapshot(prev => ({ ...prev, ...s }));
  }, []);
  const value = useMemo(() => ({ snapshot, publish }), [snapshot, publish]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

/** Always-safe consumer (returns empty snapshot if no provider). */
export function useFieldVisitSnapshot(): FieldVisitSnapshot {
  return useContext(Ctx)?.snapshot ?? empty;
}

/** Optional publisher — no-op if not wrapped in provider. Safe to call from CreateTask. */
export function useFieldVisitSnapshotPublisher(): (s: Partial<FieldVisitSnapshot>) => void {
  const ctx = useContext(Ctx);
  return ctx?.publish ?? (() => {});
}
