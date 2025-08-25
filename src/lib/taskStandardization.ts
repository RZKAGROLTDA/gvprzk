import { Task } from '@/types/task';
import { getSalesValueAsNumber } from '@/lib/securityUtils';
import { supabase } from '@/integrations/supabase/client';

// Cache para filiais para evitar múltiplas consultas
let filiaisCache: Map<string, string> = new Map();

export const loadFiliaisCache = async (): Promise<void> => {
  try {
    const { data: filiais, error } = await supabase
      .from('filiais')
      .select('id, nome');
    
    if (error) {
      console.error('Erro ao carregar filiais:', error);
      return;
    }
    
    filiaisCache.clear();
    filiais?.forEach(filial => {
      filiaisCache.set(filial.id, filial.nome);
    });
  } catch (error) {
    console.error('Erro ao carregar filiais:', error);
  }
};

export const resolveFilialName = (filialId: string | null): string => {
  if (!filialId) return 'Não informado';
  return filiaisCache.get(filialId) || 'Não informado';
};

// Função para criar task com snapshot da filial
export const createTaskWithFilialSnapshot = async (taskData: any): Promise<any> => {
  // Se não tem cache, carrega antes
  if (filiaisCache.size === 0) {
    await loadFiliaisCache();
  }
  
  const filialName = resolveFilialName(taskData.filial_id);
  
  return {
    ...taskData,
    filial: filialName
  };
};

export const mapSalesStatus = (task: Task): 'prospect' | 'ganho' | 'perdido' | 'parcial' => {
  if (task.salesType === 'ganho') return 'ganho';
  if (task.salesType === 'perdido') return 'perdido';
  if (task.salesType === 'parcial') return 'parcial';
  return 'prospect';
};

export const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'prospect': return 'Prospect';
    case 'ganho': return 'Ganho';
    case 'perdido': return 'Perdido';
    case 'parcial': return 'Parcial';
    default: return 'Prospect';
  }
};

export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'ganho': return 'bg-green-100 text-green-800';
    case 'perdido': return 'bg-red-100 text-red-800';
    case 'parcial': return 'bg-yellow-100 text-yellow-800';
    default: return 'bg-blue-100 text-blue-800';
  }
};

// Função para padronizar campos de tarefa para relatórios
export const mapTaskToStandardFields = (task: Task) => {
  const standardized = {
    id: task.id,
    name: task.name,
    responsible: task.responsible,
    client: task.client,
    property: task.property,
    filial: task.filial || 'Não informado',
    taskType: task.taskType,
    startDate: task.startDate,
    endDate: task.endDate,
    startTime: task.startTime,
    endTime: task.endTime,
    status: task.status,
    priority: task.priority,
    observations: task.observations,
    // Campos específicos para prospects
    isProspect: task.isProspect,
    prospectNotes: task.prospectNotes,
    salesValue: task.salesValue,
    salesConfirmed: task.salesConfirmed,
    salesType: task.salesType,
    familyProduct: task.familyProduct,
    equipmentQuantity: task.equipmentQuantity,
    propertyHectares: task.propertyHectares,
    // Campos calculados/derivados
    salesStatus: mapSalesStatus(task),
    salesValueCategory: getSalesValueAsNumber(task.salesValue) < 50000 ? 'SMALL' : getSalesValueAsNumber(task.salesValue) >= 50000 ? 'LARGE' : 'UNKNOWN',
    completionRate: task.status === 'completed' ? 100 : task.status === 'in_progress' ? 50 : 0,
    // Metadados
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    createdBy: task.createdBy
  };
  
  return standardized;
};

// Function to calculate sales value (backward compatibility)
export const calculateSalesValue = (tasks: Task[]): number => {
  return tasks.reduce((sum, task) => {
    return sum + getSalesValueAsNumber(task.salesValue);
  }, 0);
};

// Função para calcular estatísticas agregadas
export const calculateTaskStats = (tasks: Task[]) => {
  const prospects = tasks.filter(t => t.isProspect);
  const completed = tasks.filter(t => t.status === 'completed');
  const won = tasks.filter(t => t.salesType === 'ganho');
  
  const totalSalesValue = prospects.reduce((sum, task) => {
    return sum + getSalesValueAsNumber(task.salesValue);
  }, 0);
  
  return {
    totalTasks: tasks.length,
    completedTasks: completed.length,
    prospectTasks: prospects.length,
    wonDeals: won.length,
    totalSalesValue,
    averageCompletionRate: completed.length / Math.max(tasks.length, 1) * 100,
    conversionRate: won.length / Math.max(prospects.length, 1) * 100
  };
};