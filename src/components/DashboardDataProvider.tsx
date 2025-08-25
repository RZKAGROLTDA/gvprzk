import React, { createContext, useContext, useMemo } from 'react';
import { useTasksOptimized, useConsultants, useFiliais } from '@/hooks/useTasksOptimized';

interface DashboardDataContextType {
  tasks: any[];
  consultants: any[];
  filiais: any[];
  loading: boolean;
  error: any;
}

const DashboardDataContext = createContext<DashboardDataContextType | undefined>(undefined);

export const DashboardDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { tasks, loading: tasksLoading, error: tasksError } = useTasksOptimized(false);
  const { data: consultants = [], isLoading: consultantsLoading } = useConsultants();
  const { data: filiais = [], isLoading: filiaisLoading } = useFiliais();

  const value = useMemo(() => ({
    tasks,
    consultants,
    filiais,
    loading: tasksLoading || consultantsLoading || filiaisLoading,
    error: tasksError
  }), [tasks, consultants, filiais, tasksLoading, consultantsLoading, filiaisLoading, tasksError]);

  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
};

export const useDashboardData = () => {
  const context = useContext(DashboardDataContext);
  if (context === undefined) {
    throw new Error('useDashboardData must be used within a DashboardDataProvider');
  }
  return context;
};