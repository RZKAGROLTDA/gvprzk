import { Task } from '@/types/task';
import { getSalesValueAsNumber } from '@/lib/securityUtils';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

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
  // Se não é um prospect, retorna prospect
  if (!task.isProspect) return 'prospect';
  
  // Se salesConfirmed é undefined ou null, é um prospect em andamento
  if (task.salesConfirmed === undefined || task.salesConfirmed === null) return 'prospect';
  
  // Se salesConfirmed é true, verificar se é ganho ou parcial
  if (task.salesConfirmed === true) {
    if (task.salesType === 'parcial') return 'parcial';
    if (task.salesType === 'ganho') return 'ganho';
    return 'ganho'; // default para compatibilidade
  }
  
  // Se salesConfirmed é false, é perdido
  if (task.salesConfirmed === false) return 'perdido';
  
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

// Função para padronizar campos de tarefa para relatórios - VERSÃO UNIFICADA
export const mapTaskToStandardFields = (task: Task) => {
  // Helper para garantir valor padrão "—" para campos vazios
  const safeValue = (value: any): string => {
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    return String(value);
  };

  // Helper para dados numéricos
  const safeNumber = (value: any): string => {
    if (value === null || value === undefined || value === '' || isNaN(value)) {
      return '—';
    }
    return String(value);
  };

  // Helper para datas
  const safeDate = (value: any): string => {
    if (!value) return '—';
    try {
      return format(new Date(value), 'dd/MM/yyyy');
    } catch {
      return '—';
    }
  };

  // Helper para valores monetários
  const safeCurrency = (value: any): string => {
    const numValue = getSalesValueAsNumber(value);
    if (numValue === 0) return '—';
    return `R$ ${numValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  };

  // Unificar nome da filial (padronizar "Filial", "Unidade", etc.)
  const standardFilial = (): string => {
    // Verificar diferentes variações de campo filial
    if (task.filial) return safeValue(task.filial);
    if ((task as any).unidade) return safeValue((task as any).unidade);
    if ((task as any).filial_id) return resolveFilialName((task as any).filial_id);
    if ((task as any).unit) return safeValue((task as any).unit);
    return '—';
  };

  const standardized = {
    // === CAMPOS BÁSICOS OBRIGATÓRIOS ===
    id: task.id,
    nome: safeValue(task.name),
    responsavel: safeValue(task.responsible),
    cliente: safeValue(task.client),
    propriedade: safeValue(task.property),
    filial: standardFilial(), // SEMPRE "Filial" como nome do campo
    
    // === INFORMAÇÕES DE CONTATO ===
    email: safeValue(task.email),
    telefone: safeValue(task.phone),
    codigoCliente: safeValue(task.clientCode || (task as any).clientcode),
    cpf: safeValue((task as any).cpf),
    
    // === DADOS DO FORMULÁRIO ===
    tipoFormulario: safeValue(task.taskType === 'prospection' ? 'Visita' : 
                             task.taskType === 'ligacao' ? 'Ligação' : 
                             task.taskType === 'checklist' ? 'Checklist' : task.taskType),
    dataInicio: safeDate(task.startDate),
    dataFim: safeDate(task.endDate),
    horarioInicio: safeValue(task.startTime),
    horarioFim: safeValue(task.endTime),
    status: safeValue(task.status === 'pending' ? 'Pendente' :
                     task.status === 'in_progress' ? 'Em Andamento' :
                     task.status === 'completed' ? 'Concluído' :
                     task.status === 'closed' ? 'Fechado' : task.status),
    prioridade: safeValue(task.priority === 'low' ? 'Baixa' :
                         task.priority === 'medium' ? 'Média' :
                         task.priority === 'high' ? 'Alta' : task.priority),
    
    // === OBSERVAÇÕES E NOTAS ===
    observacoes: safeValue(task.observations),
    notasProspeccao: safeValue(task.prospectNotes),
    justificativaOutros: safeValue(task.prospectNotesJustification),
    
    // === INFORMAÇÕES COMERCIAIS ===
    prospect: safeValue(task.isProspect ? 'Sim' : 'Não'),
    valorVenda: safeCurrency(task.salesValue),
    vendaConfirmada: safeValue(task.salesConfirmed === true ? 'Sim' : 
                              task.salesConfirmed === false ? 'Não' : '—'),
    tipoVenda: safeValue(task.salesType === 'ganho' ? 'Ganho' :
                        task.salesType === 'perdido' ? 'Perdido' :
                        task.salesType === 'parcial' ? 'Parcial' : task.salesType),
    
    // === INFORMAÇÕES TÉCNICAS ===
    familiaProduto: safeValue(task.familyProduct),
    quantidadeEquipamentos: safeNumber(task.equipmentQuantity),
    hectaresPropriedade: safeNumber(task.propertyHectares),
    kmInicial: safeNumber(task.initialKm),
    kmFinal: safeNumber(task.finalKm),
    
    // === METADADOS DO SISTEMA ===
    dataCriacao: safeDate(task.createdAt),
    dataAtualizacao: safeDate(task.updatedAt),
    criadoPor: safeValue((task as any).createdByName || task.createdBy),
    
    // === CAMPOS CALCULADOS ===
    statusVenda: getStatusLabel(mapSalesStatus(task)),
    categoriaValor: getSalesValueAsNumber(task.salesValue) === 0 ? '—' :
                   getSalesValueAsNumber(task.salesValue) < 50000 ? 'Baixo Valor' : 'Alto Valor',
    taxaConclusao: task.status === 'completed' ? '100%' : 
                  task.status === 'in_progress' ? '50%' : '0%',
    
    // === VALORES ORIGINAIS (para compatibilidade) ===
    _original: {
      taskType: task.taskType,
      startDate: task.startDate,
      endDate: task.endDate,
      status: task.status,
      priority: task.priority,
      isProspect: task.isProspect,
      salesValue: task.salesValue,
      salesConfirmed: task.salesConfirmed,
      salesType: task.salesType
    }
  };
  
  return standardized;
};

// Function to calculate sales value - CORRIGIDO para usar calculadora unificada
export const calculateSalesValue = (taskOrTasks: Task | Task[]): number => {
  // Import dinâmico para evitar dependência circular
  const { calculateTaskSalesValue, calculateTotalSalesValue } = require('./salesValueCalculator');
  
  if (Array.isArray(taskOrTasks)) {
    return calculateTotalSalesValue(taskOrTasks);
  } else {
    return calculateTaskSalesValue(taskOrTasks);
  }
};

// Função para calcular estatísticas agregadas
export const calculateTaskStats = (tasks: Task[]) => {
  const prospects = tasks.filter(t => t.isProspect);
  const completed = tasks.filter(t => t.status === 'completed');
  const won = tasks.filter(t => t.salesConfirmed === true && t.salesType === 'ganho');
  
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