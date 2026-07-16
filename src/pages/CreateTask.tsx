import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, MapPin, User, Building, CheckSquare, Camera, FileText, Plus, X, Download, RotateCcw, Phone, Wrench, Search, Check, CheckCircle, XCircle, Settings, ShoppingCart } from 'lucide-react';
import { Task, ProductType, Reminder } from '@/types/task';
import { cn } from '@/lib/utils';
import { PhotoUpload } from '@/components/PhotoUpload';
import { CheckInLocation } from '@/components/CheckInLocation';
import { useOffline } from '@/hooks/useOffline';
import { useTasksOptimized, useFiliais } from '@/hooks/useTasksOptimized';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { toast } from '@/components/ui/use-toast';
import { ReportExporter } from '@/components/ReportExporter';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { getSalesValueAsNumber } from '@/lib/securityUtils';
import { CLIENT_CODES } from '@/lib/clientCodes';
import {
  ClientInfoSection,
  ProductsOfferSection,
  SalesFunnelSection,
  ObservationsSection,
  PhotosCheckinSection,
  EquipmentParkSection,
} from '@/components/task-form/sections';
import { SectionHeader } from '@/components/task-form/sections/SectionHeader';
import { BasicInfoBlock } from '@/components/task-form/BasicInfoBlock';
import { EquipmentParkBlock } from '@/components/equipment';
import { CollapsibleProductsBlock } from '@/components/task-form/CollapsibleProductsBlock';

import { syncTaskEquipment } from '@/hooks/useClientEquipment';
import { User as UserIcon, Tractor, MessageSquare } from 'lucide-react';

interface CreateTaskProps {
  taskType?: 'field-visit' | 'call' | 'workshop-checklist';
}
const CreateTask: React.FC<CreateTaskProps> = ({
  taskType: propTaskType
}) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlTaskType = searchParams.get('type');

  // Estado para autocomplete de códigos de cliente - mover para o topo
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredClientCodes, setFilteredClientCodes] = useState<{
    code: string;
    name: string;
  }[]>([]);

  // Estado para autocomplete do nome do cliente
  const [showClientNameDropdown, setShowClientNameDropdown] = useState(false);
  const [filteredClientNames, setFilteredClientNames] = useState<{
    code: string;
    name: string;
  }[]>([]);

  // Função para carregar dados anteriores do cliente (autofill)
  const loadPreviousClientData = async (clientCode: string, clientName?: string) => {
    try {
      const { fetchPreviousClientData } = await import('@/lib/clientAutofill');
      const previous = await fetchPreviousClientData(clientCode, clientName);
      if (!previous) return;

      setTask(prev => ({
        ...prev,
        responsible: prev.responsible || previous.responsible || '',
        phone: prev.phone || previous.phone || '',
        email: prev.email || previous.email || '',
        property: prev.property || previous.property || '',
        filialAtendida: prev.filialAtendida || previous.filial_atendida || prev.filialAtendida,
        propertyHectares: prev.propertyHectares || previous.propertyhectares || prev.propertyHectares,
      }));

      toast({
        title: 'Dados preenchidos automaticamente',
        description: 'Últimos dados deste cliente foram carregados. Edite se necessário.',
      });
    } catch (error) {
      console.error('Erro ao carregar dados anteriores:', error);
    }
  };


  // Códigos de cliente reais (compartilhados com outros formulários)
  const clientCodes = CLIENT_CODES;
  const {
    profile
  } = useProfile();

  // Mapear tipos da URL para tipos internos
  const getTaskCategoryFromUrl = (urlType: string | null): 'field-visit' | 'call' | 'workshop-checklist' => {
    switch (urlType) {
      case 'farm_visit':
        return 'field-visit';
      case 'client_call':
        return 'call';
      case 'workshop_checklist':
        return 'workshop-checklist';
      default:
        return 'field-visit';
    }
  };

  // Estado para controlar o tipo de tarefa selecionado
  const [selectedTaskType, setSelectedTaskType] = useState<'field-visit' | 'call' | 'workshop-checklist' | null>(null);
  // Inicializar com URL ou prop se existir
  useEffect(() => {
    if (propTaskType) {
      setSelectedTaskType(propTaskType);
      setTaskCategory(propTaskType);
    } else if (urlTaskType) {
      const initialType = getTaskCategoryFromUrl(urlTaskType);
      setSelectedTaskType(initialType);
      setTaskCategory(initialType);
    }
  }, [urlTaskType, propTaskType]);

  // Função para alterar o tipo de tarefa
  const handleTaskTypeChange = (newType: 'field-visit' | 'call' | 'workshop-checklist') => {
    setSelectedTaskType(newType);
    setTaskCategory(newType);

    // Atualizar o taskType no estado da tarefa
    setTask(prev => ({
      ...prev,
      taskType: getTaskTypeFromCategory(newType)
    }));
  };

  // Função para obter o título da tarefa
  const getTaskTitle = (category: 'field-visit' | 'call' | 'workshop-checklist'): string => {
    switch (category) {
      case 'field-visit':
        return 'Visita a Fazenda';
      case 'call':
        return 'Ligação para Cliente';
      case 'workshop-checklist':
        return 'Checklist da Oficina';
      default:
        return 'Nova Tarefa';
    }
  };
  const [taskCategory, setTaskCategory] = useState<'field-visit' | 'call' | 'workshop-checklist'>(selectedTaskType);
  const [whatsappWebhook, setWhatsappWebhook] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionLockRef = useRef(false);
  const lastSubmissionRef = useRef<string>('');
  const {
    isOnline,
    saveTaskOffline,
    addToSyncQueue
  } = useOffline();
  const {
    createTask
  } = useTasksOptimized();
  const { data: filiais = [] } = useFiliais();
  // Mapear taskCategory para taskType
  const getTaskTypeFromCategory = (category: 'field-visit' | 'call' | 'workshop-checklist'): 'prospection' | 'ligacao' | 'checklist' => {
    switch (category) {
      case 'field-visit':
        return 'prospection';
      case 'call':
        return 'ligacao';
      case 'workshop-checklist':
        return 'checklist';
      default:
        return 'prospection';
    }
  };
  const [task, setTask] = useState<Partial<Task>>({
    name: '',
    responsible: '',
    client: '',
    clientCode: '',
    property: '',
    filial: '',
    cpf: '',
    email: '',
    taskType: getTaskTypeFromCategory(getTaskCategoryFromUrl(urlTaskType)),
    priority: 'medium',
    observations: '',
    startDate: new Date(),
    endDate: new Date(),
    startTime: '09:00',
    endTime: '17:00',
    initialKm: 0,
    finalKm: 0,
    checklist: [],
    reminders: [],
    photos: [],
    documents: [],
    isProspect: true,
    salesConfirmed: undefined
  });

  // Definir filial automaticamente quando o perfil carregar
  useEffect(() => {
    if (profile) {
      console.log('🔄 Profile carregado, definindo filial:', profile.filial_nome);
      setTask(prev => ({
        ...prev,
        filial: profile.filial_nome || 'Não informado' // Usar nome da filial, não ID
      }));
    }
  }, [profile]);

  // Inicializar lista de equipamentos vazia
  const initializeEquipmentList = () => {
    return [];
  };
  const [reminders, setReminders] = useState<Reminder[]>([]);
  // IDs de equipamentos do parque (cadastro mestre) selecionados na visita
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [equipmentList, setEquipmentList] = useState<{
    id: string;
    familyProduct: string;
    quantity: number;
  }[]>(initializeEquipmentList());
  const [newReminder, setNewReminder] = useState({
    title: '',
    description: '',
    date: new Date(),
    time: '09:00'
  });

  // Estado para controlar campos condicionais das perguntas da ligação
  const [callQuestions, setCallQuestions] = useState({
    lubricants: {
      needsProduct: false,
      quantity: 0,
      unitValue: 0,
      totalValue: 0
    },
    tires: {
      needsProduct: false,
      quantity: 0,
      unitValue: 0,
      totalValue: 0
    },
    filters: {
      needsProduct: false,
      quantity: 0,
      unitValue: 0,
      totalValue: 0
    },
    batteries: {
      needsProduct: false,
      quantity: 0,
      unitValue: 0,
      totalValue: 0
    },
    parts: {
      needsProduct: false,
      quantity: 0,
      unitValue: 0,
      totalValue: 0
    },
    silobag: {
      needsProduct: false,
      quantity: 0,
      unitValue: 0,
      totalValue: 0
    },
    disk: {
      needsProduct: false,
      quantity: 0,
      unitValue: 0,
      totalValue: 0
    }
  });

  // Estado para o checklist (deve ser declarado antes das funções que o usam)
  const [checklist, setChecklist] = useState<ProductType[]>([]);
  const [callProducts, setCallProducts] = useState<ProductType[]>([]);

  // Workshop Checklist — snapshot da máquina auditada
  const [checklistMachine, setChecklistMachine] = useState<{
    tipo: string; modelo: string; chassi_serie: string; ano: string; horimetro: string; status: string; observacao: string;
  }>({ tipo: '', modelo: '', chassi_serie: '', ano: '', horimetro: '', status: 'ativo', observacao: '' });
  const [registerMachineInClient, setRegisterMachineInClient] = useState<boolean>(true);
  const updateChecklistItem = (id: string, patch: Partial<ProductType>) => {
    setChecklist(prev => prev.map(it => it.id === id ? { ...it, ...patch, selected: (patch.responseStatus ?? it.responseStatus) ? true : it.selected } : it));
  };


  // Função para calcular valor total automático
  const calculateTotalSalesValue = () => {
    let total = 0;

    // Somar valores dos produtos selecionados (todos os tipos de tarefa usam checklist)
    if (taskCategory === 'field-visit' || taskCategory === 'workshop-checklist' || taskCategory === 'call') {
      total += checklist.reduce((sum, item) => {
        return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
      }, 0);
    }

    // Somar valores das perguntas da ligação (mantido para compatibilidade)
    if (taskCategory === 'call') {
      total += Object.values(callQuestions).reduce((sum, item) => {
        return sum + (item.needsProduct ? item.totalValue : 0);
      }, 0);
    }

    // Somar produtos de venda parcial (prospectItems) se existirem
    if (task.prospectItems && task.prospectItems.length > 0) {
      total += task.prospectItems.reduce((sum, item) => {
        return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
      }, 0);
    }

    return total;
  };

  // Atualizar valor total automaticamente quando checklist muda (apenas se não há venda parcial ativa)
  useEffect(() => {
    // Só atualizar automaticamente se não há prospectItems (venda parcial) ativas
    if (!task.prospectItems || task.prospectItems.length === 0) {
      const totalValue = calculateTotalSalesValue();
      setTask(prev => ({
        ...prev,
        salesValue: totalValue
      }));
    }
  }, [checklist, callQuestions, callProducts, taskCategory, task.prospectItems]);

  // REMOVER este useEffect que estava alterando o valor quando prospectItems mudava
  // useEffect(() => {
  //   if (task.prospectItems && task.prospectItems.length > 0) {
  //     const partialValue = task.prospectItems.reduce((sum, item) => {
  //       return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
  //     }, 0);
  //     
  //     console.log('DEBUG: Calculando valor parcial:', partialValue, 'para produtos:', task.prospectItems);
  //     
  //     setTask(prev => ({
  //       ...prev,
  //       salesValue: partialValue
  //     }));
  //   }
  // }, [task.prospectItems]);

  // Função para atualizar perguntas da ligação
  const updateCallQuestion = (product: keyof typeof callQuestions, field: 'needsProduct' | 'quantity' | 'unitValue', value: boolean | number) => {
    setCallQuestions(prev => {
      const updated = {
        ...prev,
        [product]: {
          ...prev[product],
          [field]: value
        }
      };

      // Calcular valor total do produto específico
      const productData = updated[product];
      const totalValue = productData.quantity * productData.unitValue;
      updated[product] = {
        ...productData,
        totalValue: totalValue
      };
      return updated;
    });
  };
  const fieldVisitProducts: ProductType[] = [{
    id: '1',
    name: 'Pneus',
    category: 'tires',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '2',
    name: 'Lubrificantes',
    category: 'lubricants',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '3',
    name: 'Óleos',
    category: 'oils',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '4',
    name: 'Graxas',
    category: 'greases',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '5',
    name: 'Baterias',
    category: 'batteries',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '7',
    name: 'Silo Bolsa',
    category: 'other',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '8',
    name: 'Cool Gard',
    category: 'other',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '9',
    name: 'Disco',
    category: 'other',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '10',
    name: 'Peças',
    category: 'parts',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '11',
    name: 'Serviços',
    category: 'services',
    selected: false,
    quantity: 0,
    price: 0,
    observations: '',
    photos: []
  }];
  const workshopChecklistItems: ProductType[] = [
    { id: '1', name: 'Verificação de Óleo do Motor', category: 'oils', selected: false, quantity: 1, price: 0, observations: '', photos: [], responseStatus: null, responseNotes: '' },
    { id: '2', name: 'Nível de Óleo da Transmissão', category: 'oils', selected: false, quantity: 1, price: 0, observations: '', photos: [], responseStatus: null, responseNotes: '' },
    { id: '3', name: 'Verificação de Pneus', category: 'tires', selected: false, quantity: 1, price: 0, observations: '', photos: [], responseStatus: null, responseNotes: '' },
    { id: '4', name: 'Teste de Bateria', category: 'batteries', selected: false, quantity: 1, price: 0, observations: '', photos: [], responseStatus: null, responseNotes: '' },
    { id: '5', name: 'Verificação de Luzes', category: 'other', selected: false, quantity: 1, price: 0, observations: '', photos: [], responseStatus: null, responseNotes: '' },
    { id: '6', name: 'Inspeção de Suspensão', category: 'other', selected: false, quantity: 1, price: 0, observations: '', photos: [], responseStatus: null, responseNotes: '' },
    { id: '7', name: 'Verificação de Líquidos', category: 'oils', selected: false, quantity: 1, price: 0, observations: '', photos: [], responseStatus: null, responseNotes: '' },
    { id: '8', name: 'Limpeza Geral', category: 'other', selected: false, quantity: 1, price: 0, observations: '', photos: [], responseStatus: null, responseNotes: '' },
  ];
  const getProductsForCategory = () => {
    switch (taskCategory) {
      case 'field-visit':
        return fieldVisitProducts;
      case 'call':
        return fieldVisitProducts; // Use the same products for call tasks
      case 'workshop-checklist':
        return workshopChecklistItems;
      default:
        return [];
    }
  };
  // Inicializar checklist com produtos baseados na categoria
  useEffect(() => {
    setChecklist(getProductsForCategory());
    setCallProducts(fieldVisitProducts);
  }, [taskCategory]);

  // Cache para busca por CPF (evita repetir full scan no Supabase para o mesmo CPF).
  const cpfSearchCacheRef = useRef<Map<string, { client: string; responsible: string; property: string; observations: string; ts: number }>>(new Map());
  const CPF_CACHE_TTL_MS = 5 * 60 * 1000;

  const searchPreviousDataByCPF = async (cpf: string) => {
    const normalized = cpf.replace(/\D/g, '');
    if (!normalized || normalized.length < 11) return;
    try {
      const cached = cpfSearchCacheRef.current.get(normalized);
      if (cached && Date.now() - cached.ts < CPF_CACHE_TTL_MS) {
        setTask(prev => ({
          ...prev,
          client: cached.client || prev.client,
          responsible: profile?.name || cached.responsible || prev.responsible,
          property: cached.property || prev.property,
          observations: cached.observations || prev.observations
        }));
        toast({ title: "📋 Dados encontrados", description: "Informações do CPF (cache)." });
        return;
      }
      const { data: tasks } = await supabase
        .from('tasks')
        .select('client, responsible, property, observations')
        .ilike('observations', `%${normalized}%`)
        .order('created_at', { ascending: false })
        .limit(1);
      if (tasks && tasks.length > 0) {
        const lastTask = tasks[0];
        let hectares = '';
        if (lastTask.observations) {
          const hectaresMatch = lastTask.observations.match(/hectares?\s*:?\s*(\d+(?:[.,]\d+)?)/i);
          if (hectaresMatch) hectares = hectaresMatch[1];
        }
        const observationsText = hectares ? `Hectares: ${hectares}` : '';
        cpfSearchCacheRef.current.set(normalized, {
          client: lastTask.client || '',
          responsible: lastTask.responsible || '',
          property: lastTask.property || '',
          observations: observationsText,
          ts: Date.now(),
        });
        setTask(prev => ({
          ...prev,
          client: lastTask.client || '',
          responsible: profile?.name || lastTask.responsible || '',
          property: lastTask.property || '',
          observations: observationsText
        }));
        toast({ title: "📋 Dados encontrados", description: "Informações do CPF foram preenchidas automaticamente" });
      }
    } catch (error) {
      console.error('Erro ao buscar dados anteriores:', error);
    }
  };

  // SECURITY FIX: Removed saveCPFData function
  // Previously stored sensitive customer CPF data in unencrypted localStorage
  // This violated LGPD compliance and exposed sensitive PII to XSS attacks

  // Função para resetar todos os campos do formulário
  const resetAllFields = () => {
    // Reset task state (mantém apenas filial)
    setTask({
      name: '',
      responsible: profile?.name || '',
      client: '',
      property: '',
      filial: profile?.filial_nome || 'Não informado',
      cpf: '',
      email: '',
      taskType: getTaskTypeFromCategory(taskCategory),
      priority: 'medium',
      observations: '',
      startDate: new Date(),
      endDate: new Date(),
      startTime: '09:00',
      endTime: '17:00',
      initialKm: 0,
      finalKm: 0,
      checklist: [],
      reminders: [],
      photos: [],
      documents: [],
      isProspect: true,
      salesConfirmed: undefined,
      salesValue: 0,
      prospectItems: [],
      prospectNotes: '',
      propertyHectares: 0,
      equipmentQuantity: 0,
      familyProduct: ''
    });

    // Reset call questions
    setCallQuestions({
      lubricants: {
        needsProduct: false,
        quantity: 0,
        unitValue: 0,
        totalValue: 0
      },
      tires: {
        needsProduct: false,
        quantity: 0,
        unitValue: 0,
        totalValue: 0
      },
      filters: {
        needsProduct: false,
        quantity: 0,
        unitValue: 0,
        totalValue: 0
      },
      batteries: {
        needsProduct: false,
        quantity: 0,
        unitValue: 0,
        totalValue: 0
      },
      parts: {
        needsProduct: false,
        quantity: 0,
        unitValue: 0,
        totalValue: 0
      },
      silobag: {
        needsProduct: false,
        quantity: 0,
        unitValue: 0,
        totalValue: 0
      },
      disk: {
        needsProduct: false,
        quantity: 0,
        unitValue: 0,
        totalValue: 0
      }
    });

    // Reset product lists
    setChecklist(getProductsForCategory());
    setCallProducts(fieldVisitProducts);

    // Reset equipment list
    setEquipmentList(initializeEquipmentList());

    // Reset reminders
    setReminders([]);
    setNewReminder({
      title: '',
      description: '',
      date: new Date(),
      time: '09:00'
    });

    // Reset WhatsApp webhook
    setWhatsappWebhook('');
  };

  // Atualiza o checklist e taskType quando o tipo de tarefa muda
  useEffect(() => {
    setChecklist(getProductsForCategory());
    setTask(prev => ({
      ...prev,
      taskType: getTaskTypeFromCategory(taskCategory)
    }));
  }, [taskCategory]);
  const handleChecklistChange = (id: string, checked: boolean) => {
    setChecklist(prev => {
      const updated = prev.map(item => item.id === id ? {
        ...item,
        selected: checked
      } : item);
      return updated;
    });
  };
  const handleProductChange = (id: string, field: keyof ProductType, value: any) => {
    setChecklist(prev => {
      const updated = prev.map(item => item.id === id ? {
        ...item,
        [field]: value
      } : item);
      return updated;
    });
  };
  const handleProductPhotoChange = (productId: string, photos: string[]) => {
    setChecklist(prev => prev.map(item => item.id === productId ? {
      ...item,
      photos
    } : item));
  };

  // Função para atualizar produtos do prospectItems (venda parcial)
  const handleProspectItemChange = (index: number, field: 'selected' | 'quantity' | 'price', value: boolean | number) => {
    console.log('DEBUG: Atualizando produto da venda parcial -', field, ':', value, 'para índice:', index);
    const updatedItems = [...(task.prospectItems || [])];
    if (field === 'selected') {
      updatedItems[index] = {
        ...updatedItems[index],
        selected: value as boolean
      };
    } else if (field === 'quantity') {
      updatedItems[index] = {
        ...updatedItems[index],
        quantity: value as number
      };
    } else if (field === 'price') {
      updatedItems[index] = {
        ...updatedItems[index],
        price: value as number
      };
    }
    console.log('DEBUG: Produto atualizado:', updatedItems[index]);
    setTask(prev => ({
      ...prev,
      prospectItems: updatedItems
    }));
  };

  // Funções para gerenciar produtos da ligação
  const handleCallProductChange = (id: string, checked: boolean) => {
    setCallProducts(prev => prev.map(item => item.id === id ? {
      ...item,
      selected: checked
    } : item));
  };
  const handleCallProductUpdate = (id: string, field: keyof ProductType, value: any) => {
    setCallProducts(prev => prev.map(item => item.id === id ? {
      ...item,
      [field]: value
    } : item));
  };
  const handleCallProductPhotoChange = (productId: string, photos: string[]) => {
    setCallProducts(prev => prev.map(item => item.id === productId ? {
      ...item,
      photos
    } : item));
  };
  const addReminder = () => {
    if (newReminder.title.trim()) {
      const reminder: Reminder = {
        id: crypto.randomUUID(),
        title: newReminder.title,
        description: newReminder.description,
        date: newReminder.date,
        time: newReminder.time,
        completed: false
      };
      setReminders(prev => [...prev, reminder]);
      setNewReminder({
        title: '',
        description: '',
        date: new Date(),
        time: '09:00'
      });
    }
  };
  const removeReminder = (id: string) => {
    setReminders(prev => prev.filter(r => r.id !== id));
  };

  // Funções para gerenciar lista de equipamentos
  const addEquipment = () => {
    const newEquipment = {
      id: crypto.randomUUID(),
      familyProduct: '',
      // Campo vazio para o usuário preencher
      quantity: 0 // Campo vazio para o usuário preencher
    };
    setEquipmentList(prev => [...prev, newEquipment]);
  };
  const updateEquipment = (id: string, field: 'familyProduct' | 'quantity', value: string | number) => {
    setEquipmentList(prev => prev.map(item => item.id === id ? {
      ...item,
      [field]: value
    } : item));
  };
  const removeEquipment = (id: string) => {
    setEquipmentList(prev => prev.filter(item => item.id !== id));
  };
  const handleCheckIn = (location: {
    lat: number;
    lng: number;
    timestamp: Date;
  }) => {
    setTask(prev => ({
      ...prev,
      checkInLocation: location
    }));
  };
  const sendToWhatsApp = async (taskData: any) => {
    if (!whatsappWebhook) return;
    try {
      const message = `🚀 *Nova Tarefa Criada*

📋 *Nome:* ${taskData.name}
👤 *Responsável:* ${taskData.responsible}
🏢 *Cliente:* ${taskData.client}
📅 *Data:* ${taskData.startDate ? format(taskData.startDate, "PPP", {
        locale: ptBR
      }) : 'Não definida'}
⏰ *Horário:* ${taskData.startTime} - ${taskData.endTime}
🎯 *Prioridade:* ${taskData.priority}

${taskData.observations ? `📝 *Observações:* ${taskData.observations}` : ''}`;
      await fetch(whatsappWebhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        mode: "no-cors",
        body: JSON.stringify({
          message: message,
          timestamp: new Date().toISOString(),
          taskData: taskData
        })
      });
    } catch (error) {
      console.error("Erro ao enviar para WhatsApp:", error);
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent double submissions with debounce protection
    if (submissionLockRef.current || isSubmitting) {
      console.log('Submission blocked - already in progress');
      return;
    }

    // Generate unique submission fingerprint for duplicate detection
    const submissionHash = `${task.client}_${task.property}_${task.startDate}_${task.startTime}_${Date.now()}`;

    // Check if this is a duplicate submission (within 5 seconds)
    if (lastSubmissionRef.current === submissionHash) {
      console.log('Duplicate submission blocked');
      toast({
        title: "Submissão duplicada",
        description: "Esta tarefa já foi enviada recentemente",
        variant: "destructive"
      });
      return;
    }

    // Lock submission
    submissionLockRef.current = true;
    setIsSubmitting(true);
    lastSubmissionRef.current = submissionHash;

    // Validação completa de campos obrigatórios
    const requiredFields = [{
      field: task.client?.trim(),
      name: 'Cliente'
    }, {
      field: task.property?.trim(),
      name: 'Propriedade'
    }, {
      field: task.responsible?.trim(),
      name: 'Responsável'
    }, {
      field: task.filial?.trim(),
      name: 'Filial'
    }];

    // Verificar campos obrigatórios baseados no tipo de tarefa
    if (taskCategory === 'field-visit') {
      // Campos opcionais removidos - email e hectares não são mais obrigatórios
    } else if (taskCategory === 'call') {
      // Filial Atendida é obrigatória para ligações
      requiredFields.push({
        field: task.filialAtendida?.trim(),
        name: 'Filial Atendida'
      });
    }

    // Verificar se algum campo obrigatório está vazio
    const missingField = requiredFields.find(({
      field
    }) => !field);
    if (missingField) {
      submissionLockRef.current = false;
      setIsSubmitting(false);
      toast({
        title: "Campo obrigatório",
        description: `O campo "${missingField.name}" é obrigatório`,
        variant: "destructive"
      });
      return;
    }

    // Validação obrigatória do status da oportunidade
    if (task.salesConfirmed === undefined && !task.isProspect) {
      submissionLockRef.current = false;
      setIsSubmitting(false);
      toast({
        title: "Campo obrigatório",
        description: "Selecione o status da oportunidade (Prospect, Vendas Total, Vendas Parcial ou Venda Perdida)",
        variant: "destructive"
      });
      return;
    }

    // Validação obrigatória da filial do usuário
    if (!profile?.filial_id) {
      submissionLockRef.current = false;
      setIsSubmitting(false);
      toast({
        title: "Filial não configurada",
        description: "Usuário deve ter uma filial configurada para criar tarefas. Entre em contato com o administrador.",
        variant: "destructive"
      });
      return;
    }

    // Capturar data e hora atual exatos no momento da criação
    const now = new Date();
    const currentTime = format(now, 'HH:mm');
    const taskData = {
      ...task,
      taskType: getTaskTypeFromCategory(taskCategory),
      // Garantir que taskType está correto
      responsible: profile?.name || 'Vendedor',
      // SEMPRE usar o nome do vendedor logado
      filial_id: profile?.filial_id,
      // Usar ID da filial do profile
      startDate: now,
      // Data atual exata
      endDate: now,
      // Data atual exata
      startTime: currentTime,
      // Horário atual exato
      endTime: currentTime,
      // Horário atual exato
      checklist: taskCategory === 'workshop-checklist'
        ? checklist.filter(item => item.responseStatus)
        : checklist.filter(item => item.selected),
      reminders,
      equipmentList,
      ...(taskCategory === 'workshop-checklist' ? {
        checklistMachine,
        registerMachineInClient,
      } : {})
    };
    try {
      const finalTaskData = {
        ...taskData,
        responsible: profile?.name || 'Vendedor',
        // SEMPRE nome do vendedor logado
        filial_id: profile?.filial_id,
        // ID da filial do profile
        createdAt: now,
        updatedAt: now,
        status: 'pending' as const,
        createdBy: profile?.name || 'Usuário'
      };

      // Use the useTasks hook which has built-in duplicate prevention
      console.log('Creating task with data:', finalTaskData);
      const createdTask: any = await createTask(finalTaskData);

      // Vincular equipamentos selecionados do parque (cadastro mestre) à task
      if (createdTask?.id && selectedEquipmentIds.length > 0) {
        try {
          await syncTaskEquipment(createdTask.id, selectedEquipmentIds);
        } catch (linkErr) {
          console.warn('Falha ao vincular equipamentos à task:', linkErr);
        }
      }

      // Enviar para WhatsApp se webhook configurado
      if (whatsappWebhook) {
        await sendToWhatsApp(finalTaskData);
      }

      // Reset completo do formulário e voltar à seleção de tipo de tarefa
      resetAllFields();

      // Reset do tipo de tarefa selecionado para voltar à tela inicial
      setSelectedTaskType(null);
      setTaskCategory('field-visit');

      // Navegar para a página inicial de novas tarefas
      navigate('/create-task');

      // Scroll para o topo da página
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
      toast({
        title: "✅ Tarefa Criada com Sucesso!",
        description: isOnline ? "Tarefa salva no servidor. Você pode criar uma nova tarefa." : "Tarefa salva offline - será sincronizada quando conectar. Você pode criar uma nova tarefa."
      });
    } catch (error) {
      console.error('Erro ao criar tarefa:', error);
      toast({
        title: "Erro",
        description: "Não foi possível criar a tarefa",
        variant: "destructive"
      });
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  };
  const handleSaveDraft = async () => {
    const draftData = {
      ...task,
      taskType: getTaskTypeFromCategory(taskCategory),
      checklist: checklist.filter(item => item.selected),
      reminders,
      equipmentList,
      isDraft: true
    };

    // SECURITY FIX: Removed CPF data storage from localStorage
    // Previously stored sensitive customer data in unencrypted localStorage

    // SECURITY FIX: Save drafts to Supabase instead of localStorage
    // This uses the task_drafts table with proper RLS and auto-expiry
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: draftError } = await (supabase as any)
          .from('task_drafts')
          .insert({
            user_id: user.id,
            draft_data: draftData,
            category: taskCategory
          });
        
        if (draftError) {
          console.error('Erro ao salvar rascunho:', draftError);
          toast({
            title: "⚠️ Erro ao Salvar",
            description: "Não foi possível salvar o rascunho. Tente novamente.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "💾 Rascunho Salvo",
            description: "Suas alterações foram salvas com segurança!"
          });
        }
      }
    } catch (error) {
      console.error('Erro ao salvar rascunho:', error);
    }
  };

  // Componente para renderizar campos de valor unitário e total
  const renderValueFields = (product: keyof typeof callQuestions) => {
    const productData = callQuestions[product];
    return <div className="ml-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Quantidade</Label>
            <Input type="number" placeholder="Digite a quantidade" value={productData.quantity || ''} onChange={e => updateCallQuestion(product, 'quantity', parseInt(e.target.value) || 0)} min="0" step="1" />
          </div>
          <div className="space-y-2">
            <Label>Valor Unitário (R$)</Label>
            <div className="relative">
              <Input type="text" placeholder="0,00" className="pl-8" value={productData.unitValue ? new Intl.NumberFormat('pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }).format(productData.unitValue) : ''} onChange={e => {
              const value = e.target.value.replace(/\D/g, '');
              const numericValue = parseFloat(value) / 100;
              updateCallQuestion(product, 'unitValue', isNaN(numericValue) ? 0 : numericValue);
            }} />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Valor Total (R$)</Label>
            <div className="relative">
              <Input type="text" className="pl-8 bg-muted cursor-not-allowed" value={productData.totalValue ? new Intl.NumberFormat('pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }).format(productData.totalValue) : '0,00'} readOnly />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            </div>
          </div>
        </div>
      </div>;
  };
  return <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
      <div>
        
        
        {/* Seletor de Tipo de Tarefa - só mostra se não há taskType via prop */}
        {!propTaskType && <div className="mt-8 p-6 bg-card/50 border border-border/50 rounded-xl shadow-sm">
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold text-foreground mb-2">Gestão de Vendas de Peças</h2>
              <p className="text-muted-foreground text-sm sm:text-base">Selecione o tipo de tarefa que deseja criar:</p>
            </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Button type="button" variant="outline" className="h-auto p-6 flex-col gap-3 border-success/20 hover:border-success/40 hover:bg-success/5" onClick={() => window.location.href = '/create-field-visit'}>
              <MapPin className="h-8 w-8 text-success" />
              <div className="text-center">
                <div className="font-semibold">Visita à Fazenda</div>
                <div className="text-sm opacity-80">Prospecção de clientes</div>
              </div>
            </Button>
            
            <Button type="button" variant="outline" className="h-auto p-6 flex-col gap-3 border-primary/20 hover:border-primary/40 hover:bg-primary/5" onClick={() => window.location.href = '/create-call'}>
              <Phone className="h-8 w-8 text-primary" />
              <div className="text-center">
                <div className="font-semibold">Ligação</div>
                <div className="text-sm opacity-80">Contato telefônico</div>
              </div>
            </Button>
            
            <Button type="button" variant="outline" className="h-auto p-6 flex-col gap-3 border-warning/20 hover:border-warning/40 hover:bg-warning/5" onClick={() => window.location.href = '/create-workshop-checklist'}>
              <Wrench className="h-8 w-8 text-warning" />
              <div className="text-center">
                <div className="font-semibold">Checklist Oficina</div>
                <div className="text-sm opacity-80">Verificação de produtos</div>
              </div>
            </Button>

            <Button type="button" variant="outline" className="h-auto p-6 flex-col gap-3 border-warning/20 hover:border-warning/40 hover:bg-warning/5" onClick={() => window.location.href = '/create-technical-visit'}>
              <Settings className="h-8 w-8 text-warning" />
              <div className="text-center">
                <div className="font-semibold">Visita Técnica</div>
                <div className="text-sm opacity-80">Atendimento e oportunidade técnica</div>
              </div>
            </Button>
          </div>
        </div>}

        {(selectedTaskType || propTaskType) && <>
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-2">
              {getTaskTitle(selectedTaskType || propTaskType!)}
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base mb-4">
              {(selectedTaskType || propTaskType) === 'field-visit' ? 'Criar uma nova visita à fazenda' : (selectedTaskType || propTaskType) === 'call' ? 'Registrar uma nova ligação para cliente' : 'Criar um novo checklist da oficina'}
            </p>
          </>}
      </div>


      {(selectedTaskType || propTaskType) && <form onSubmit={handleSubmit}>

        <div className="grid grid-cols-1 gap-6">
          {/* Informações Básicas */}
          {/* Informações Básicas (bloco padronizado) */}
          <BasicInfoBlock
            contactName={task.responsible || ''}
            onContactNameChange={(v) => setTask(prev => ({ ...prev, responsible: v }))}
            showFunction
            contactFunction={task.function || ''}
            onContactFunctionChange={(v) => setTask(prev => ({ ...prev, function: v, functionOther: v !== 'Outros' ? '' : prev.functionOther }))}
            contactFunctionOther={task.functionOther || ''}
            onContactFunctionOtherChange={(v) => setTask(prev => ({ ...prev, functionOther: v }))}
            phone={task.phone || ''}
            onPhoneChange={(v) => setTask(prev => ({ ...prev, phone: v }))}
            clientCode={task.clientCode || ''}
            onClientCodeChange={(v) => setTask(prev => ({ ...prev, clientCode: v }))}
            clientName={task.client || ''}
            onClientNameChange={(v) => setTask(prev => ({ ...prev, client: v }))}
            email={task.email || ''}
            onEmailChange={(v) => setTask(prev => ({ ...prev, email: v }))}
            property={task.property || ''}
            onPropertyChange={(v) => setTask(prev => ({ ...prev, property: v }))}
            vendedor={profile?.name || ''}
            filial={profile?.filial_nome || 'Não informado'}
            showFilialAtendida={taskCategory === 'call'}
            filialAtendidaRequired={taskCategory === 'call'}
            filialAtendida={task.filialAtendida || ''}
            onFilialAtendidaChange={(v) => setTask(prev => ({ ...prev, filialAtendida: v }))}
            filiais={filiais as any[]}
            onClientSelected={async (code, name) => {
              setTask(prev => ({ ...prev, clientCode: code, client: name }));
              await loadPreviousClientData(code, name);
            }}

          />

          {/* Parque de Máquinas — wrapper padronizado (igual Visita Técnica) */}
          {(taskCategory === 'field-visit' || taskCategory === 'call') && (
            <EquipmentParkSection>
              {taskCategory === 'field-visit' && (
                <div className="space-y-2">
                  <Label htmlFor="propertyHectares">Hectares da Propriedade</Label>
                  <Input
                    id="propertyHectares"
                    type="number"
                    min="0"
                    value={task.propertyHectares || ''}
                    onChange={e => setTask(prev => ({ ...prev, propertyHectares: parseInt(e.target.value) || undefined }))}
                    placeholder="Digite os hectares da propriedade"
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Carregado automaticamente ao selecionar o cliente. Selecione os equipamentos atendidos nesta visita.
              </p>
              <EquipmentParkBlock
                clientCode={task.clientCode || ''}
                clientName={task.client || ''}
                selectable
                selectedIds={selectedEquipmentIds}
                onSelectionChange={setSelectedEquipmentIds}
              />
            </EquipmentParkSection>
          )}


          {/* Bloco legacy "Lista de Equipamentos" removido para 'call' —
              o Parque de Máquinas (cadastro mestre) é exibido full-width abaixo. */}


          {/* Produtos / Checklist - field-visit usa ProductsOfferSection; workshop mantém Card legacy */}
          {taskCategory === 'field-visit' && (
            <ProductsOfferSection>
              <CollapsibleProductsBlock products={checklist}>
                <div className="space-y-6">
                  {checklist.map(item => <Card key={item.id} className="border border-border/50">
                      <CardContent className="p-4">
                        <div className="space-y-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox id={item.id} checked={item.selected} onCheckedChange={checked => handleChecklistChange(item.id, checked as boolean)} />
                            <Label htmlFor={item.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                              {item.name}
                            </Label>
                          </div>

                          {item.selected && <div className="ml-6 space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor={`qty-${item.id}`}>QTD</Label>
                                  <Input id={`qty-${item.id}`} type="number" min="0" value={item.quantity || ''} onChange={e => handleProductChange(item.id, 'quantity', parseInt(e.target.value) || 0)} placeholder="" />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`price-${item.id}`}>Valor Unitário</Label>
                                  <div className="relative">
                                    <Input id={`price-${item.id}`} type="text" value={item.price ? new Intl.NumberFormat('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            }).format(item.price) : ''} onChange={e => {
                              const value = e.target.value.replace(/\D/g, '');
                              const numericValue = parseFloat(value) / 100;
                              handleProductChange(item.id, 'price', isNaN(numericValue) ? 0 : numericValue);
                            }} placeholder="0,00" className="pl-8" />
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label>Valor Total</Label>
                                  <div className="relative">
                                    <Input type="text" className="pl-8 bg-muted cursor-not-allowed" value={item.selected && item.price && item.quantity ? new Intl.NumberFormat('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            }).format(item.price * item.quantity) : '0,00'} readOnly />
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor={`obs-${item.id}`}>Observações</Label>
                                <Textarea id={`obs-${item.id}`} value={item.observations || ''} onChange={e => handleProductChange(item.id, 'observations', e.target.value)} placeholder="Observações sobre este produto..." className="min-h-[80px]" />
                              </div>

                            </div>}
                        </div>
                      </CardContent>
                    </Card>)}
                </div>
              </CollapsibleProductsBlock>
            </ProductsOfferSection>
          )}

          {/* Workshop Checklist mantém layout próprio (não comercial) */}
          {taskCategory === 'workshop-checklist' && (
            <div className="space-y-6">
              {/* Bloco: Máquina do Checklist */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-5 w-5" />
                    Máquina do Checklist
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Tipo da máquina</Label>
                      <Input value={checklistMachine.tipo} onChange={e => setChecklistMachine(m => ({ ...m, tipo: e.target.value }))} placeholder="Ex: Trator, Colheitadeira" />
                    </div>
                    <div className="space-y-2">
                      <Label>Modelo</Label>
                      <Input value={checklistMachine.modelo} onChange={e => setChecklistMachine(m => ({ ...m, modelo: e.target.value }))} placeholder="Ex: 6110J" />
                    </div>
                    <div className="space-y-2">
                      <Label>Chassi / Série</Label>
                      <Input value={checklistMachine.chassi_serie} onChange={e => setChecklistMachine(m => ({ ...m, chassi_serie: e.target.value }))} placeholder="Chassi/Nº de série" />
                    </div>
                    <div className="space-y-2">
                      <Label>Ano</Label>
                      <Input value={checklistMachine.ano} onChange={e => setChecklistMachine(m => ({ ...m, ano: e.target.value }))} placeholder="Ex: 2022" />
                    </div>
                    <div className="space-y-2">
                      <Label>Horímetro</Label>
                      <Input value={checklistMachine.horimetro} onChange={e => setChecklistMachine(m => ({ ...m, horimetro: e.target.value }))} placeholder="Ex: 1245" />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <select
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={checklistMachine.status}
                        onChange={e => setChecklistMachine(m => ({ ...m, status: e.target.value }))}
                      >
                        <option value="ativo">Ativo</option>
                        <option value="inativo">Inativo</option>
                        <option value="manutencao">Em manutenção</option>
                        <option value="parada">Parada</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Observação da máquina</Label>
                    <Textarea
                      value={checklistMachine.observacao}
                      onChange={e => setChecklistMachine(m => ({ ...m, observacao: e.target.value }))}
                      placeholder="Observações sobre a máquina auditada..."
                      className="min-h-[70px]"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={registerMachineInClient}
                      onCheckedChange={c => setRegisterMachineInClient(Boolean(c))}
                    />
                    <span>Adicionar esta máquina ao cadastro do cliente</span>
                  </label>
                </CardContent>
              </Card>

              {/* Bloco: Itens do Checklist */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-5 w-5" />
                    Checklist da Oficina
                  </CardTitle>
                  {(checklistMachine.modelo || checklistMachine.chassi_serie || checklistMachine.ano || checklistMachine.horimetro) && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {checklistMachine.modelo && <span><strong>Modelo:</strong> {checklistMachine.modelo}</span>}
                      {checklistMachine.chassi_serie && <span><strong>Chassi:</strong> {checklistMachine.chassi_serie}</span>}
                      {checklistMachine.ano && <span><strong>Ano:</strong> {checklistMachine.ano}</span>}
                      {checklistMachine.horimetro && <span><strong>Horímetro:</strong> {checklistMachine.horimetro}</span>}
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {checklist.map(item => {
                      const status = item.responseStatus || null;
                      const options: { key: 'conforme'|'atencao'|'nao_conforme'|'na'; label: string; cls: string }[] = [
                        { key: 'conforme', label: 'Conforme', cls: 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600' },
                        { key: 'atencao', label: 'Atenção', cls: 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500' },
                        { key: 'nao_conforme', label: 'Não conforme', cls: 'bg-red-600 hover:bg-red-700 text-white border-red-600' },
                        { key: 'na', label: 'N/A', cls: 'bg-muted text-foreground border-muted' },
                      ];
                      return (
                        <Card key={item.id} className="border border-border/50">
                          <CardContent className="p-4 space-y-3">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                              <div className="text-sm font-medium">{item.name}</div>
                              <div className="flex flex-wrap gap-2">
                                {options.map(o => {
                                  const active = status === o.key;
                                  return (
                                    <button
                                      key={o.key}
                                      type="button"
                                      onClick={() => updateChecklistItem(item.id, { responseStatus: o.key })}
                                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${active ? o.cls : 'bg-background border-input hover:bg-muted'}`}
                                    >
                                      {o.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            {status && (
                              <div className="space-y-2">
                                <Label htmlFor={`notes-${item.id}`} className="text-xs text-muted-foreground">Observação (opcional)</Label>
                                <Textarea
                                  id={`notes-${item.id}`}
                                  value={item.responseNotes || ''}
                                  onChange={e => updateChecklistItem(item.id, { responseNotes: e.target.value })}
                                  placeholder="Descreva o que foi observado..."
                                  className="min-h-[60px]"
                                />
                              </div>
                            )}
                            {status && (
                              <div className="pt-2 border-t border-border/40">
                                <PhotoUpload
                                  photos={item.photos || []}
                                  onPhotosChange={(photos) => updateChecklistItem(item.id, { photos })}
                                  maxPhotos={6}
                                />
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}


          {/* Produtos para Ligação — wrapper modernizado (Fase 2) */}
          {taskCategory === 'call' && <ProductsOfferSection>
                <CollapsibleProductsBlock products={checklist}>
                <div className="space-y-6">



                  {checklist.map(item => <Card key={item.id} className="border border-border/50">
                      <CardContent className="p-4">
                        <div className="space-y-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox id={item.id} checked={item.selected} onCheckedChange={checked => handleChecklistChange(item.id, checked as boolean)} />
                            <Label htmlFor={item.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                              {item.name}
                            </Label>
                          </div>
                          
                          {item.selected && <div className="ml-6 space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor={`qty-${item.id}`}>QTD</Label>
                                  <Input id={`qty-${item.id}`} type="number" min="0" value={item.quantity || ''} onChange={e => handleProductChange(item.id, 'quantity', parseInt(e.target.value) || 0)} placeholder="" />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`price-${item.id}`}>Valor Unitário</Label>
                                  <div className="relative">
                                    <Input id={`price-${item.id}`} type="text" value={item.price ? new Intl.NumberFormat('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            }).format(item.price) : ''} onChange={e => {
                              const value = e.target.value.replace(/\D/g, '');
                              const numericValue = parseFloat(value) / 100;
                              handleProductChange(item.id, 'price', isNaN(numericValue) ? 0 : numericValue);
                            }} placeholder="0,00" className="pl-8" />
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label>Valor Total</Label>
                                  <div className="relative">
                                    <Input type="text" className="pl-8 bg-muted cursor-not-allowed" value={item.selected && item.price && item.quantity ? new Intl.NumberFormat('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            }).format(item.price * item.quantity) : '0,00'} readOnly />
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor={`obs-${item.id}`}>Observações</Label>
                                <Textarea id={`obs-${item.id}`} value={item.observations || ''} onChange={e => handleProductChange(item.id, 'observations', e.target.value)} placeholder="Observações sobre este produto..." className="min-h-[80px]" />
                              </div>
                            </div>}
                        </div>
                      </CardContent>
                    </Card>)}
                </div>
                </CollapsibleProductsBlock>
            </ProductsOfferSection>}

        </div>

        {/* Parque de Máquinas para 'call' agora renderizado inline acima (junto com field-visit). */}




        {/* Observações e Valores */}
        <Card className="mt-6">
          <CardHeader>
            {taskCategory === 'call' ? (
              <SectionHeader
                icon={MessageSquare}
                title="Observações & Funil de Vendas"
                description="Anotações, valor da oportunidade e status no funil"
                tone="primary"
              />
            ) : (
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Observações
              </CardTitle>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="observations">Observações</Label>
              <Textarea id="observations" value={task.observations} onChange={e => setTask(prev => ({
              ...prev,
              observations: e.target.value
            }))} placeholder="Observações sobre a tarefa..." className="min-h-[80px]" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="salesValue">Valor de Venda/Oportunidade (R$)</Label>
                <div className="relative">
                  <Input id="salesValue" type="text" value={calculateTotalSalesValue() ? new Intl.NumberFormat('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                }).format(calculateTotalSalesValue()) : '0,00'} className="pl-8 bg-muted cursor-not-allowed" readOnly />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {taskCategory === 'call' ? "Valor calculado com base nas perguntas da ligação" : "Valor calculado com base nos produtos/serviços selecionados"}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-base font-medium text-foreground mb-3 block flex items-center gap-2">
                    Status da Oportunidade
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* PROSPECT */}
                    <button type="button" className={`p-3 rounded-lg border text-left transition-colors ${task.isProspect && task.salesConfirmed === undefined ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background hover:border-primary/50'}`} onClick={() => setTask(prev => ({
                    ...prev,
                    isProspect: true,
                    salesConfirmed: undefined
                  }))}>
                      <div className="flex items-center gap-3">
                        <Search className="h-4 w-4" />
                        <div>
                          <div className="font-medium text-sm">Prospect</div>
                          <div className="text-xs text-muted-foreground">Cliente em análise</div>
                        </div>
                      </div>
                    </button>
                    
                    {/* VENDAS TOTAL */}
                    <button type="button" className={`p-3 rounded-lg border text-left transition-colors ${task.salesConfirmed === true && task.salesType === 'ganho' ? 'border-success bg-success/5 text-success' : 'border-border bg-background hover:border-success/50'}`} onClick={() => setTask(prev => ({
                    ...prev,
                    salesConfirmed: true,
                    salesType: 'ganho',
                    isProspect: true
                  }))}>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-4 w-4" />
                        <div>
                          <div className="font-medium text-sm">Vendas Total</div>
                          <div className="text-xs text-muted-foreground">Negócio fechado integralmente</div>
                        </div>
                      </div>
                    </button>
                    
                    {/* VENDAS PARCIAL */}
                    <button type="button" className={`p-3 rounded-lg border text-left transition-colors ${task.salesConfirmed === true && task.salesType === 'parcial' ? 'border-warning bg-warning/5 text-warning' : 'border-border bg-background hover:border-warning/50'}`} onClick={() => {
                      // Configurar produtos automaticamente para venda parcial
                      const selectedProducts = taskCategory === 'call' 
                        ? Object.entries(callQuestions).filter(([key, value]) => value.needsProduct).map(([key, value]) => ({
                            id: key,
                            name: key.charAt(0).toUpperCase() + key.slice(1),
                            category: 'other' as const,
                            selected: true,
                            quantity: value.quantity || 1,
                            price: value.unitValue || 0
                          }))
                        : checklist.filter(item => item.selected).map(item => ({
                            ...item,
                            selected: true,
                            quantity: item.quantity || 1,
                            price: item.price || 0
                          }));
                      
                      setTask(prev => ({
                        ...prev,
                        salesConfirmed: true,
                        salesType: 'parcial',
                        isProspect: true,
                        prospectItems: selectedProducts.length > 0 ? selectedProducts : prev.prospectItems
                      }));
                    }}>
                      <div className="flex items-center gap-3">
                        <ShoppingCart className="h-4 w-4" />
                        <div>
                          <div className="font-medium text-sm">Vendas Parcial</div>
                          <div className="text-xs text-muted-foreground">Negócio fechado parcialmente</div>
                        </div>
                      </div>
                    </button>
                    
                    {/* VENDA PERDIDA */}
                    <button type="button" className={`p-3 rounded-lg border text-left transition-colors ${task.salesConfirmed === false ? 'border-destructive bg-destructive/5 text-destructive' : 'border-border bg-background hover:border-destructive/50'}`} onClick={() => setTask(prev => ({
                    ...prev,
                    salesConfirmed: false,
                    isProspect: true
                  }))}>
                      <div className="flex items-center gap-3">
                        <XCircle className="h-4 w-4" />
                        <div>
                          <div className="font-medium text-sm">Venda Perdida</div>
                          <div className="text-xs text-muted-foreground">Negócio não realizado</div>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Campo de observação para venda perdida */}
                {task.salesConfirmed === false && task.isProspect && <div className="space-y-2">
                    <Label htmlFor="lossReason">Motivo da Perda</Label>
                    <select id="lossReason" value={task.prospectNotes || ''} onChange={e => setTask(prev => ({
                  ...prev,
                  prospectNotes: e.target.value,
                  prospectNotesJustification: e.target.value === 'Outros' ? prev.prospectNotesJustification : ''
                }))} className="w-full px-3 py-2 border border-input rounded-md bg-background">
                      <option value="">Selecione o motivo</option>
                      <option value="Preço">Preço</option>
                      <option value="Falta de Produto">Falta de Produto</option>
                      <option value="Paralelo">Paralelo</option>
                      <option value="Duplo Domicilio">Duplo Domicilio</option>
                      <option value="Outros">Outros</option>
                    </select>
                    
                    {/* Campo de justificativa para "Outros" */}
                    {task.prospectNotes === 'Outros' && (
                      <div className="space-y-2">
                        <Label htmlFor="otherJustification">Justificativa</Label>
                        <Textarea
                          id="otherJustification"
                          value={task.prospectNotesJustification || ''}
                          onChange={e => setTask(prev => ({
                            ...prev,
                            prospectNotesJustification: e.target.value
                          }))}
                          placeholder="Descreva o motivo..."
                          className="min-h-[80px]"
                        />
                      </div>
                    )}
                  </div>}

                {/* Opções para vendas parciais apenas */}
                {task.salesConfirmed === true && task.salesType === 'parcial' && <div className="space-y-4">

                     {/* Campo de valor para venda parcial */}
                     {task.prospectItems && task.prospectItems.length > 0 && <div className="space-y-4">
                         <div className="space-y-2">
                           <Label htmlFor="partialSaleValue">Valor da Venda Parcial (R$)</Label>
                           <div className="relative">
                             <Input id="partialSaleValue" type="text" value={task.prospectItems ? task.prospectItems.reduce((sum, item) => {
                        return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
                      }, 0) : 0 ? new Intl.NumberFormat('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      }).format(task.prospectItems.reduce((sum, item) => {
                        return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
                      }, 0)) : '0,00'} className="pl-8 bg-green-50 border-green-200 text-green-800 font-medium" readOnly />
                             <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-green-600">R$</span>
                           </div>
                           <p className="text-xs text-green-600 font-medium">
                             ⚡ Valor calculado automaticamente com base nos produtos selecionados
                           </p>
                         </div>
                         
                         <div className="space-y-2">
                           <Label htmlFor="totalOpportunityValue">Valor Total da Oportunidade (R$)</Label>
                           <div className="relative">
                             <Input id="totalOpportunityValue" type="text" value={task.salesValue ? new Intl.NumberFormat('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      }).format(getSalesValueAsNumber(task.salesValue)) : ''} onChange={e => {
                        const value = e.target.value.replace(/\D/g, '');
                        const numericValue = parseFloat(value) / 100;
                        setTask(prev => ({
                          ...prev,
                          salesValue: isNaN(numericValue) ? undefined : numericValue
                        }));
                      }} placeholder="0,00" className="pl-8" />
                             <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                           </div>
                           <p className="text-xs text-muted-foreground">
                             Valor total da oportunidade (não alterado pela venda parcial)
                           </p>
                         </div>
                       </div>}

                     {/* Lista de produtos para venda parcial */}
                     {task.prospectItems && task.prospectItems.length > 0 && <div className="space-y-3">
                         <Label className="text-sm font-medium">Produtos Vendidos</Label>
                          <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                            {task.prospectItems.map((item, index) => <div key={item.id} className="flex items-center justify-between space-x-3 p-3 bg-muted/50 rounded-lg">
                                <div className="flex items-center space-x-3">
                                  <Checkbox checked={item.selected} onCheckedChange={checked => {
                          handleProspectItemChange(index, 'selected', checked as boolean);
                        }} />
                                  <div className="flex-1">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium">{item.name}</span>
                                      <span className="text-xs text-muted-foreground">({item.category})</span>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="flex items-center space-x-2 min-w-[200px]">
                                  <div className="flex flex-col space-y-1">
                                    <Label className="text-xs">Qtd</Label>
                                    <Input type="number" min="0" value={item.quantity || 1} onChange={e => {
                            const quantity = parseInt(e.target.value) || 1;
                            handleProspectItemChange(index, 'quantity', quantity);
                          }} className="w-16 h-8 text-xs" />
                                  </div>
                                  
                                  <div className="flex flex-col space-y-1">
                                    <Label className="text-xs">Preço Unit.</Label>
                                    <div className="relative">
                                      <Input type="text" value={item.price ? new Intl.NumberFormat('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            }).format(item.price) : '0,00'} onChange={e => {
                              const value = e.target.value.replace(/\D/g, '');
                              const price = parseFloat(value) / 100;
                              handleProspectItemChange(index, 'price', isNaN(price) ? 0 : price);
                            }} className="w-20 h-8 text-xs pl-4" />
                                      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                                    </div>
                                  </div>
                                  
                                  <div className="flex flex-col space-y-1">
                                    <Label className="text-xs">Total</Label>
                                    <div className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded">
                                      R$ {new Intl.NumberFormat('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            }).format((item.price || 0) * (item.quantity || 1))}
                                    </div>
                                  </div>
                                </div>
                              </div>)}
                          </div>
                       </div>}
                  </div>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Integração WhatsApp */}
        <Card className="mt-6">
          <CardHeader>
            
          </CardHeader>
          <CardContent className="space-y-4">
            
          </CardContent>
        </Card>
        {/* Próxima Ação - visita a campo e ligação */}
        {(taskCategory === 'field-visit' || taskCategory === 'call') && (
          <Card className="mt-6 border-warning/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-warning" />
                Próxima Ação
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Registre o próximo passo planejado com este cliente para acompanhamento futuro.
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="nextAction">Ação / Descrição</Label>
                <Textarea
                  id="nextAction"
                  value={(task.nextAction as string) || ''}
                  onChange={(e) => setTask(prev => ({ ...prev, nextAction: e.target.value }))}
                  placeholder="Ex.: Enviar proposta comercial, retornar visita para fechamento, apresentar simulação..."
                  className="min-h-[80px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nextActionDate">Data Prevista</Label>
                <Input
                  id="nextActionDate"
                  type="date"
                  value={
                    typeof task.nextActionDate === 'string'
                      ? task.nextActionDate
                      : task.nextActionDate instanceof Date
                        ? task.nextActionDate.toISOString().split('T')[0]
                        : ''
                  }
                  onChange={(e) => setTask(prev => ({ ...prev, nextActionDate: e.target.value || undefined }))}
                />
                <p className="text-xs text-muted-foreground">
                  Deixe em branco se não houver ação planejada.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <PhotoUpload photos={task.photos || []} onPhotosChange={photos => setTask(prev => ({
        ...prev,
        photos
      }))} maxPhotos={10} hidePhotoUpload={taskCategory === 'call'} />


        {/* Check-in de Localização - apenas para visita a campo */}
        {taskCategory === 'field-visit' && <CheckInLocation checkInLocation={task.checkInLocation} onCheckIn={handleCheckIn} />}

         <div className="flex flex-col gap-4 mt-6">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <Button type="submit" className="flex-1 order-1" variant="gradient" disabled={isSubmitting}>
                <CheckSquare className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Criando...' : 'Criar Tarefa'}
              </Button>
              <Button type="button" variant="outline" className="flex-1 order-2" onClick={handleSaveDraft}>
                <FileText className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Salvar Rascunho</span>
                <span className="sm:hidden">Rascunho</span>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" className="flex-1 order-3">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Limpar Tudo</span>
                    <span className="sm:hidden">Limpar</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="mx-4">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar limpeza</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja limpar todas as informações do formulário? Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => {
                  resetAllFields();
                  setSelectedTaskType(null);
                  toast({
                    title: "✨ Formulário limpo",
                    description: "Todas as informações foram resetadas com sucesso"
                  });
                }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Sim, limpar tudo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button type="button" variant="outline" className="flex-1 order-4" onClick={() => navigate('/create-task')}>
                Sair
              </Button>
            </div>
           
           {/* Botões de Exportar Relatório */}
           <div className="border-t pt-4">
             <div className="flex items-center justify-between mb-4">
               <div>
                 <h3 className="text-lg font-semibold">Relatórios de Visitas</h3>
                 <p className="text-sm text-muted-foreground">Exporte todas as informações das visitas realizadas</p>
               </div>
             </div>
             <ReportExporter variant="outline" className="w-auto" />
           </div>
         </div>
       </form>}
     </div>;
};
export default CreateTask;