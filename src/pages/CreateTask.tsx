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
import { Calendar as CalendarIcon, Clock, MapPin, User, Building, CheckSquare, Camera, FileText, Plus, X, Download, RotateCcw } from 'lucide-react';
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
  const [taskCategory, setTaskCategory] = useState<'field-visit' | 'call' | 'workshop-checklist'>(getTaskCategoryFromUrl(urlTaskType));
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
    documents: []
  });

  // Definir apenas a filial automaticamente quando o perfil carregar
  useEffect(() => {
    if (profile) {
      setTask(prev => ({
        ...prev,
        filial: profile.filial_id || ''
      }));
    }
  }, [profile]);
  
  // Inicializar com apenas um equipamento já adicionado
  const initializeEquipmentList = () => {
    return [
      { id: '1', familyProduct: 'TRATOR', quantity: 1 }
    ];
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
    lubricants: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    tires: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    filters: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    batteries: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    parts: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    silobag: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    disk: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 }
  });

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
      
      // Calcular valor total geral automaticamente
      const totalSalesValue = Object.values(updated).reduce((sum, item) => {
        return sum + (item.needsProduct ? item.totalValue : 0);
      }, 0);
      
      // Atualizar o valor de venda da tarefa
      setTask(prev => ({
        ...prev,
        salesValue: totalSalesValue
      }));
      
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
    id: '6',
    name: 'Outros',
    category: 'other',
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
    name: 'disco',
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
  const [checklist, setChecklist] = useState<ProductType[]>(getProductsForCategory());
  const [callProducts, setCallProducts] = useState<ProductType[]>(fieldVisitProducts);

  // Função para buscar informações anteriores pelo CPF
  const searchPreviousDataByCPF = async (cpf: string) => {
    if (!cpf || cpf.length < 11) return;

    try {
      // Buscar no Supabase
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .ilike('observations', `%${cpf}%`)
        .order('created_at', { ascending: false })
        .limit(1);

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
          responsible: lastTask.responsible || '',
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
            responsible: data.responsible || '',
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
  const saveCPFData = (cpf: string, data: { client: string; responsible: string; property: string; hectares?: string }) => {
    if (cpf && (data.client || data.responsible || data.property || data.hectares)) {
      localStorage.setItem(`cpf_data_${cpf}`, JSON.stringify(data));
    }
  };

  // Função para resetar todos os campos do formulário
  const resetAllFields = () => {
    // Reset task state (mantém apenas filial)
    setTask({
      name: '',
      responsible: '',
      client: '',
      property: '',
      filial: profile?.filial_id || '',
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
      documents: []
    });

    // Reset call questions
    setCallQuestions({
      lubricants: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
      tires: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
      filters: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
      batteries: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
      parts: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
      silobag: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
      disk: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 }
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

    toast({
      title: "✨ Formulário limpo",
      description: "Todas as informações foram resetadas com sucesso"
    });
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
      
      // Calcular valor total automaticamente quando há mudanças na seleção
      const totalValue = updated.reduce((sum, item) => {
        return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
      }, 0);
      
      // Atualizar o valor de venda da tarefa
      setTask(prev => ({
        ...prev,
        salesValue: totalValue
      }));
      
      return updated;
    });
  };

  const handleProductChange = (id: string, field: keyof ProductType, value: any) => {
    setChecklist(prev => {
      const updated = prev.map(item => item.id === id ? {
        ...item,
        [field]: value
      } : item);
      
      // Calcular valor total automaticamente quando há mudanças nos valores
      const totalValue = updated.reduce((sum, item) => {
        return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
      }, 0);
      
      // Atualizar o valor de venda da tarefa
      setTask(prev => ({
        ...prev,
        salesValue: totalValue
      }));
      
      return updated;
    });
  };

  const handleProductPhotoChange = (productId: string, photos: string[]) => {
    setChecklist(prev => prev.map(item => item.id === productId ? {
      ...item,
      photos
    } : item));
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
      familyProduct: 'TRATOR', // Opção padrão pré-selecionada
      quantity: 1
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
    
    // Capturar data e hora atual exatos no momento da criação
    const now = new Date();
    const currentTime = format(now, 'HH:mm');
    
    const taskData = {
      ...task,
      taskType: getTaskTypeFromCategory(taskCategory), // Garantir que taskType está correto
      startDate: now, // Data atual exata
      endDate: now, // Data atual exata
      startTime: currentTime, // Horário atual exato
      endTime: currentTime, // Horário atual exato
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

      // Resetar formulário após sucesso
      setTask({
        name: '',
        responsible: profile?.name || '',
        client: '',
        property: '',
        filial: profile?.filial_id || '',
        taskType: getTaskTypeFromCategory(taskCategory),
        startDate: new Date(),
        endDate: new Date(),
        startTime: '',
        endTime: '',
        observations: '',
        priority: 'medium',
        photos: [],
        documents: [],
        initialKm: 0,
        finalKm: 0,
        isProspect: false,
        prospectNotes: '',
        prospectItems: [],
        salesValue: 0,
        salesConfirmed: false
      });
      setChecklist([]);
      setReminders([]);
      setWhatsappWebhook('');
      toast({
        title: "✅ Tarefa Criada",
        description: isOnline ? "Tarefa salva com sucesso no servidor!" : "Tarefa salva offline - será sincronizada quando conectar!"
      });
      
      // Redirecionar para a página de tarefas
      navigate('/tasks');
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
    return (
      <div className="ml-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Quantidade</Label>
            <Input 
              type="number" 
              placeholder="Digite a quantidade"
              value={productData.quantity || ''}
              onChange={(e) => updateCallQuestion(product, 'quantity', parseInt(e.target.value) || 0)}
              min="0"
              step="1"
            />
          </div>
          <div className="space-y-2">
            <Label>Valor Unitário (R$)</Label>
            <div className="relative">
              <Input 
                type="text" 
                placeholder="0,00" 
                className="pl-8"
                value={productData.unitValue ? new Intl.NumberFormat('pt-BR', { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: 2 
                }).format(productData.unitValue) : ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  const numericValue = parseFloat(value) / 100;
                  updateCallQuestion(product, 'unitValue', isNaN(numericValue) ? 0 : numericValue);
                }}
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Valor Total (R$)</Label>
            <div className="relative">
              <Input 
                type="text" 
                className="pl-8 bg-muted cursor-not-allowed"
                value={productData.totalValue ? new Intl.NumberFormat('pt-BR', { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: 2 
                }).format(productData.totalValue) : '0,00'}
                readOnly
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{getTaskTitle(taskCategory)}</h1>
        <p className="text-muted-foreground">
          {taskCategory === 'field-visit' 
            ? 'Criar uma nova visita à fazenda' 
            : taskCategory === 'call' 
            ? 'Registrar uma nova ligação para cliente'
            : 'Criar um novo checklist da oficina'
          }
        </p>
      </div>

      {/* Indicador de Status Offline */}
      <OfflineIndicator />

      <form onSubmit={handleSubmit}>
        {/* Seleção do Tipo de Tarefa - Sempre visível com opção padrão */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              Tipo de Tarefa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="taskCategory">Tipo de tarefa selecionado</Label>
              <Select value={taskCategory} onValueChange={value => setTaskCategory(value as typeof taskCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="field-visit">Visita a Campo</SelectItem>
                  <SelectItem value="call">Ligação</SelectItem>
                  <SelectItem value="workshop-checklist">Checklist Oficina</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

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
                <Label htmlFor="cpf">CPF *</Label>
                <Input 
                  id="cpf" 
                  value={task.cpf || ''} 
                  onChange={e => {
                    const cpf = e.target.value;
                    setTask(prev => ({
                      ...prev,
                      cpf: cpf
                    }));
                    
                    // Buscar dados anteriores quando CPF for digitado (apenas números)
                    const cleanCPF = cpf.replace(/\D/g, '');
                    if (cleanCPF.length === 11) {
                      searchPreviousDataByCPF(cleanCPF);
                    }
                  }} 
                  placeholder="000.000.000-00" 
                  maxLength={14}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reportDate">Data do Relatório</Label>
                <Input 
                  id="reportDate" 
                  value={new Date().toLocaleDateString('pt-BR')} 
                  readOnly 
                  className="bg-muted cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client">Nome do Cliente</Label>
                <Input id="client" value={task.client} onChange={e => setTask(prev => ({
                ...prev,
                client: e.target.value
              }))} placeholder="Nome do cliente" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  value={task.email || ''} 
                  onChange={e => setTask(prev => ({
                    ...prev,
                    email: e.target.value
                  }))} 
                  placeholder="email@exemplo.com" 
                />
              </div>

              {taskCategory === 'field-visit' && <div className="space-y-2">
                  <Label htmlFor="property">Nome da Propriedade</Label>
                  <Input id="property" value={task.property} onChange={e => setTask(prev => ({
                ...prev,
                property: e.target.value
              }))} placeholder="Propriedade da visita" />
                </div>}

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
                   <Input 
                     id="propertyHectares" 
                     type="number" 
                     value={task.propertyHectares || ''} 
                     onChange={e => setTask(prev => ({
                       ...prev,
                       propertyHectares: parseInt(e.target.value) || undefined
                     }))} 
                     placeholder="Digite os hectares da propriedade" 
                     required
                   />
                 </div>

                {/* Lista de Equipamentos */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Equipamentos do Cliente</Label>
                    <Button type="button" onClick={addEquipment} variant="outline" size="sm" className="flex items-center gap-2">
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
                              <Input type="number" value={equipment.quantity} onChange={e => updateEquipment(equipment.id, 'quantity', parseInt(e.target.value) || 1)} placeholder="1" min="1" />
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
                              <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor={`qty-${item.id}`}>QTD</Label>
                                  <Input id={`qty-${item.id}`} type="number" value={item.quantity || ''} onChange={e => handleProductChange(item.id, 'quantity', parseInt(e.target.value) || 0)} placeholder="" />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`price-${item.id}`}>Valor Unitário</Label>
                                  <div className="relative">
                                    <Input 
                                      id={`price-${item.id}`} 
                                      type="text" 
                                      value={item.price ? new Intl.NumberFormat('pt-BR', { 
                                        minimumFractionDigits: 2, 
                                        maximumFractionDigits: 2 
                                      }).format(item.price) : ''} 
                                      onChange={e => {
                                        const value = e.target.value.replace(/\D/g, '');
                                        const numericValue = parseFloat(value) / 100;
                                        handleProductChange(item.id, 'price', isNaN(numericValue) ? 0 : numericValue);
                                      }} 
                                      placeholder="0,00" 
                                      className="pl-8" 
                                    />
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label>Valor Total</Label>
                                  <div className="relative">
                                    <Input 
                                      type="text" 
                                      className="pl-8 bg-muted cursor-not-allowed"
                                      value={item.selected && item.price && item.quantity ? 
                                        new Intl.NumberFormat('pt-BR', { 
                                          minimumFractionDigits: 2, 
                                          maximumFractionDigits: 2 
                                        }).format(item.price * item.quantity) : '0,00'}
                                      readOnly
                                    />
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
                  <div className="space-y-2">
                    <Label htmlFor="customerName">Nome do Cliente:</Label>
                    <Input id="customerName" placeholder="Nome completo do cliente" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="propertyArea">Total de área da propriedade na região:</Label>
                    <Input id="propertyArea" placeholder="Área em hectares" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="johnDeereEquipment">Total de Equipamentos John Deere na região:</Label>
                    <Input id="johnDeereEquipment" type="number" placeholder="Quantidade de equipamentos" />
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Está precisando de Lubrificantes:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="lubricants-yes" 
                            checked={callQuestions.lubricants.needsProduct}
                            onCheckedChange={(checked) => updateCallQuestion('lubricants', 'needsProduct', checked as boolean)}
                          />
                          <Label htmlFor="lubricants-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="lubricants-no" 
                            checked={!callQuestions.lubricants.needsProduct}
                            onCheckedChange={(checked) => updateCallQuestion('lubricants', 'needsProduct', !(checked as boolean))}
                          />
                          <Label htmlFor="lubricants-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.lubricants.needsProduct && renderValueFields('lubricants')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Pneus:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="tires-yes" 
                            checked={callQuestions.tires.needsProduct}
                            onCheckedChange={(checked) => updateCallQuestion('tires', 'needsProduct', checked as boolean)}
                          />
                          <Label htmlFor="tires-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="tires-no" 
                            checked={!callQuestions.tires.needsProduct}
                            onCheckedChange={(checked) => updateCallQuestion('tires', 'needsProduct', !(checked as boolean))}
                          />
                          <Label htmlFor="tires-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.tires.needsProduct && renderValueFields('tires')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Filtros:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="filters-yes" 
                            checked={callQuestions.filters.needsProduct}
                            onCheckedChange={(checked) => updateCallQuestion('filters', 'needsProduct', checked as boolean)}
                          />
                          <Label htmlFor="filters-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="filters-no" 
                            checked={!callQuestions.filters.needsProduct}
                            onCheckedChange={(checked) => updateCallQuestion('filters', 'needsProduct', !(checked as boolean))}
                          />
                          <Label htmlFor="filters-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.filters.needsProduct && renderValueFields('filters')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Baterias:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="batteries-yes" 
                            checked={callQuestions.batteries.needsProduct}
                            onCheckedChange={(checked) => updateCallQuestion('batteries', 'needsProduct', checked as boolean)}
                          />
                          <Label htmlFor="batteries-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="batteries-no" 
                            checked={!callQuestions.batteries.needsProduct}
                            onCheckedChange={(checked) => updateCallQuestion('batteries', 'needsProduct', !(checked as boolean))}
                          />
                          <Label htmlFor="batteries-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.batteries.needsProduct && renderValueFields('batteries')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Peças:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="parts-yes" 
                            checked={callQuestions.parts.needsProduct}
                            onCheckedChange={(checked) => updateCallQuestion('parts', 'needsProduct', checked as boolean)}
                          />
                          <Label htmlFor="parts-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="parts-no" 
                            checked={!callQuestions.parts.needsProduct}
                            onCheckedChange={(checked) => updateCallQuestion('parts', 'needsProduct', !(checked as boolean))}
                          />
                          <Label htmlFor="parts-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.parts.needsProduct && renderValueFields('parts')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Silo Bolsa:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="silobag-yes" 
                            checked={callQuestions.silobag.needsProduct}
                            onCheckedChange={(checked) => updateCallQuestion('silobag', 'needsProduct', checked as boolean)}
                          />
                          <Label htmlFor="silobag-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="silobag-no" 
                            checked={!callQuestions.silobag.needsProduct}
                            onCheckedChange={(checked) => updateCallQuestion('silobag', 'needsProduct', !(checked as boolean))}
                          />
                          <Label htmlFor="silobag-no">NÃO</Label>
                        </div>
                      </div>
                      {callQuestions.silobag.needsProduct && renderValueFields('silobag')}
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Disco:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="disk-yes" 
                            checked={callQuestions.disk.needsProduct}
                            onCheckedChange={(checked) => updateCallQuestion('disk', 'needsProduct', checked as boolean)}
                          />
                          <Label htmlFor="disk-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="disk-no" 
                            checked={!callQuestions.disk.needsProduct}
                            onCheckedChange={(checked) => updateCallQuestion('disk', 'needsProduct', !(checked as boolean))}
                          />
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
              <Textarea 
                id="observations" 
                value={task.observations} 
                onChange={e => setTask(prev => ({
                  ...prev,
                  observations: e.target.value
                }))} 
                placeholder="Observações sobre a tarefa..." 
                className="min-h-[80px]" 
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="salesValue">Valor de Venda/Oportunidade (R$)</Label>
                <div className="relative">
                  <Input 
                    id="salesValue" 
                    type="text" 
                    value={task.salesValue ? new Intl.NumberFormat('pt-BR', { 
                      minimumFractionDigits: 2, 
                      maximumFractionDigits: 2 
                    }).format(task.salesValue) : ''} 
                    className="pl-8 bg-muted cursor-not-allowed"
                    readOnly
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-base font-medium">Status da Oportunidade</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                    <div 
                      className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
                        task.isProspect && task.salesConfirmed === undefined
                          ? 'border-blue-500 bg-blue-50 shadow-lg' 
                          : 'border-gray-200 bg-white hover:border-blue-300'
                      }`}
                      onClick={() => setTask(prev => ({
                        ...prev,
                        isProspect: true,
                        salesConfirmed: undefined,
                        salesValue: undefined
                      }))}
                    >
                      <div className="flex flex-col items-center text-center space-y-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          task.isProspect && task.salesConfirmed === undefined
                            ? 'bg-blue-500 text-white' 
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          👤
                        </div>
                        <div>
                          <div className="font-medium text-sm">Prospect</div>
                          <div className="text-xs text-muted-foreground">Oportunidade identificada</div>
                        </div>
                      </div>
                      {task.isProspect && task.salesConfirmed === undefined && (
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      )}
                    </div>
                    
                    <div 
                      className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
                        task.salesConfirmed === true
                          ? 'border-green-500 bg-green-50 shadow-lg' 
                          : 'border-gray-200 bg-white hover:border-green-300'
                      }`}
                      onClick={() => setTask(prev => ({
                        ...prev,
                        salesConfirmed: true,
                        isProspect: true
                      }))}
                    >
                      <div className="flex flex-col items-center text-center space-y-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          task.salesConfirmed === true
                            ? 'bg-green-500 text-white' 
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          💰
                        </div>
                        <div>
                          <div className="font-medium text-sm">Venda Realizada</div>
                          <div className="text-xs text-muted-foreground">Negócio fechado</div>
                        </div>
                      </div>
                      {task.salesConfirmed === true && (
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      )}
                    </div>
                    
                    <div 
                      className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
                        task.salesConfirmed === false
                          ? 'border-red-500 bg-red-50 shadow-lg' 
                          : 'border-gray-200 bg-white hover:border-red-300'
                      }`}
                      onClick={() => setTask(prev => ({
                        ...prev,
                        salesConfirmed: false,
                        isProspect: true
                      }))}
                    >
                      <div className="flex flex-col items-center text-center space-y-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          task.salesConfirmed === false
                            ? 'bg-red-500 text-white' 
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          ❌
                        </div>
                        <div>
                          <div className="font-medium text-sm">Venda Perdida</div>
                          <div className="text-xs text-muted-foreground">Negócio não realizado</div>
                        </div>
                      </div>
                      {task.salesConfirmed === false && (
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Campo de observação para venda perdida */}
                {task.salesConfirmed === false && task.isProspect && (
                  <div className="space-y-2">
                    <Label htmlFor="lossReason">Motivo da Perda</Label>
                    <select
                      id="lossReason"
                      value={task.prospectNotes || ''}
                      onChange={(e) => setTask(prev => ({
                        ...prev,
                        prospectNotes: e.target.value
                      }))}
                      className="w-full px-3 py-2 border border-input rounded-md bg-background"
                    >
                      <option value="">Selecione o motivo</option>
                      <option value="Falta de peça">Falta de peça</option>
                      <option value="Preço">Preço</option>
                      <option value="Prazo">Prazo</option>
                    </select>
                  </div>
                )}

                {/* Opções para venda realizada */}
                {task.salesConfirmed === true && (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium">Tipo de Venda</Label>
                      <div className="space-y-2 mt-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="totalSale"
                            name="saleType"
                            value="total"
                            checked={!task.prospectItems || task.prospectItems.length === 0}
                            onChange={() => {
                              // Calcular valor total automaticamente com base no checklist
                              const totalValue = checklist.reduce((sum, item) => {
                                return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
                              }, 0);
                              
                              setTask(prev => ({
                                ...prev,
                                prospectItems: [],
                                salesValue: totalValue > 0 ? totalValue : prev.salesValue
                              }));
                            }}
                            className="h-4 w-4"
                          />
                          <Label htmlFor="totalSale">Valor Total</Label>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="partialSale"
                            name="saleType"
                            value="partial"
                            checked={task.prospectItems && task.prospectItems.length > 0}
                            onChange={() => setTask(prev => ({
                              ...prev,
                              prospectItems: task.checklist.map(item => ({
                                ...item,
                                selected: false,
                                quantity: 0
                              }))
                            }))}
                            className="h-4 w-4"
                          />
                          <Label htmlFor="partialSale">Valor Parcial</Label>
                        </div>
                      </div>
                    </div>

                    {/* Campo de valor total editável quando não há produtos selecionados */}
                    {(!task.prospectItems || task.prospectItems.length === 0) && (
                      <div className="space-y-2">
                        <Label htmlFor="totalSaleValue">Valor Total da Venda (R$)</Label>
                        <div className="relative">
                          <Input
                            id="totalSaleValue"
                            type="text"
                            value={task.salesValue ? new Intl.NumberFormat('pt-BR', { 
                              minimumFractionDigits: 2, 
                              maximumFractionDigits: 2 
                            }).format(task.salesValue) : ''}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '');
                              const numericValue = parseFloat(value) / 100;
                              setTask(prev => ({
                                ...prev,
                                salesValue: isNaN(numericValue) ? undefined : numericValue
                              }));
                            }}
                            placeholder="0,00"
                            className="pl-8"
                          />
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {checklist.some(item => item.selected) 
                            ? "Valor calculado automaticamente com base nos produtos selecionados. Você pode editá-lo se necessário."
                            : "Digite o valor total da venda realizada."
                          }
                        </p>
                      </div>
                    )}

                    {/* Campo de valor para venda parcial */}
                    {task.prospectItems && task.prospectItems.length > 0 && (
                      <div className="space-y-2">
                        <Label htmlFor="partialSaleValue">Valor da Venda Parcial (R$)</Label>
                        <div className="relative">
                          <Input
                            id="partialSaleValue"
                            type="text"
                            value={task.salesValue ? new Intl.NumberFormat('pt-BR', { 
                              minimumFractionDigits: 2, 
                              maximumFractionDigits: 2 
                            }).format(task.salesValue) : ''}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '');
                              const numericValue = parseFloat(value) / 100;
                              setTask(prev => ({
                                ...prev,
                                salesValue: isNaN(numericValue) ? 0 : numericValue
                              }));
                            }}
                            placeholder="0,00"
                            className="pl-8"
                          />
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                        </div>
                      </div>
                    )}

                    {/* Lista de produtos para venda parcial */}
                    {task.prospectItems && task.prospectItems.length > 0 && (
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Produtos Vendidos</Label>
                        <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                          {task.prospectItems.map((item, index) => (
                            <div key={item.id} className="flex items-center space-x-3 p-2 bg-muted/50 rounded">
                              <Checkbox
                                checked={item.selected}
                                onCheckedChange={(checked) => {
                                  const updatedItems = [...task.prospectItems!];
                                  updatedItems[index] = { ...item, selected: checked as boolean };
                                  setTask(prev => ({ ...prev, prospectItems: updatedItems }));
                                }}
                              />
                              <div className="flex-1">
                                <span className="text-sm font-medium">{item.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">({item.category})</span>
                              </div>
                              {item.selected && (
                                <div className="flex items-center space-x-2">
                                  <Label className="text-xs">Qtd:</Label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.quantity || 1}
                                    onChange={(e) => {
                                      const updatedItems = [...task.prospectItems!];
                                      updatedItems[index] = { ...item, quantity: parseInt(e.target.value) || 1 };
                                      setTask(prev => ({ ...prev, prospectItems: updatedItems }));
                                    }}
                                    className="w-16 px-1 py-1 text-xs border rounded"
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
            <div className="flex gap-4">
              <Button type="submit" className="flex-1" variant="gradient" disabled={isSubmitting}>
                <CheckSquare className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Criando...' : 'Criar Tarefa'}
              </Button>
              <Button type="button" variant="outline" className="flex-1" onClick={handleSaveDraft}>
                <FileText className="h-4 w-4 mr-2" />
                Salvar Rascunho
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" className="flex-1">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Limpar Tudo
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar limpeza</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja limpar todas as informações do formulário? Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={resetAllFields} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Sim, limpar tudo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button type="button" variant="outline" className="flex-1">
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
      </form>
    </div>;
};
export default CreateTask;