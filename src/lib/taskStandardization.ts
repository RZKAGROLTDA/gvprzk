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
  
  // Se é um UUID (formato: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filialId);
  
  if (isUUID) {
    // É um UUID, consultar no cache
    return filiaisCache.get(filialId) || filialId; // Retorna o próprio UUID se não encontrar no cache
  } else {
    // Já é um nome de filial, retornar diretamente
    return filialId;
  }
};

// Function to get filial name with unified fallback logic
export const getFilialDisplayName = (record: any, filiais: any[] = []): string => {
  // Check in order: filial?.nome, filial_nome, branch?.name, branch_name, filial, branch
  const candidates = [
    record?.filial?.nome,
    record?.filial_nome,
    record?.branch?.name,
    record?.branch_name,
    record?.filial,
    record?.branch
  ];
  
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'string' && candidate.trim() !== '') {
      // If it looks like a UUID, try to resolve it
      if (candidate.length === 36 && candidate.includes('-')) {
        // Try cache first
        const fromCache = filiaisCache.get(candidate);
        if (fromCache) return fromCache;
        
        // Try provided filiais array
        const filial = filiais.find(f => f.id === candidate);
        if (filial?.nome) return filial.nome;
      } else {
        // Return the name directly
        return candidate;
      }
    }
  }
  
  // If we have branch_id, try lookup
  if (record?.branch_id) {
    const fromCache = filiaisCache.get(record.branch_id);
    if (fromCache) return fromCache;
    
    const filial = filiais.find(f => f.id === record.branch_id);
    if (filial?.nome) return filial.nome;
  }
  
  return '—';
};

// Cache for memoized results to prevent excessive recalculations
const filialNameCache = new Map<string, string>();

// Robust function to handle both UUID and string values for filial
export const getFilialNameRobust = (filialValue: string | null | undefined, filiais: any[] = []): string => {
  // Early return for empty values
  if (!filialValue) {
    return "—";
  }
  
  // Check cache first to avoid repeated calculations
  const cacheKey = `${filialValue}-${filiais.length}`;
  if (filialNameCache.has(cacheKey)) {
    return filialNameCache.get(cacheKey)!;
  }
  
  let result: string;
  
  // Check if it's a UUID (format: 8-4-4-4-12 characters)
  if (filialValue.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    // Try cache first
    const fromCache = filiaisCache.get(filialValue);
    if (fromCache) {
      result = fromCache;
    } else {
      // Try provided filiais array
      const filial = filiais.find(f => f.id === filialValue);
      if (filial?.nome) {
        result = filial.nome;
        // Store in main cache for future use
        filiaisCache.set(filialValue, filial.nome);
      } else {
        result = filialValue;
      }
    }
  } else {
    // If it's already a name (like "Tele Vendas", "Não informado"), return it directly
    result = filialValue;
  }
  
  // Cache the result to prevent repeated calculations
  filialNameCache.set(cacheKey, result);
  
  // Clear cache if it gets too large (prevent memory leaks)
  if (filialNameCache.size > 1000) {
    filialNameCache.clear();
  }
  
  return result;
};

// Função para criar task com snapshot da filial
export const createTaskWithFilialSnapshot = async (taskData: any): Promise<any> => {
  console.log('🔄 Processando task com filial_id:', taskData.filial_id);
  
  // Se não tem cache, carrega antes
  if (filiaisCache.size === 0) {
    console.log('📥 Cache vazio, carregando filiais...');
    await loadFiliaisCache();
  }
  
  // Garantir que temos um filial_id válido
  let filialId = taskData.filial_id;
  
  // Se não veio filial_id, tentar pegar do campo filial se for UUID
  if (!filialId && taskData.filial) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskData.filial);
    if (isUUID) {
      filialId = taskData.filial;
      console.log('🔍 Usando filial como filial_id:', filialId);
    }
  }
  
  const filialName = resolveFilialName(filialId);
  console.log('✅ Filial resolvida:', filialName);
  
  return {
    ...taskData,
    filial: filialName
  };
};

export const mapSalesStatus = (task: Task | null): 'prospect' | 'ganho' | 'perdido' | 'parcial' => {
  // Handle null or undefined task
  if (!task) return 'prospect';
  
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
