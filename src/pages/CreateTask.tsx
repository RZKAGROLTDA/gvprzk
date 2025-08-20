import React, { useState, useEffect } from 'react';
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
import { Calendar as CalendarIcon, Clock, MapPin, User, Building, CheckSquare, Camera, FileText, Plus, X, Download, RotateCcw, Phone, Wrench, Search, Check, CheckCircle, XCircle } from 'lucide-react';
import { Task, ProductType, Reminder } from '@/types/task';
import { cn } from '@/lib/utils';
import { PhotoUpload } from '@/components/PhotoUpload';
import { CheckInLocation } from '@/components/CheckInLocation';
import { useOffline } from '@/hooks/useOffline';
import { useTasks } from '@/hooks/useTasks';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { toast } from '@/components/ui/use-toast';
import { ReportExporter } from '@/components/ReportExporter';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
const CreateTask: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlTaskType = searchParams.get('type');
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
  // Inicializar com URL se existir
  useEffect(() => {
    if (urlTaskType) {
      const initialType = getTaskCategoryFromUrl(urlTaskType);
      setSelectedTaskType(initialType);
      setTaskCategory(initialType);
    }
  }, [urlTaskType]);

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
  const {
    isOnline,
    saveTaskOffline,
    addToSyncQueue
  } = useOffline();
  const {
    createTask
  } = useTasks();
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
      setTask(prev => ({
        ...prev,
        filial: profile.filial_id || ''
      }));
    }
  }, [profile]);

  // Inicializar lista de equipamentos vazia
  const initializeEquipmentList = () => {
    return [];
  };
  const [reminders, setReminders] = useState<Reminder[]>([]);
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

  // Função para calcular valor total automático
  const calculateTotalSalesValue = () => {
    let total = 0;

    // Somar valores dos produtos selecionados (visita a campo e workshop)
    if (taskCategory === 'field-visit' || taskCategory === 'workshop-checklist') {
      total += checklist.reduce((sum, item) => {
        return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
      }, 0);
    }

    // Somar valores das perguntas da ligação
    if (taskCategory === 'call') {
      total += Object.values(callQuestions).reduce((sum, item) => {
        return sum + (item.needsProduct ? item.totalValue : 0);
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
  }, [checklist, callQuestions, taskCategory, task.prospectItems]);

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
  }];
  const workshopChecklistItems: ProductType[] = [{
    id: '1',
    name: 'Verificação de Óleo do Motor',
    category: 'oils',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '2',
    name: 'Inspeção de Freios',
    category: 'other',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '3',
    name: 'Verificação de Pneus',
    category: 'tires',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '4',
    name: 'Teste de Bateria',
    category: 'batteries',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '5',
    name: 'Verificação de Luzes',
    category: 'other',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '6',
    name: 'Inspeção de Suspensão',
    category: 'other',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '7',
    name: 'Verificação de Líquidos',
    category: 'oils',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '8',
    name: 'Diagnóstico Eletrônico',
    category: 'other',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }, {
    id: '9',
    name: 'Limpeza Geral',
    category: 'other',
    selected: false,
    quantity: 1,
    price: 0,
    observations: '',
    photos: []
  }];
  const getProductsForCategory = () => {
    switch (taskCategory) {
      case 'field-visit':
        return fieldVisitProducts;
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

  // Função para buscar informações anteriores pelo CPF
  const searchPreviousDataByCPF = async (cpf: string) => {
    if (!cpf || cpf.length < 11) return;
    try {
      // Buscar no Supabase
      const {
        data: tasks
      } = await supabase.from('tasks').select('*').ilike('observations', `%${cpf}%`).order('created_at', {
        ascending: false
      }).limit(1);
      if (tasks && tasks.length > 0) {
        const lastTask = tasks[0];

        // Extrair hectares das observações se existir
        let hectares = '';
        if (lastTask.observations) {
          const hectaresMatch = lastTask.observations.match(/hectares?\s*:?\s*(\d+(?:[.,]\d+)?)/i);
          if (hectaresMatch) {
            hectares = hectaresMatch[1];
          }
        }
        setTask(prev => ({
          ...prev,
          client: lastTask.client || '',
          responsible: profile?.name || lastTask.responsible || '',
          property: lastTask.property || '',
          observations: hectares ? `Hectares: ${hectares}` : ''
        }));
        toast({
          title: "📋 Dados encontrados",
          description: "Informações do CPF foram preenchidas automaticamente"
        });
      } else {
        // Buscar no localStorage como fallback
        const savedData = localStorage.getItem(`cpf_data_${cpf}`);
        if (savedData) {
          const data = JSON.parse(savedData);
          setTask(prev => ({
            ...prev,
            client: data.client || '',
            responsible: profile?.name || data.responsible || '',
            property: data.property || '',
            observations: data.hectares ? `Hectares: ${data.hectares}` : ''
          }));
          toast({
            title: "📋 Dados encontrados",
            description: "Informações do CPF foram preenchidas automaticamente"
          });
        }
      }
    } catch (error) {
      console.error('Erro ao buscar dados anteriores:', error);
    }
  };

  // Função para salvar dados do CPF no localStorage
  const saveCPFData = (cpf: string, data: {
    client: string;
    responsible: string;
    property: string;
    hectares?: string;
  }) => {
    if (cpf && (data.client || data.responsible || data.property || data.hectares)) {
      localStorage.setItem(`cpf_data_${cpf}`, JSON.stringify(data));
    }
  };

  // Função para resetar todos os campos do formulário
  const resetAllFields = () => {
    // Reset task state (mantém apenas filial)
    setTask({
      name: '',
      responsible: profile?.name || '',
      client: '',
      property: '',
      filial: profile?.filial_id || '',
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
        id: Date.now().toString(),
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
      id: Date.now().toString(),
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
    setIsSubmitting(true);

    // Validação obrigatória do status da oportunidade
    if (task.salesConfirmed === undefined && !task.isProspect) {
      toast({
        title: "Campo obrigatório",
        description: "Selecione o status da oportunidade (Prospect, Venda Realizada ou Venda Perdida)",
        variant: "destructive"
      });
      setIsSubmitting(false);
      return;
    }

    // Capturar data e hora atual exatos no momento da criação
    const now = new Date();
    const currentTime = format(now, 'HH:mm');
    const taskData = {
      ...task,
      taskType: getTaskTypeFromCategory(taskCategory),
      // Garantir que taskType está correto
      startDate: now,
      // Data atual exata
      endDate: now,
      // Data atual exata
      startTime: currentTime,
      // Horário atual exato
      endTime: currentTime,
      // Horário atual exato
      checklist: taskCategory === 'call' ? callProducts.filter(item => item.selected) : checklist.filter(item => item.selected),
      reminders,
      equipmentList
    };
    try {
      // Gerar ID único para a tarefa
      const taskId = Date.now().toString();
      const finalTaskData = {
        ...taskData,
        id: taskId,
        createdAt: now,
        updatedAt: now,
        status: 'pending' as const,
        createdBy: taskData.responsible || 'Usuário'
      };
      if (isOnline) {
        // Modo online - salvar no Supabase
        console.log('Salvando online:', finalTaskData);
        const savedTask = await createTask(finalTaskData);
        if (!savedTask) {
          throw new Error('Falha ao salvar no banco de dados');
        }

        // Enviar para WhatsApp se webhook configurado
        if (whatsappWebhook) {
          await sendToWhatsApp(finalTaskData);
        }
      } else {
        // Modo offline - salvar localmente
        console.log('Salvando offline:', finalTaskData);
        saveTaskOffline(finalTaskData);

        // Adicionar WhatsApp à fila de sincronização se configurado
        if (whatsappWebhook) {
          addToSyncQueue({
            type: 'whatsapp',
            webhook: whatsappWebhook,
            taskData: finalTaskData
          });
        }
      }

      // Reset completo do formulário e voltar à seleção de tipo de tarefa
      resetAllFields();
      
      // Reset do tipo de tarefa selecionado para voltar à tela inicial
      setSelectedTaskType(null);
      setTaskCategory('field-visit');
      
      // Scroll para o topo da página
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      toast({
        title: "✅ Tarefa Criada com Sucesso!",
        description: isOnline 
          ? "Tarefa salva no servidor. Você pode criar uma nova tarefa." 
          : "Tarefa salva offline - será sincronizada quando conectar. Você pode criar uma nova tarefa."
      });
    } catch (error) {
      console.error('Erro ao criar tarefa:', error);
      toast({
        title: "Erro",
        description: "Não foi possível criar a tarefa",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleSaveDraft = () => {
    const draftData = {
      ...task,
      taskType: getTaskTypeFromCategory(taskCategory),
      checklist: taskCategory === 'call' ? callProducts.filter(item => item.selected) : checklist.filter(item => item.selected),
      reminders,
      equipmentList,
      isDraft: true
    };

    // Salvar dados do CPF para reutilização futura
    if (task.cpf) {
      // Extrair hectares das observações se existir
      let hectares = '';
      if (task.observations) {
        const hectaresMatch = task.observations.match(/hectares?\s*:?\s*(\d+(?:[.,]\d+)?)/i);
        if (hectaresMatch) {
          hectares = hectaresMatch[1];
        }
      }
      saveCPFData(task.cpf.replace(/\D/g, ''), {
        client: task.client || '',
        responsible: task.responsible || '',
        property: task.property || '',
        hectares: hectares || ''
      });
    }

    // Salvar no localStorage como rascunho
    const existingDrafts = JSON.parse(localStorage.getItem('task_drafts') || '[]');
    const draftId = `draft_${Date.now()}`;
    const newDraft = {
      id: draftId,
      ...draftData,
      savedAt: new Date(),
      category: taskCategory
    };
    existingDrafts.push(newDraft);
    localStorage.setItem('task_drafts', JSON.stringify(existingDrafts));
    toast({
      title: "💾 Rascunho Salvo",
      description: "Suas alterações foram salvas como rascunho!"
    });
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
        
        
        {/* Seletor de Tipo de Tarefa */}
        <div className="mt-8 p-6 bg-card/50 border border-border/50 rounded-xl shadow-sm">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-foreground mb-2">Gestão de Visitas</h2>
            <p className="text-muted-foreground text-sm sm:text-base">Selecione o tipo de tarefa que deseja criar:</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Button type="button" variant={selectedTaskType === 'field-visit' ? 'success' : 'outline'} className="h-auto p-6 flex-col gap-3 border-success/20 hover:border-success/40" onClick={() => handleTaskTypeChange('field-visit')}>
              <MapPin className="h-8 w-8 text-success" />
              <div className="text-center">
                <div className="font-semibold">Visita à Fazenda</div>
                <div className="text-sm opacity-80">Prospecção de clientes</div>
              </div>
            </Button>
            
            <Button type="button" variant={selectedTaskType === 'call' ? 'default' : 'outline'} className="h-auto p-6 flex-col gap-3 border-primary/20 hover:border-primary/40" onClick={() => handleTaskTypeChange('call')}>
              <Phone className="h-8 w-8 text-primary" />
              <div className="text-center">
                <div className="font-semibold">Ligação</div>
                <div className="text-sm opacity-80">Contato telefônico</div>
              </div>
            </Button>
            
            <Button type="button" variant={selectedTaskType === 'workshop-checklist' ? 'warning' : 'outline'} className="h-auto p-6 flex-col gap-3 border-warning/20 hover:border-warning/40" onClick={() => handleTaskTypeChange('workshop-checklist')}>
              <Wrench className="h-8 w-8 text-warning" />
              <div className="text-center">
                <div className="font-semibold">Checklist Oficina</div>
                <div className="text-sm opacity-80">Verificação de produtos</div>
              </div>
            </Button>
          </div>
        </div>

        {selectedTaskType && <>
            <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-2">
              {getTaskTitle(selectedTaskType)}
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base mb-4">
              {selectedTaskType === 'field-visit' ? 'Criar uma nova visita à fazenda' : selectedTaskType === 'call' ? 'Registrar uma nova ligação para cliente' : 'Criar um novo checklist da oficina'}
            </p>
          </>}
      </div>

        {/* Indicador de Status Offline - apenas quando tipo de tarefa selecionado */}
        {selectedTaskType && <OfflineIndicator />}

      {selectedTaskType && <form onSubmit={handleSubmit}>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Informações Básicas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5" />
                Informações Básicas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="responsible">Nome do Contato</Label>
                <Input id="responsible" value={task.responsible} onChange={e => setTask(prev => ({
                ...prev,
                responsible: e.target.value
              }))} placeholder="Nome do Contato" />
              </div>

              

              <div className="space-y-2">
                <Label htmlFor="reportDate">Data do Relatório</Label>
                <Input id="reportDate" value={new Date().toLocaleDateString('pt-BR')} readOnly className="bg-muted cursor-not-allowed" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client">Nome do Cliente</Label>
                <Input id="client" value={task.client} onChange={e => setTask(prev => ({
                ...prev,
                client: e.target.value
              }))} placeholder="Nome do cliente" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email do Cliente/Contato</Label>
                <Input id="email" type="email" value={task.email || ''} onChange={e => setTask(prev => ({
                ...prev,
                email: e.target.value
              }))} placeholder="email@exemplo.com" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="property">Nome da Propriedade</Label>
                <Input id="property" value={task.property} onChange={e => setTask(prev => ({
                ...prev,
                property: e.target.value
              }))} placeholder="Nome da propriedade" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor">Vendedor</Label>
                <Input id="vendor" value={profile?.name || ''} disabled placeholder="Nome do vendedor" className="bg-muted" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="filial">Filial</Label>
                <Input id="filial" value={profile?.filial_nome || 'Não informado'} disabled placeholder="Filial" className="bg-muted" />
              </div>

              {taskCategory === 'call' && <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" type="tel" placeholder="Telefone do cliente" />
                </div>}
            </CardContent>
          </Card>

          {/* Informações de Equipamentos - para ambos: visita a campo e ligação */}
          {(taskCategory === 'field-visit' || taskCategory === 'call') && <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Lista de Equipamentos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Hectares da Propriedade */}
                 <div className="space-y-2">
                   <Label htmlFor="propertyHectares">Hectares da Propriedade *</Label>
                    <Input id="propertyHectares" type="number" min="0" value={task.propertyHectares || ''} onChange={e => setTask(prev => ({
                ...prev,
                propertyHectares: parseInt(e.target.value) || undefined
              }))} placeholder="Digite os hectares da propriedade" required />
                 </div>

                {/* Lista de Equipamentos */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Equipamentos do Cliente</Label>
                    <Button type="button" onClick={addEquipment} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white border-green-600 hover:border-green-700" size="sm">
                      <Plus className="h-4 w-4" />
                      Adicionar Equipamento
                    </Button>
                  </div>

                  {equipmentList.length === 0 && <div className="text-center text-muted-foreground py-8 border-2 border-dashed border-border rounded-lg">
                      <Building className="h-8 w-8 mx-auto mb-2" />
                      <p>Nenhum equipamento adicionado</p>
                      <p className="text-sm">Clique em "Adicionar Equipamento" para começar</p>
                    </div>}

                  {equipmentList.map((equipment, index) => <Card key={equipment.id} className="border border-border/50">
                      <CardContent className="p-4">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium">Equipamento {index + 1}</h4>
                            <Button type="button" onClick={() => removeEquipment(equipment.id)} variant="outline" size="sm" className="h-8 w-8 p-0">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Família do Produto</Label>
                              <Select value={equipment.familyProduct} onValueChange={value => updateEquipment(equipment.id, 'familyProduct', value)}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione a família" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="TRATOR">TRATOR</SelectItem>
                                  <SelectItem value="PLATAFORMA">PLATAFORMA</SelectItem>
                                  <SelectItem value="COLHEITADEIRA">COLHEITADEIRA</SelectItem>
                                  <SelectItem value="PLANTADEIRA">PLANTADEIRA</SelectItem>
                                  <SelectItem value="PULVERIZADOR">PULVERIZADOR</SelectItem>
                                  <SelectItem value="COLHEDORA">COLHEDORA</SelectItem>
                                  <SelectItem value="FORRAGEIRA">FORRAGEIRA</SelectItem>
                                  <SelectItem value="OUTROS">OUTROS</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div className="space-y-2">
                              <Label>Quantidade</Label>
                              <Input type="number" value={equipment.quantity || ''} onChange={e => updateEquipment(equipment.id, 'quantity', parseInt(e.target.value) || 0)} placeholder="Digite a quantidade" min="0" />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>)}
                </div>
              </CardContent>
            </Card>}

          {/* Produtos / Checklist - apenas para visita a campo e workshop */}
          {(taskCategory === 'field-visit' || taskCategory === 'workshop-checklist') && <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  {taskCategory === 'field-visit' ? 'Produtos para Ofertar' : 'Checklist da Oficina'}
                </CardTitle>
              </CardHeader>
              <CardContent>
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
                              
                              <div className="space-y-2">
                                <Label>Fotos do Produto</Label>
                                <PhotoUpload photos={item.photos || []} onPhotosChange={photos => handleProductPhotoChange(item.id, photos)} maxPhotos={5} />
                              </div>
                            </div>}
                        </div>
                      </CardContent>
                    </Card>)}
                </div>
              </CardContent>
            </Card>}

          {/* Campos específicos para Ligação */}
          {taskCategory === 'call' && <>
              {/* Perguntas da Ligação */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Perguntas da Ligação
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  

                  

                  

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Está precisando de Lubrificantes:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="lubricants-yes" checked={callQuestions.lubricants.needsProduct} onCheckedChange={checked => updateCallQuestion('lubricants', 'needsProduct', checked as boolean)} />
                          <Label htmlFor="lubricants-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="lubricants-no" checked={!callQuestions.lubricants.needsProduct} onCheckedChange={checked => updateCallQuestion('lubricants', 'needsProduct', !(checked as boolean))} />
                          <Label htmlFor="lubricants-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.lubricants.needsProduct && renderValueFields('lubricants')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Pneus:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="tires-yes" checked={callQuestions.tires.needsProduct} onCheckedChange={checked => updateCallQuestion('tires', 'needsProduct', checked as boolean)} />
                          <Label htmlFor="tires-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="tires-no" checked={!callQuestions.tires.needsProduct} onCheckedChange={checked => updateCallQuestion('tires', 'needsProduct', !(checked as boolean))} />
                          <Label htmlFor="tires-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.tires.needsProduct && renderValueFields('tires')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Filtros:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="filters-yes" checked={callQuestions.filters.needsProduct} onCheckedChange={checked => updateCallQuestion('filters', 'needsProduct', checked as boolean)} />
                          <Label htmlFor="filters-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="filters-no" checked={!callQuestions.filters.needsProduct} onCheckedChange={checked => updateCallQuestion('filters', 'needsProduct', !(checked as boolean))} />
                          <Label htmlFor="filters-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.filters.needsProduct && renderValueFields('filters')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Baterias:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="batteries-yes" checked={callQuestions.batteries.needsProduct} onCheckedChange={checked => updateCallQuestion('batteries', 'needsProduct', checked as boolean)} />
                          <Label htmlFor="batteries-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="batteries-no" checked={!callQuestions.batteries.needsProduct} onCheckedChange={checked => updateCallQuestion('batteries', 'needsProduct', !(checked as boolean))} />
                          <Label htmlFor="batteries-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.batteries.needsProduct && renderValueFields('batteries')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Peças:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="parts-yes" checked={callQuestions.parts.needsProduct} onCheckedChange={checked => updateCallQuestion('parts', 'needsProduct', checked as boolean)} />
                          <Label htmlFor="parts-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="parts-no" checked={!callQuestions.parts.needsProduct} onCheckedChange={checked => updateCallQuestion('parts', 'needsProduct', !(checked as boolean))} />
                          <Label htmlFor="parts-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.parts.needsProduct && renderValueFields('parts')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Silo Bolsa:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="silobag-yes" checked={callQuestions.silobag.needsProduct} onCheckedChange={checked => updateCallQuestion('silobag', 'needsProduct', checked as boolean)} />
                          <Label htmlFor="silobag-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="silobag-no" checked={!callQuestions.silobag.needsProduct} onCheckedChange={checked => updateCallQuestion('silobag', 'needsProduct', !(checked as boolean))} />
                          <Label htmlFor="silobag-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.silobag.needsProduct && renderValueFields('silobag')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Disco:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="disk-yes" checked={callQuestions.disk.needsProduct} onCheckedChange={checked => updateCallQuestion('disk', 'needsProduct', checked as boolean)} />
                          <Label htmlFor="disk-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="disk-no" checked={!callQuestions.disk.needsProduct} onCheckedChange={checked => updateCallQuestion('disk', 'needsProduct', !(checked as boolean))} />
                          <Label htmlFor="disk-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.disk.needsProduct && renderValueFields('disk')}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="serviceImprovement">O que podemos fazer para melhorar o atendimento de peças junto a Fazenda do senhor?</Label>
                    <Textarea id="serviceImprovement" placeholder="Sugestões para melhorar o atendimento..." className="min-h-[80px]" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contactName">Nome:</Label>
                      <Input id="contactName" placeholder="Nome do contato" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="farmRole">Função na Fazenda:</Label>
                      <Input id="farmRole" placeholder="Função/cargo" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="consultant">Consultor:</Label>
                      <Input id="consultant" placeholder="Nome do consultor" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="partsManager">Gestor de Peças:</Label>
                      <Input id="partsManager" placeholder="Nome do gestor de peças" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>}
        </div>

        {/* Observações e Valores */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Observações
            </CardTitle>
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
                  <Label className="text-2xl font-bold text-foreground mb-6 block flex items-center gap-3">
                    <span className="text-3xl">🎯</span>
                    Status da Oportunidade 
                    <span className="text-destructive text-xl">*</span>
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6">
                    {/* PROSPECT CARD */}
                    <div className={`group relative cursor-pointer p-8 rounded-2xl border-4 transition-all duration-500 hover:scale-110 hover:shadow-2xl animate-fade-in ${task.isProspect && task.salesConfirmed === undefined ? 'border-primary bg-gradient-to-br from-primary/10 via-primary/20 to-primary/10 shadow-2xl transform scale-110 ring-4 ring-primary/30' : 'border-border bg-gradient-to-br from-card to-muted/30 hover:border-primary hover:from-primary/5 hover:to-primary/15'}`} onClick={() => setTask(prev => ({
                    ...prev,
                    isProspect: true,
                    salesConfirmed: undefined
                  }))}>
                      <div className="flex flex-col items-center text-center space-y-4">
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 shadow-lg ${task.isProspect && task.salesConfirmed === undefined ? 'bg-primary text-primary-foreground shadow-primary/30 animate-pulse' : 'bg-muted group-hover:bg-primary/20 text-muted-foreground group-hover:text-primary'}`}>
                          <Search className="h-10 w-10" />
                        </div>
                        <div>
                          <div className="font-bold text-xl mb-2">Prospect</div>
                          <div className="text-sm text-muted-foreground">Cliente em análise</div>
                        </div>
                      </div>
                      {task.isProspect && task.salesConfirmed === undefined && <div className="absolute -top-3 -right-3 w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-xl animate-bounce">
                          <Check className="h-6 w-6 text-primary-foreground" />
                        </div>}
                    </div>
                    
                    {/* VENDA REALIZADA CARD */}
                    <div className={`group relative cursor-pointer p-8 rounded-2xl border-4 transition-all duration-500 hover:scale-110 hover:shadow-2xl animate-fade-in ${task.salesConfirmed === true ? 'border-success bg-gradient-to-br from-success/10 via-success/20 to-success/10 shadow-2xl transform scale-110 ring-4 ring-success/30' : 'border-border bg-gradient-to-br from-card to-muted/30 hover:border-success hover:from-success/5 hover:to-success/15'}`} onClick={() => setTask(prev => ({
                    ...prev,
                    salesConfirmed: true,
                    isProspect: true
                  }))}>
                      <div className="flex flex-col items-center text-center space-y-4">
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 shadow-lg ${task.salesConfirmed === true ? 'bg-success text-success-foreground shadow-success/30 animate-pulse' : 'bg-muted group-hover:bg-success/20 text-muted-foreground group-hover:text-success'}`}>
                          <CheckCircle className="h-10 w-10" />
                        </div>
                        <div>
                          <div className="font-bold text-xl mb-2">Venda Realizada</div>
                          <div className="text-sm text-muted-foreground">Negócio fechado</div>
                        </div>
                      </div>
                      {task.salesConfirmed === true && <div className="absolute -top-3 -right-3 w-12 h-12 bg-success rounded-full flex items-center justify-center shadow-xl animate-bounce">
                          <Check className="h-6 w-6 text-success-foreground" />
                        </div>}
                    </div>
                    
                    {/* VENDA PERDIDA CARD */}
                    <div className={`group relative cursor-pointer p-8 rounded-2xl border-4 transition-all duration-500 hover:scale-110 hover:shadow-2xl animate-fade-in ${task.salesConfirmed === false ? 'border-destructive bg-gradient-to-br from-destructive/10 via-destructive/20 to-destructive/10 shadow-2xl transform scale-110 ring-4 ring-destructive/30' : 'border-border bg-gradient-to-br from-card to-muted/30 hover:border-destructive hover:from-destructive/5 hover:to-destructive/15'}`} onClick={() => setTask(prev => ({
                    ...prev,
                    salesConfirmed: false,
                    isProspect: true
                  }))}>
                      <div className="flex flex-col items-center text-center space-y-4">
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 shadow-lg ${task.salesConfirmed === false ? 'bg-destructive text-destructive-foreground shadow-destructive/30 animate-pulse' : 'bg-muted group-hover:bg-destructive/20 text-muted-foreground group-hover:text-destructive'}`}>
                          <XCircle className="h-10 w-10" />
                        </div>
                        <div>
                          <div className="font-bold text-xl mb-2">Venda Perdida</div>
                          <div className="text-sm text-muted-foreground">Negócio não realizado</div>
                        </div>
                      </div>
                      {task.salesConfirmed === false && <div className="absolute -top-3 -right-3 w-12 h-12 bg-destructive rounded-full flex items-center justify-center shadow-xl animate-bounce">
                          <Check className="h-6 w-6 text-destructive-foreground" />
                        </div>}
                    </div>
                  </div>
                </div>

                {/* Campo de observação para venda perdida */}
                {task.salesConfirmed === false && task.isProspect && <div className="space-y-2">
                    <Label htmlFor="lossReason">Motivo da Perda</Label>
                    <select id="lossReason" value={task.prospectNotes || ''} onChange={e => setTask(prev => ({
                  ...prev,
                  prospectNotes: e.target.value
                }))} className="w-full px-3 py-2 border border-input rounded-md bg-background">
                      <option value="">Selecione o motivo</option>
                      <option value="Falta de peça">Falta de peça</option>
                      <option value="Preço">Preço</option>
                      <option value="Prazo">Prazo</option>
                    </select>
                  </div>}

                {/* Opções para venda realizada */}
                {task.salesConfirmed === true && <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium">Tipo de Venda</Label>
                      <div className="space-y-2 mt-2">
                        <div className="flex items-center space-x-2">
                          <input type="radio" id="totalSale" name="saleType" value="total" checked={!task.prospectItems || task.prospectItems.length === 0} onChange={() => {
                        // Calcular valor total automaticamente baseado no tipo de tarefa
                        const totalValue = taskCategory === 'call' ? Object.values(callQuestions).reduce((sum, item) => sum + (item.needsProduct ? item.totalValue : 0), 0) : checklist.reduce((sum, item) => sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0), 0);
                        setTask(prev => ({
                          ...prev,
                          prospectItems: [],
                          salesValue: totalValue > 0 ? totalValue : prev.salesValue
                        }));
                      }} className="h-4 w-4" />
                          <Label htmlFor="totalSale">Valor Total</Label>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                           <input type="radio" id="partialSale" name="saleType" value="partial" checked={task.prospectItems && task.prospectItems.length > 0} onChange={() => {
                        if (taskCategory === 'call') {
                          // Para ligações, usar produtos que precisam de fornecimento
                          const selectedProducts = Object.entries(callQuestions).filter(([key, value]) => value.needsProduct).map(([key, value]) => ({
                            id: key,
                            name: key.charAt(0).toUpperCase() + key.slice(1),
                            category: 'other' as const,
                            selected: true,
                            quantity: value.quantity || 1,
                            price: value.unitValue || 0
                          }));
                          setTask(prev => ({
                            ...prev,
                            prospectItems: selectedProducts
                          }));
                        } else {
                          // Para visitas/checklist, usar produtos selecionados
                          const selectedProducts = checklist.filter(item => item.selected).map(item => ({
                            ...item,
                            selected: true,
                            quantity: item.quantity || 1,
                            price: item.price || 0
                          }));
                          setTask(prev => ({
                            ...prev,
                            prospectItems: selectedProducts
                          }));
                        }
                      }} className="h-4 w-4" />
                           <Label htmlFor="partialSale">Valor Parcial</Label>
                         </div>
                      </div>
                    </div>

                    {/* Campo de valor total editável quando não há produtos selecionados */}
                    {(!task.prospectItems || task.prospectItems.length === 0) && <div className="space-y-2">
                        <Label htmlFor="totalSaleValue">Valor Total da Venda (R$)</Label>
                        <div className="relative">
                          <Input id="totalSaleValue" type="text" value={task.salesValue ? new Intl.NumberFormat('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    }).format(task.salesValue) : ''} onChange={e => {
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
                          {taskCategory === 'call' ? "Valor calculado com base nas perguntas da ligação. Você pode editá-lo se necessário." : checklist.some(item => item.selected) ? "Valor calculado automaticamente com base nos produtos selecionados. Você pode editá-lo se necessário." : "Digite o valor total da venda realizada."}
                        </p>
                      </div>}

                     {/* Campo de valor para venda parcial */}
                     {task.prospectItems && task.prospectItems.length > 0 && <div className="space-y-2">
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
                           ⚡ Valor calculado automaticamente com base nos produtos selecionados para venda parcial
                         </p>
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
        {(taskCategory === 'field-visit' || taskCategory === 'workshop-checklist') && <PhotoUpload photos={task.photos || []} onPhotosChange={photos => setTask(prev => ({
        ...prev,
        photos
      }))} maxPhotos={10} />}

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
              <Button type="button" variant="outline" className="flex-1 order-4">
                Cancelar
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