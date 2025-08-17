import { Task } from '@/types/task';
import { supabase } from '@/integrations/supabase/client';

// Cache para filiais para otimizar performance
let filiaisCache: { [key: string]: string } = {};
let filiaisCacheLoaded = false;

/**
 * Carrega e cache os dados das filiais
 */
export const loadFiliaisCache = async () => {
  if (filiaisCacheLoaded) return;
  
  try {
    const { data: filiais } = await supabase
      .from('filiais')
      .select('id, nome');
    
    if (filiais) {
      filiaisCache = filiais.reduce((acc, filial) => {
        acc[filial.id] = filial.nome;
        return acc;
      }, {} as { [key: string]: string });
      filiaisCacheLoaded = true;
    }
  } catch (error) {
    console.error('Erro ao carregar cache de filiais:', error);
  }
};

/**
 * Resolve UUID de filial para nome da filial
 */
export const resolveFilialName = (filialId: string | null | undefined): string => {
  if (!filialId) return 'Não informado';
  
  // Se já é um nome (não UUID), retorna como está
  if (!filialId.includes('-')) return filialId;
  
  // Busca no cache
  return filiaisCache[filialId] || filialId;
};

/**
 * Mapeia status de vendas para padrão unificado
 */
export const mapSalesStatus = (task: Task): 'prospect' | 'parcial' | 'ganho' | 'perdido' => {
  // Se não é prospect, considerar como inativo
  if (!task.isProspect) return 'prospect';
  
  // Venda perdida
  if (task.salesConfirmed === false) return 'perdido';
  
  // Venda confirmada
  if (task.salesConfirmed === true) {
    // Verificar se é venda parcial (tem produtos específicos selecionados)
    if (task.prospectItems && task.prospectItems.length > 0) {
      const hasSelectedItems = task.prospectItems.some(item => item.selected);
      if (hasSelectedItems) return 'parcial';
    }
    return 'ganho';
  }
  
  // Prospect em andamento
  return 'prospect';
};

/**
 * Mapeia status legados para padrão unificado
 */
export const mapLegacyStatus = (status: string): 'prospect' | 'parcial' | 'ganho' | 'perdido' => {
  switch (status.toLowerCase()) {
    case 'won':
    case 'ganho':
      return 'ganho';
    case 'partial':
    case 'parcial':
      return 'parcial';
    case 'lost':
    case 'perdido':
      return 'perdido';
    default:
      return 'prospect';
  }
};

/**
 * Extrai CPF das observações usando regex
 */
export const extractCPFFromObservations = (observations: string): string => {
  if (!observations) return '';
  
  // Regex para CPF (111.111.111-11 ou 11111111111)
  const cpfMatch = observations.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
  return cpfMatch ? cpfMatch[0] : '';
};

/**
 * Mapeia tarefa para campos padronizados obrigatórios
 */
export const mapTaskToStandardFields = async (task: Task, userProfile?: any) => {
  // Garantir que o cache de filiais está carregado
  await loadFiliaisCache();
  
  // Extrair CPF das observações
  const cpf = extractCPFFromObservations(task.observations || '');
  
  // Resolver nome da filial
  const filialNome = resolveFilialName(task.filial);
  
  return {
    // Campos básicos obrigatórios
    nome_contato: task.client,
    cpf: cpf,
    data_relatorio: task.createdAt,
    cliente_nome: task.client,
    cliente_email: task.email || '',
    propriedade_nome: task.property,
    vendedor_id: task.createdBy,
    vendedor_nome: task.responsible,
    filial_id: task.filial,
    filial_nome: filialNome,
    
    // Dados específicos
    respostas: task.checklist || [],
    oportunidades: {
      status: mapSalesStatus(task),
      valor: task.salesValue || 0,
      confirmada: task.salesConfirmed,
      observacoes: task.prospectNotes || ''
    },
    
    // Metadados originais
    task_type: task.taskType,
    status_original: task.status,
    created_at: task.createdAt,
    updated_at: task.updatedAt
  };
};

/**
 * Cria dados de tarefa com snapshot de filial
 */
export const createTaskWithFilialSnapshot = async (taskData: Partial<Task>) => {
  // Garantir que o cache de filiais está carregado
  await loadFiliaisCache();
  
  // Se filial_id está presente, resolver para nome
  let filialNome = '';
  if (taskData.filial) {
    filialNome = resolveFilialName(taskData.filial);
  }
  
  return {
    ...taskData,
    // Sempre salvar tanto o ID quanto o nome para garantir consistência
    filial_id: taskData.filial,
    filial_nome: filialNome
  };
};

/**
 * Obtém label de status padronizado
 */
export const getStatusLabel = (status: 'prospect' | 'parcial' | 'ganho' | 'perdido'): string => {
  switch (status) {
    case 'prospect':
      return 'Prospect';
    case 'parcial':
      return 'Parcial';
    case 'ganho':
      return 'Ganho';
    case 'perdido':
      return 'Perdido';
    default:
      return 'Prospect';
  }
};

/**
 * Obtém cor de status padronizada
 */
export const getStatusColor = (status: 'prospect' | 'parcial' | 'ganho' | 'perdido'): string => {
  switch (status) {
    case 'prospect':
      return 'bg-blue-100 text-blue-800';
    case 'parcial':
      return 'bg-yellow-100 text-yellow-800';
    case 'ganho':
      return 'bg-green-100 text-green-800';
    case 'perdido':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

/**
 * Valida se todos os campos obrigatórios estão preenchidos
 */
export const validateStandardFields = (data: any): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!data.nome_contato) errors.push('Nome do contato é obrigatório');
  if (!data.cliente_nome) errors.push('Nome do cliente é obrigatório');
  if (!data.propriedade_nome) errors.push('Nome da propriedade é obrigatório');
  if (!data.vendedor_nome) errors.push('Nome do vendedor é obrigatório');
  if (!data.filial_nome) errors.push('Nome da filial é obrigatório');
  
  return {
    valid: errors.length === 0,
    errors
  };
};