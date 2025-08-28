import { Task } from '@/types/task';
import { mapTaskToStandardFields } from './taskStandardization';

/**
 * MAPEAMENTO PADRONIZADO DE CAMPOS PARA RELATÓRIOS
 * 
 * Este arquivo define o layout padrão que TODOS os relatórios devem seguir,
 * independente do tipo de formulário (Visita, Ligação, Checklist) ou versão.
 */

// Interface para o layout padrão de relatório
export interface StandardReportField {
  label: string;
  key: string;
  type: 'text' | 'date' | 'currency' | 'number' | 'boolean';
  required: boolean;
  section: string;
}

// LAYOUT PADRÃO - TODOS OS RELATÓRIOS DEVEM SEGUIR ESTA ESTRUTURA
export const STANDARD_REPORT_LAYOUT: StandardReportField[] = [
  // === SEÇÃO: INFORMAÇÕES BÁSICAS ===
  { label: 'Nome da Tarefa', key: 'nome', type: 'text', required: true, section: 'basico' },
  { label: 'Responsável', key: 'responsavel', type: 'text', required: true, section: 'basico' },
  { label: 'Filial', key: 'filial', type: 'text', required: true, section: 'basico' },
  { label: 'Tipo de Formulário', key: 'tipoFormulario', type: 'text', required: true, section: 'basico' },
  
  // === SEÇÃO: DADOS DO CLIENTE ===
  { label: 'Cliente', key: 'cliente', type: 'text', required: true, section: 'cliente' },
  { label: 'Propriedade', key: 'propriedade', type: 'text', required: true, section: 'cliente' },
  { label: 'Código do Cliente', key: 'codigoCliente', type: 'text', required: false, section: 'cliente' },
  { label: 'CPF', key: 'cpf', type: 'text', required: false, section: 'cliente' },
  { label: 'E-mail', key: 'email', type: 'text', required: false, section: 'cliente' },
  { label: 'Telefone', key: 'telefone', type: 'text', required: false, section: 'cliente' },
  
  // === SEÇÃO: AGENDAMENTO ===
  { label: 'Data de Início', key: 'dataInicio', type: 'date', required: true, section: 'agendamento' },
  { label: 'Data de Fim', key: 'dataFim', type: 'date', required: true, section: 'agendamento' },
  { label: 'Horário de Início', key: 'horarioInicio', type: 'text', required: true, section: 'agendamento' },
  { label: 'Horário de Fim', key: 'horarioFim', type: 'text', required: true, section: 'agendamento' },
  
  // === SEÇÃO: STATUS E CONTROLE ===
  { label: 'Status', key: 'status', type: 'text', required: true, section: 'controle' },
  { label: 'Prioridade', key: 'prioridade', type: 'text', required: true, section: 'controle' },
  { label: 'Data de Criação', key: 'dataCriacao', type: 'date', required: true, section: 'controle' },
  { label: 'Criado Por', key: 'criadoPor', type: 'text', required: true, section: 'controle' },
  
  // === SEÇÃO: INFORMAÇÕES COMERCIAIS ===
  { label: 'É Prospect?', key: 'prospect', type: 'boolean', required: true, section: 'comercial' },
  { label: 'Valor da Venda', key: 'valorVenda', type: 'currency', required: false, section: 'comercial' },
  { label: 'Venda Confirmada', key: 'vendaConfirmada', type: 'boolean', required: false, section: 'comercial' },
  { label: 'Tipo de Venda', key: 'tipoVenda', type: 'text', required: false, section: 'comercial' },
  { label: 'Status da Venda', key: 'statusVenda', type: 'text', required: false, section: 'comercial' },
  
  // === SEÇÃO: INFORMAÇÕES TÉCNICAS ===
  { label: 'Família do Produto', key: 'familiaProduto', type: 'text', required: false, section: 'tecnico' },
  { label: 'Quantidade de Equipamentos', key: 'quantidadeEquipamentos', type: 'number', required: false, section: 'tecnico' },
  { label: 'Hectares da Propriedade', key: 'hectaresPropriedade', type: 'number', required: false, section: 'tecnico' },
  { label: 'KM Inicial', key: 'kmInicial', type: 'number', required: false, section: 'tecnico' },
  { label: 'KM Final', key: 'kmFinal', type: 'number', required: false, section: 'tecnico' },
  
  // === SEÇÃO: OBSERVAÇÕES ===
  { label: 'Observações Gerais', key: 'observacoes', type: 'text', required: false, section: 'observacoes' },
  { label: 'Notas de Prospecção', key: 'notasProspeccao', type: 'text', required: false, section: 'observacoes' },
  { label: 'Justificativa (Outros)', key: 'justificativaOutros', type: 'text', required: false, section: 'observacoes' }
];

// Função para obter dados padronizados de uma tarefa
export const getStandardizedTaskData = (task: Task) => {
  const standardized = mapTaskToStandardFields(task);
  
  // Verificar se todos os campos obrigatórios estão presentes
  const missingFields: string[] = [];
  STANDARD_REPORT_LAYOUT
    .filter(field => field.required)
    .forEach(field => {
      const value = standardized[field.key as keyof typeof standardized];
      if (!value || value === '—') {
        missingFields.push(field.label);
      }
    });
  
  return {
    data: standardized,
    missingFields,
    isComplete: missingFields.length === 0
  };
};

// Função para gerar layout de relatório com dados padronizados
export const generateStandardReport = (task: Task) => {
  const { data, missingFields } = getStandardizedTaskData(task);
  
  const sections = STANDARD_REPORT_LAYOUT.reduce((acc, field) => {
    if (!acc[field.section]) {
      acc[field.section] = [];
    }
    
    const value = data[field.key as keyof typeof data];
    // Verificar se o valor é um objeto (_original) e pular se for
    if (field.key === '_original' || typeof value === 'object' && value !== null) {
      return acc;
    }
    
    acc[field.section].push({
      ...field,
      value: String(value || '—')
    });
    
    return acc;
  }, {} as Record<string, Array<StandardReportField & { value: string }>>);
  
  return {
    sections,
    missingFields,
    totalFields: STANDARD_REPORT_LAYOUT.length,
    completedFields: STANDARD_REPORT_LAYOUT.length - missingFields.length
  };
};

// Mapeamento de seções para títulos amigáveis
export const SECTION_TITLES = {
  basico: 'Informações Básicas',
  cliente: 'Dados do Cliente', 
  agendamento: 'Agendamento',
  controle: 'Status e Controle',
  comercial: 'Informações Comerciais',
  tecnico: 'Informações Técnicas',
  observacoes: 'Observações e Notas'
};

// Função para validar se um relatório está seguindo o padrão
export const validateReportStandard = (reportData: any): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  // Verificar se todos os campos obrigatórios estão presentes
  STANDARD_REPORT_LAYOUT
    .filter(field => field.required)
    .forEach(field => {
      if (!reportData[field.key] || reportData[field.key] === '') {
        errors.push(`Campo obrigatório ausente: ${field.label}`);
      }
    });
  
  // Verificar se o campo Filial está presente (unificação obrigatória)
  if (!reportData.filial || reportData.filial === '') {
    errors.push('Campo "Filial" deve estar sempre presente e preenchido');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};