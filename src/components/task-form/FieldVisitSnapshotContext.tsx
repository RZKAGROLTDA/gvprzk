import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { Task, ProductType } from '@/types/task';
import type { TechnicalVisitData, TechnicalFunnelStage } from '@/lib/activityLabels';

/**
 * Snapshot compartilhado dos shells executivos (FieldVisitForm, CallForm,
 * TechnicalVisitForm). Apenas leitura — publicado pelo CreateTask via useEffect.
 * Zero impacto em gravação, follow-ups, histórico ou regras de status.
 */
export interface TaskFormSnapshot {
  task: Partial<Task>;
  checklist: ProductType[];
  callProducts: ProductType[];
  equipmentList: { id: string; familyProduct: string; quantity: number }[];
  technicalVisitData?: TechnicalVisitData | null;
  technicalFunnelStage?: TechnicalFunnelStage | null;
}

interface SnapshotContextValue {
  snapshot: TaskFormSnapshot;
  publish: (s: Partial<TaskFormSnapshot>) => void;
}

const empty: TaskFormSnapshot = {
  task: {},
  checklist: [],
  callProducts: [],
  equipmentList: [],
  technicalVisitData: null,
  technicalFunnelStage: null,
};

const Ctx = createContext<SnapshotContextValue | null>(null);

export const TaskFormSnapshotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<TaskFormSnapshot>(empty);
  const publish = useCallback((s: Partial<TaskFormSnapshot>) => {
    setSnapshot(prev => ({ ...prev, ...s }));
  }, []);
  const value = useMemo(() => ({ snapshot, publish }), [snapshot, publish]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

/** Always-safe consumer (returns empty snapshot if no provider). */
export function useTaskFormSnapshot(): TaskFormSnapshot {
  return useContext(Ctx)?.snapshot ?? empty;
}

/** Optional publisher — no-op if not wrapped in provider. Safe to call from CreateTask. */
export function useTaskFormSnapshotPublisher(): (s: Partial<TaskFormSnapshot>) => void {
  const ctx = useContext(Ctx);
  return ctx?.publish ?? (() => {});
}

// Backwards-compatible aliases (FieldVisitForm uses old names).
export type FieldVisitSnapshot = TaskFormSnapshot;
export const FieldVisitSnapshotProvider = TaskFormSnapshotProvider;
export const useFieldVisitSnapshot = useTaskFormSnapshot;
export const useFieldVisitSnapshotPublisher = useTaskFormSnapshotPublisher;
