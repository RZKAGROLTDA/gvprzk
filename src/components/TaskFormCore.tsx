import React, { useState, useEffect } from 'react';
import { Task, ProductType, Reminder } from '@/types/task';
import { useInputValidation } from '@/hooks/useInputValidation';
import { useInputSanitization } from '@/hooks/useInputSanitization';
import { useInputSecurity } from '@/hooks/useInputSecurity';
import { toast } from '@/components/ui/use-toast';
import { mapSalesStatus, getStatusLabel, createTaskWithFilialSnapshot } from '@/lib/taskStandardization';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface TaskFormCoreProps {
  taskType: 'prospection' | 'field_visit' | 'call' | 'workshop_checklist';
  initialData?: Partial<Task>;
  onSubmit: (taskData: Partial<Task>) => Promise<void>;
  isSubmitting?: boolean;
}

export interface TaskFormData {
  // Dados básicos obrigatórios
  name: string;
  responsible: string;
  client: string;
  clientCode: string;
  property: string;
  taskType: 'prospection' | 'field_visit' | 'call' | 'workshop_checklist';
  
  // Dados opcionais com validação
  cpf?: string;
  email?: string;
  filial?: string;
  
  // Datas e horários
  startDate: Date;
  endDate: Date;
  startTime: string;
  endTime: string;
  
  // Listas de produtos/serviços
  checklist: ProductType[];
  prospectItems?: ProductType[];
  
  // Configurações específicas por tipo
  familyProduct?: string;
  equipmentQuantity?: number;
  propertyHectares?: number;
  equipmentList?: {id: string, familyProduct: string, quantity: number}[];
  
  // Dados adicionais
  observations: string;
  priority: 'low' | 'medium' | 'high';
  reminders: Reminder[];
  photos: string[];
  documents: string[];
  
  // Localização e deslocamento
  checkInLocation?: {
    lat: number;
    lng: number;
    timestamp: Date;
  };
  initialKm: number;
  finalKm: number;
  
  // Dados de prospecção
  isProspect: boolean;
  prospectNotes?: string;
  salesValue?: number | string;
  salesConfirmed?: boolean;
  salesType?: 'ganho' | 'parcial' | 'perdido';
}

// Regras de validação específicas por tipo de tarefa
export const getValidationRulesByType = (taskType: string) => {
  const baseRules = {
    name: { required: true, minLength: 3, maxLength: 100 },
    responsible: { required: true, minLength: 2, maxLength: 50 },
    client: { required: true, minLength: 2, maxLength: 100 },
    clientCode: { required: true, pattern: /^[0-9]{5,10}$/ },
    property: { required: true, minLength: 3, maxLength: 100 },
    email: { required: false, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    cpf: { required: false, pattern: /^\d{3}\.\d{3}\.\d{3}-\d{2}$|^\d{11}$/ },
    observations: { required: false, maxLength: 1000 },
    prospectNotes: { required: false, maxLength: 500 }
  };

  const typeSpecificRules: Record<string, any> = {
    field_visit: {
      ...baseRules,
      propertyHectares: { required: false, custom: (value: string) => {
        if (!value) return null; // Allow empty values
        const num = parseFloat(value);
        return num > 0 && num <= 10000 ? null : 'Hectares deve ser entre 0.1 e 10.000';
      }},
      equipmentQuantity: { required: true, custom: (value: string) => {
        const num = parseInt(value);
        return num > 0 && num <= 1000 ? null : 'Quantidade deve ser entre 1 e 1.000';
      }}
    },
    call: {
      ...baseRules,
      // Ligações não requerem dados físicos obrigatórios
      propertyHectares: { required: false },
      equipmentQuantity: { required: false }
    },
    workshop_checklist: {
      ...baseRules,
      equipmentQuantity: { required: true, custom: (value: string) => {
        const num = parseInt(value);
        return num > 0 && num <= 500 ? null : 'Quantidade deve ser entre 1 e 500';
      }},
      familyProduct: { required: true, minLength: 2, maxLength: 50 }
    },
    prospection: {
      ...baseRules,
      propertyHectares: { required: false, custom: (value: string) => {
        if (!value) return null; // Allow empty values
        const num = parseFloat(value);
        return num > 0 && num <= 10000 ? null : 'Hectares deve ser entre 0.1 e 10.000';
      }}
    }
  };

  return typeSpecificRules[taskType] || baseRules;
};

// Função para calcular valor total padronizada
export const calculateTaskTotalValue = (task: Partial<TaskFormData>): number => {
  let total = 0;
  
  // Somar valores do checklist (visitas e checklists)
  if (task.checklist) {
    task.checklist.forEach(item => {
      if (item.selected) {
        total += (item.price || 0) * (item.quantity || 1);
      }
    });
  }
  
  // Somar valores dos prospectItems (ligações)
  if (task.prospectItems) {
    task.prospectItems.forEach(item => {
      if (item.selected) {
        total += (item.price || 0) * (item.quantity || 1);
      }
    });
  }
  
  return total;
};

// Função para mapear tipo de tarefa para rótulo amigável
export const getTaskTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    'prospection': 'Prospecção',
    'field_visit': 'Visita de Campo', 
    'workshop_checklist': 'Checklist de Oficina',
    'call': 'Ligação'
  };
  return labels[type] || type;
};

// Função para sanitizar dados da tarefa antes do envio
export const sanitizeTaskData = (
  taskData: Partial<TaskFormData>,
  sanitizeText: (text: string) => string,
  sanitizeTaskInput: (input: any) => any
): Partial<TaskFormData> => {
  return {
    ...taskData,
    name: sanitizeText(taskData.name || ''),
    responsible: sanitizeText(taskData.responsible || ''),
    client: sanitizeText(taskData.client || ''),
    clientCode: sanitizeText(taskData.clientCode || ''),
    property: sanitizeText(taskData.property || ''),
    email: taskData.email ? sanitizeText(taskData.email) : undefined,
    observations: sanitizeText(taskData.observations || ''),
    prospectNotes: taskData.prospectNotes ? sanitizeText(taskData.prospectNotes) : undefined,
    checklist: sanitizeTaskInput(taskData.checklist) || [],
    prospectItems: sanitizeTaskInput(taskData.prospectItems) || [],
    reminders: sanitizeTaskInput(taskData.reminders) || [],
    familyProduct: taskData.familyProduct ? sanitizeText(taskData.familyProduct) : undefined
  };
};

// Função para validar tarefa completa antes do envio
export const validateTaskData = (
  taskData: Partial<TaskFormData>, 
  taskType: string,
  validateForm: (data: Record<string, string>, rules: Record<string, any>) => boolean
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  // Validação básica dos campos obrigatórios
  const validationRules = getValidationRulesByType(taskType);
  
  // Converter dados para formato de string para validação
  const stringData: Record<string, string> = {
    name: taskData.name || '',
    responsible: taskData.responsible || '',
    client: taskData.client || '',
    clientCode: taskData.clientCode || '',
    property: taskData.property || '',
    email: taskData.email || '',
    cpf: taskData.cpf || '',
    observations: taskData.observations || '',
    prospectNotes: taskData.prospectNotes || '',
    propertyHectares: taskData.propertyHectares?.toString() || '',
    equipmentQuantity: taskData.equipmentQuantity?.toString() || '',
    familyProduct: taskData.familyProduct || ''
  };
  
  const isFormValid = validateForm(stringData, validationRules);
  
  // Validações específicas por tipo
  if (!isFormValid) {
    errors.push('Alguns campos obrigatórios não foram preenchidos corretamente');
  }
  
  // VALIDAÇÃO CRÍTICA: Motivo obrigatório para venda perdida
  if (taskData.salesConfirmed === false && (!taskData.prospectNotes || taskData.prospectNotes.trim() === '')) {
    errors.push('O motivo da perda é obrigatório quando a venda é marcada como perdida');
  }
  
  // Validação de datas
  if (!taskData.startDate || !taskData.endDate) {
    errors.push('Data de início e fim são obrigatórias');
  } else if (taskData.endDate < taskData.startDate) {
    errors.push('Data de fim deve ser posterior à data de início');
  }
  
  // Validação de horários
  if (!taskData.startTime || !taskData.endTime) {
    errors.push('Horário de início e fim são obrigatórios');
  } else if (taskData.startTime >= taskData.endTime && 
             taskData.startDate.toDateString() === taskData.endDate.toDateString()) {
    errors.push('Horário de fim deve ser posterior ao horário de início');
  }
  
  // Validação específica para cada tipo de tarefa
  switch (taskType) {
    case 'field_visit':
      if (!taskData.propertyHectares || taskData.propertyHectares <= 0) {
        errors.push('Hectares da propriedade são obrigatórios para visitas de campo');
      }
      break;
      
    case 'workshop_checklist':
      if (!taskData.familyProduct) {
        errors.push('Família do produto é obrigatória para checklists de oficina');
      }
      if (!taskData.equipmentQuantity || taskData.equipmentQuantity <= 0) {
        errors.push('Quantidade de equipamentos é obrigatória para checklists de oficina');
      }
      break;
      
    case 'call':
      if (!taskData.prospectItems || taskData.prospectItems.length === 0) {
        errors.push('Pelo menos um produto deve ser configurado para ligações');
      }
      break;
  }
  
  // Validação de produtos selecionados
  const hasSelectedProducts = (taskData.checklist?.some(item => item.selected) || false) ||
                              (taskData.prospectItems?.some(item => item.selected) || false);
  
  if (!hasSelectedProducts) {
    errors.push('Pelo menos um produto/serviço deve ser selecionado');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Hook personalizado para gerenciar formulário de tarefa
// Opções padronizadas para motivo de perda
export const LOSS_REASONS = [
  'Preço',
  'Falta de Produto',
  'Paralelo',
  'Duplo Domicilio',
  'Outros'
] as const;

// Função para determinar status da tarefa baseado na venda
export const determineTaskStatus = (salesConfirmed?: boolean | null): 'pending' | 'completed' => {
  // Automaticamente marca como completed quando há venda confirmada ou perdida
  if (salesConfirmed === true || salesConfirmed === false) {
    return 'completed';
  }
  return 'pending';
};

// Função para determinar tipo de venda
export const determineSalesType = (
  salesConfirmed?: boolean | null, 
  prospectItems?: ProductType[]
): 'prospect' | 'parcial' | 'ganho' | 'perdido' | null => {
  if (salesConfirmed === true) {
    if (prospectItems && prospectItems.length > 0) {
      return 'parcial'; // Tem produtos parciais selecionados
    } else {
      return 'ganho'; // Venda do valor total
    }
  } else if (salesConfirmed === false) {
    return 'perdido';
  }
  return 'prospect'; // Em andamento
};

export const useTaskForm = (taskType: string, initialData?: Partial<Task>) => {
  const { validateForm, clearErrors, getFieldErrors, hasErrors } = useInputValidation();
  const { sanitizeText } = useInputSanitization();
  const { sanitizeTaskInput } = useInputSecurity();
  
  const [formData, setFormData] = useState<Partial<TaskFormData>>({
    name: '',
    responsible: '',
    client: '',
    clientCode: '',
    property: '',
    taskType: taskType as any,
    startDate: new Date(),
    endDate: new Date(),
    startTime: '08:00',
    endTime: '17:00',
    checklist: [],
    prospectItems: [],
    observations: '',
    priority: 'medium',
    reminders: [],
    photos: [],
    documents: [],
    initialKm: 0,
    finalKm: 0,
    isProspect: false,
    ...initialData
  });
  
  const updateField = (field: keyof TaskFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Limpar erros do campo quando alterado
    clearErrors(field);
  };
  
  const validateTask = () => {
    return validateTaskData(formData, taskType, validateForm);
  };
  
  const sanitizeAndPrepareData = (): Partial<Task> => {
    const sanitizedData = sanitizeTaskData(formData, sanitizeText, sanitizeTaskInput);
    
    // Determinar status e tipo de venda usando funções padronizadas
    const finalStatus = determineTaskStatus(sanitizedData.salesConfirmed);
    const salesType = determineSalesType(sanitizedData.salesConfirmed, sanitizedData.prospectItems);
    const totalValue = calculateTaskTotalValue(sanitizedData);
    
    return {
      ...sanitizedData,
      status: finalStatus,
      salesValue: totalValue > 0 ? totalValue : undefined,
      salesType: salesType as any,
      createdAt: new Date(),
      updatedAt: new Date()
    } as Partial<Task>;
  };
  
  return {
    formData,
    updateField,
    validateTask,
    sanitizeAndPrepareData,
    getFieldErrors,
    hasErrors,
    clearErrors
  };
};