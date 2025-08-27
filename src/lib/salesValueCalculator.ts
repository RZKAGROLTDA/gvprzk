import { Task, ProductType } from '@/types/task';
import { getSalesValueAsNumber } from '@/lib/securityUtils';

/**
 * Função unificada para calcular valores de vendas parciais
 * Usa prospectItems (mapeado dos products do banco) para cálculos
 */
export const calculatePartialSalesValue = (task: Task): number => {
  // Verificar se é venda parcial
  if (task.salesType !== 'parcial' || !task.prospectItems) {
    return 0;
  }

  // Calcular valor baseado nos produtos selecionados
  return task.prospectItems
    .filter(product => product.selected)
    .reduce((sum, product) => {
      const quantity = product.quantity || 0;
      const price = product.price || 0;
      return sum + (quantity * price);
    }, 0);
};

/**
 * Função principal para calcular valor de vendas de uma task
 * Considera vendas parciais e completas corretamente
 */
export const calculateTaskSalesValue = (task: Task): number => {
  // Para vendas parciais confirmadas, usar o valor calculado do banco se disponível
  if (task.salesType === 'parcial' && task.salesConfirmed) {
    // Priorizar o valor calculado do banco de dados
    if (task.partialSalesValue !== undefined && task.partialSalesValue !== null) {
      return task.partialSalesValue;
    }
    
    // Fallback para cálculo dinâmico baseado nos produtos
    return calculatePartialSalesValue(task);
  }

  // Para vendas completas ou outros tipos, usar o valor total
  return getSalesValueAsNumber(task.salesValue);
};

/**
 * Função para calcular valor total de múltiplas tasks
 */
export const calculateTotalSalesValue = (tasks: Task[]): number => {
  return tasks.reduce((sum, task) => {
    return sum + calculateTaskSalesValue(task);
  }, 0);
};

/**
 * Função para obter valor de prospect (sem filtrar por confirmação)
 */
export const calculateProspectValue = (task: Task): number => {
  if (!task.isProspect) {
    return 0;
  }
  
  return getSalesValueAsNumber(task.salesValue);
};