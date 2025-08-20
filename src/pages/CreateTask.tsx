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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  User, 
  Building, 
  CheckSquare, 
  Camera, 
  FileText, 
  Plus, 
  X, 
  Download, 
  RotateCcw, 
  Phone, 
  Wrench, 
  Search, 
  Check, 
  CheckCircle, 
  XCircle,
  TrendingUp,
  AlertTriangle,
  Target,
  DollarSign
} from 'lucide-react';
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
  const { profile } = useProfile();

  // Estados principais
  const [selectedTaskType, setSelectedTaskType] = useState<'field-visit' | 'call' | 'workshop-checklist' | null>(null);
  const [taskCategory, setTaskCategory] = useState<'field-visit' | 'call' | 'workshop-checklist'>('field-visit');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPartialSaleProducts, setShowPartialSaleProducts] = useState(false);
  const [saleType, setSaleType] = useState<'total' | 'parcial'>('total');
  
  // Hooks
  const { isOnline, saveTaskOffline } = useOffline();
  const { createTask } = useTasks();

  // Estado principal da tarefa
  const [task, setTask] = useState<Partial<Task>>({
    name: '',
    responsible: '',
    client: '',
    property: '',
    filial: '',
    cpf: '',
    email: '',
    taskType: 'prospection',
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
    familyProduct: '',
    equipmentQuantity: 0,
    propertyHectares: 0,
    prospectNotes: ''
  });

  // Estados para checklist e produtos
  const [checklist, setChecklist] = useState<ProductType[]>([]);
  const [prospectItems, setProspectItems] = useState<ProductType[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [equipmentList, setEquipmentList] = useState<{id: string; familyProduct: string; quantity: number}[]>([]);

  // Estados para perguntas da ligação
  const [callQuestions, setCallQuestions] = useState({
    lubricants: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    tires: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    filters: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    batteries: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    parts: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    silobag: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    disk: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 }
  });

  // Estado para lembretes
  const [newReminder, setNewReminder] = useState({
    title: '',
    description: '',
    date: new Date(),
    time: '09:00'
  });

  // Mapear tipos
  const getTaskCategoryFromUrl = (urlType: string | null): 'field-visit' | 'call' | 'workshop-checklist' => {
    switch (urlType) {
      case 'farm_visit': return 'field-visit';
      case 'client_call': return 'call';
      case 'workshop_checklist': return 'workshop-checklist';
      default: return 'field-visit';
    }
  };

  const getTaskTypeFromCategory = (category: 'field-visit' | 'call' | 'workshop-checklist'): 'prospection' | 'ligacao' | 'checklist' => {
    switch (category) {
      case 'field-visit': return 'prospection';
      case 'call': return 'ligacao';
      case 'workshop-checklist': return 'checklist';
      default: return 'prospection';
    }
  };

  const getTaskTitle = (category: 'field-visit' | 'call' | 'workshop-checklist'): string => {
    switch (category) {
      case 'field-visit': return 'Visita a Fazenda';
      case 'call': return 'Ligação para Cliente';
      case 'workshop-checklist': return 'Checklist da Oficina';
      default: return 'Nova Tarefa';
    }
  };

  // Produtos por categoria
  const fieldVisitProducts: ProductType[] = [
    { id: '1', name: 'Pneus', category: 'tires', selected: false, quantity: 0, price: 0, observations: '', photos: [] },
    { id: '2', name: 'Lubrificantes', category: 'lubricants', selected: false, quantity: 0, price: 0, observations: '', photos: [] },
    { id: '3', name: 'Óleos', category: 'oils', selected: false, quantity: 0, price: 0, observations: '', photos: [] },
    { id: '4', name: 'Graxas', category: 'greases', selected: false, quantity: 0, price: 0, observations: '', photos: [] },
    { id: '5', name: 'Baterias', category: 'batteries', selected: false, quantity: 0, price: 0, observations: '', photos: [] },
    { id: '7', name: 'Silo Bolsa', category: 'other', selected: false, quantity: 0, price: 0, observations: '', photos: [] },
    { id: '8', name: 'Cool Gard', category: 'other', selected: false, quantity: 0, price: 0, observations: '', photos: [] },
    { id: '9', name: 'Disco', category: 'other', selected: false, quantity: 0, price: 0, observations: '', photos: [] }
  ];

  const workshopChecklistItems: ProductType[] = [
    { id: '1', name: 'Verificação de Óleo do Motor', category: 'oils', selected: false, quantity: 1, price: 0, observations: '', photos: [] },
    { id: '2', name: 'Inspeção de Freios', category: 'other', selected: false, quantity: 1, price: 0, observations: '', photos: [] },
    { id: '3', name: 'Verificação de Pneus', category: 'tires', selected: false, quantity: 1, price: 0, observations: '', photos: [] },
    { id: '4', name: 'Teste de Bateria', category: 'batteries', selected: false, quantity: 1, price: 0, observations: '', photos: [] },
    { id: '5', name: 'Verificação de Luzes', category: 'other', selected: false, quantity: 1, price: 0, observations: '', photos: [] },
    { id: '6', name: 'Inspeção de Suspensão', category: 'other', selected: false, quantity: 1, price: 0, observations: '', photos: [] },
    { id: '7', name: 'Verificação de Líquidos', category: 'oils', selected: false, quantity: 1, price: 0, observations: '', photos: [] },
    { id: '8', name: 'Diagnóstico Eletrônico', category: 'other', selected: false, quantity: 1, price: 0, observations: '', photos: [] },
    { id: '9', name: 'Limpeza Geral', category: 'other', selected: false, quantity: 1, price: 0, observations: '', photos: [] }
  ];

  const getProductsForCategory = () => {
    switch (taskCategory) {
      case 'field-visit': return fieldVisitProducts;
      case 'workshop-checklist': return workshopChecklistItems;
      default: return [];
    }
  };

  // Effects
  useEffect(() => {
    if (urlTaskType) {
      const initialType = getTaskCategoryFromUrl(urlTaskType);
      setSelectedTaskType(initialType);
      setTaskCategory(initialType);
    }
  }, [urlTaskType]);

  useEffect(() => {
    if (profile) {
      setTask(prev => ({
        ...prev,
        filial: profile.filial_id || '',
        responsible: profile.name || ''
      }));
    }
  }, [profile]);

  useEffect(() => {
    setChecklist(getProductsForCategory());
  }, [taskCategory]);

  // Funções de cálculo
  const calculateTotalSalesValue = () => {
    let total = 0;

    if (taskCategory === 'field-visit' || taskCategory === 'workshop-checklist') {
      total += checklist.reduce((sum, item) => {
        return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
      }, 0);
    }

    if (taskCategory === 'call') {
      total += Object.values(callQuestions).reduce((sum, item) => {
        return sum + (item.needsProduct ? item.totalValue : 0);
      }, 0);
    }

    return total;
  };

  const calculatePartialSalesValue = () => {
    return prospectItems.reduce((sum, item) => {
      return sum + (item.selected && item.price ? item.price * (item.quantity || 1) : 0);
    }, 0);
  };

  // Atualizar valor total
  useEffect(() => {
    if (saleType === 'total') {
      const totalValue = calculateTotalSalesValue();
      setTask(prev => ({ ...prev, salesValue: totalValue }));
    } else if (saleType === 'parcial') {
      const partialValue = calculatePartialSalesValue();
      setTask(prev => ({ ...prev, salesValue: partialValue }));
    }
  }, [checklist, callQuestions, prospectItems, saleType, taskCategory]);

  // Buscar dados por CPF
  const searchPreviousDataByCPF = async (cpf: string) => {
    if (!cpf || cpf.length < 11) return;
    
    try {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .ilike('observations', `%${cpf}%`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (tasks && tasks.length > 0) {
        const lastTask = tasks[0];
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
      }
    } catch (error) {
      console.error('Erro ao buscar dados por CPF:', error);
    }
  };

  // Funções de manipulação
  const handleTaskTypeChange = (newType: 'field-visit' | 'call' | 'workshop-checklist') => {
    setSelectedTaskType(newType);
    setTaskCategory(newType);
    setTask(prev => ({
      ...prev,
      taskType: getTaskTypeFromCategory(newType)
    }));
  };

  const updateCallQuestion = (product: keyof typeof callQuestions, field: 'needsProduct' | 'quantity' | 'unitValue', value: boolean | number) => {
    setCallQuestions(prev => {
      const updated = {
        ...prev,
        [product]: {
          ...prev[product],
          [field]: value
        }
      };

      const productData = updated[product];
      const totalValue = productData.quantity * productData.unitValue;
      updated[product] = {
        ...productData,
        totalValue: totalValue
      };
      return updated;
    });
  };

  const updateChecklist = (index: number, field: keyof ProductType, value: any) => {
    setChecklist(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const updateProspectItems = (index: number, field: keyof ProductType, value: any) => {
    setProspectItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addReminder = () => {
    if (!newReminder.title) {
      toast({
        title: "⚠️ Campo obrigatório",
        description: "Por favor, adicione um título para o lembrete",
        variant: "destructive"
      });
      return;
    }

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

    toast({
      title: "✅ Lembrete adicionado",
      description: "Lembrete foi adicionado com sucesso"
    });
  };

  const removeReminder = (id: string) => {
    setReminders(prev => prev.filter(r => r.id !== id));
  };

  // Funções de status
  const handleStatusChange = (status: 'prospect' | 'venda_realizada' | 'venda_perdida') => {
    let updates: Partial<Task> = {
      isProspect: status === 'prospect'
    };

    switch (status) {
      case 'prospect':
        updates.salesConfirmed = undefined;
        break;
      case 'venda_realizada':
        updates.salesConfirmed = true;
        break;
      case 'venda_perdida':
        updates.salesConfirmed = false;
        break;
    }

    setTask(prev => ({ ...prev, ...updates }));
  };

  const handleSaleTypeChange = (type: 'total' | 'parcial') => {
    setSaleType(type);
    
    if (type === 'parcial') {
      // Inicializar prospectItems com produtos do checklist
      setProspectItems([...checklist]);
      setTask(prev => ({ ...prev, salesConfirmed: null }));
    } else {
      setProspectItems([]);
      setTask(prev => ({ ...prev, salesConfirmed: task.salesConfirmed === false ? false : true }));
    }
  };

  // Formatação monetária
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const parseCurrency = (value: string) => {
    return parseFloat(value.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  };

  // Submissão
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const taskData: Partial<Task> = {
        ...task,
        checklist: checklist.filter(item => item.selected),
        reminders,
        prospectItems: saleType === 'parcial' ? prospectItems.filter(item => item.selected) : [],
        equipmentList
      };

      if (isOnline) {
        await createTask(taskData);
        toast({
          title: "✅ Sucesso!",
          description: `${getTaskTitle(taskCategory)} criada com sucesso`
        });
      } else {
        await saveTaskOffline(taskData);
        toast({
          title: "💾 Salvo offline",
          description: "Tarefa será sincronizada quando houver conexão"
        });
      }

      navigate('/');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast({
        title: "❌ Erro",
        description: "Erro ao salvar a tarefa",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Componente de Status Visual
  const StatusSelector = () => {
    const statuses = [
      {
        id: 'prospect',
        title: 'Prospect',
        description: 'Cliente em potencial',
        icon: Target,
        color: 'from-blue-500 to-blue-600',
        bgColor: 'bg-blue-50 dark:bg-blue-950/20',
        borderColor: 'border-blue-200 dark:border-blue-800',
        textColor: 'text-blue-700 dark:text-blue-300'
      },
      {
        id: 'venda_realizada',
        title: 'Venda Realizada',
        description: 'Venda confirmada',
        icon: CheckCircle,
        color: 'from-green-500 to-green-600',
        bgColor: 'bg-green-50 dark:bg-green-950/20',
        borderColor: 'border-green-200 dark:border-green-800',
        textColor: 'text-green-700 dark:text-green-300'
      },
      {
        id: 'venda_perdida',
        title: 'Venda Perdida',
        description: 'Oportunidade perdida',
        icon: XCircle,
        color: 'from-red-500 to-red-600',
        bgColor: 'bg-red-50 dark:bg-red-950/20',
        borderColor: 'border-red-200 dark:border-red-800',
        textColor: 'text-red-700 dark:text-red-300'
      }
    ];

    const getSelectedStatus = () => {
      if (task.salesConfirmed === true) return 'venda_realizada';
      if (task.salesConfirmed === false) return 'venda_perdida';
      return 'prospect';
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statuses.map((status) => {
          const Icon = status.icon;
          const isSelected = getSelectedStatus() === status.id;
          
          return (
            <Card 
              key={status.id}
              className={cn(
                "cursor-pointer transition-all duration-300 transform hover:scale-105",
                "border-2",
                isSelected ? status.borderColor : "border-muted",
                isSelected ? status.bgColor : "bg-card hover:bg-muted/50"
              )}
              onClick={() => handleStatusChange(status.id as 'prospect' | 'venda_realizada' | 'venda_perdida')}
            >
              <CardContent className="p-6 text-center">
                <div className={cn(
                  "w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center",
                  `bg-gradient-to-br ${status.color}`,
                  isSelected ? "shadow-lg" : "opacity-70"
                )}>
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <h3 className={cn(
                  "font-semibold text-lg mb-2",
                  isSelected ? status.textColor : "text-foreground"
                )}>
                  {status.title}
                </h3>
                <p className={cn(
                  "text-sm",
                  isSelected ? status.textColor : "text-muted-foreground"
                )}>
                  {status.description}
                </p>
                {isSelected && (
                  <Badge className={cn("mt-3", status.color)}>
                    Selecionado
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 p-4">
      <div className="max-w-6xl mx-auto">
        <OfflineIndicator />
        
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                {selectedTaskType ? getTaskTitle(selectedTaskType) : 'Nova Tarefa'}
              </h1>
              <p className="text-muted-foreground mt-2">
                Registre informações detalhadas da sua atividade
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => navigate('/')}
              className="gap-2"
            >
              <X className="w-4 h-4" />
              Cancelar
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Seleção de Tipo de Tarefa */}
          {!selectedTaskType && (
            <Card className="border-2 border-primary/20 bg-gradient-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckSquare className="w-5 h-5" />
                  Selecione o Tipo de Atividade
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { type: 'field-visit' as const, title: 'Visita a Fazenda', icon: MapPin, description: 'Visita técnica ao cliente' },
                    { type: 'call' as const, title: 'Ligação para Cliente', icon: Phone, description: 'Atendimento telefônico' },
                    { type: 'workshop-checklist' as const, title: 'Checklist da Oficina', icon: Wrench, description: 'Verificação técnica' }
                  ].map(({ type, title, icon: Icon, description }) => (
                    <Card 
                      key={type}
                      className="cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-lg border-2 hover:border-primary/50"
                      onClick={() => handleTaskTypeChange(type)}
                    >
                      <CardContent className="p-6 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-primary flex items-center justify-center">
                          <Icon className="w-8 h-8 text-primary-foreground" />
                        </div>
                        <h3 className="font-semibold text-lg mb-2">{title}</h3>
                        <p className="text-sm text-muted-foreground">{description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {selectedTaskType && (
            <>
              {/* Informações Básicas */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Informações Básicas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cpf">CPF *</Label>
                      <div className="flex gap-2">
                        <Input
                          id="cpf"
                          value={task.cpf || ''}
                          onChange={(e) => setTask(prev => ({ ...prev, cpf: e.target.value }))}
                          placeholder="000.000.000-00"
                          className="flex-1"
                        />
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="icon"
                          onClick={() => searchPreviousDataByCPF(task.cpf || '')}
                          className="shrink-0"
                        >
                          <Search className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="client">Cliente *</Label>
                      <Input
                        id="client"
                        value={task.client || ''}
                        onChange={(e) => setTask(prev => ({ ...prev, client: e.target.value }))}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="property">Propriedade *</Label>
                      <Input
                        id="property"
                        value={task.property || ''}
                        onChange={(e) => setTask(prev => ({ ...prev, property: e.target.value }))}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="responsible">Responsável *</Label>
                      <Input
                        id="responsible"
                        value={task.responsible || ''}
                        onChange={(e) => setTask(prev => ({ ...prev, responsible: e.target.value }))}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="email">E-mail</Label>
                      <Input
                        id="email"
                        type="email"
                        value={task.email || ''}
                        onChange={(e) => setTask(prev => ({ ...prev, email: e.target.value }))}
                      />
                    </div>

                    <div>
                      <Label htmlFor="priority">Prioridade</Label>
                      <Select value={task.priority} onValueChange={(value: 'low' | 'medium' | 'high') => setTask(prev => ({ ...prev, priority: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Baixa</SelectItem>
                          <SelectItem value="medium">Média</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="observations">Observações</Label>
                    <Textarea
                      id="observations"
                      value={task.observations || ''}
                      onChange={(e) => setTask(prev => ({ ...prev, observations: e.target.value }))}
                      placeholder="Informações adicionais sobre a atividade..."
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Status da Oportunidade */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Status da Oportunidade
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <StatusSelector />
                </CardContent>
              </Card>

              {/* Tipo de Venda - Apenas para vendas realizadas */}
              {task.salesConfirmed === true && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5" />
                      Tipo de Venda
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RadioGroup 
                      value={saleType} 
                      onValueChange={(value: 'total' | 'parcial') => handleSaleTypeChange(value)}
                      className="flex gap-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="total" id="total" />
                        <Label htmlFor="total">Venda Total</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="parcial" id="parcial" />
                        <Label htmlFor="parcial">Venda Parcial</Label>
                      </div>
                    </RadioGroup>
                  </CardContent>
                </Card>
              )}

              {/* Produtos e Serviços */}
              {(taskCategory === 'field-visit' || taskCategory === 'workshop-checklist') && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckSquare className="w-5 h-5" />
                      {taskCategory === 'field-visit' ? 'Produtos' : 'Serviços'}
                      {saleType === 'parcial' && ' - Venda Parcial'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {(saleType === 'parcial' ? prospectItems : checklist).map((item, index) => (
                        <div key={item.id} className="flex items-center space-x-4 p-4 border rounded-lg">
                          <Checkbox
                            id={`item-${item.id}`}
                            checked={item.selected}
                            onCheckedChange={(checked) => {
                              if (saleType === 'parcial') {
                                updateProspectItems(index, 'selected', checked);
                              } else {
                                updateChecklist(index, 'selected', checked);
                              }
                            }}
                          />
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                            <Label htmlFor={`item-${item.id}`} className="font-medium">
                              {item.name}
                            </Label>
                            <div>
                              <Label className="text-sm text-muted-foreground">Quantidade</Label>
                              <Input
                                type="number"
                                min="0"
                                value={item.quantity || 0}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value) || 0;
                                  if (saleType === 'parcial') {
                                    updateProspectItems(index, 'quantity', value);
                                  } else {
                                    updateChecklist(index, 'quantity', value);
                                  }
                                }}
                                disabled={!item.selected}
                              />
                            </div>
                            <div>
                              <Label className="text-sm text-muted-foreground">Preço Unitário</Label>
                              <Input
                                value={item.price ? formatCurrency(item.price) : ''}
                                onChange={(e) => {
                                  const value = parseCurrency(e.target.value);
                                  if (saleType === 'parcial') {
                                    updateProspectItems(index, 'price', value);
                                  } else {
                                    updateChecklist(index, 'price', value);
                                  }
                                }}
                                disabled={!item.selected}
                                placeholder="R$ 0,00"
                              />
                            </div>
                            <div>
                              <Label className="text-sm text-muted-foreground">Total</Label>
                              <div className="font-semibold text-primary">
                                {formatCurrency((item.price || 0) * (item.quantity || 1))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 p-4 bg-primary/5 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold">Valor Total:</span>
                        <span className="text-2xl font-bold text-primary">
                          {formatCurrency(task.salesValue || 0)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Perguntas da Ligação */}
              {taskCategory === 'call' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Phone className="w-5 h-5" />
                      Necessidades do Cliente
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {Object.entries(callQuestions).map(([product, data]) => (
                        <div key={product} className="p-4 border rounded-lg space-y-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`call-${product}`}
                              checked={data.needsProduct}
                              onCheckedChange={(checked) => updateCallQuestion(product as keyof typeof callQuestions, 'needsProduct', checked as boolean)}
                            />
                            <Label htmlFor={`call-${product}`} className="font-medium capitalize">
                              {product === 'lubricants' ? 'Lubrificantes' :
                               product === 'tires' ? 'Pneus' :
                               product === 'filters' ? 'Filtros' :
                               product === 'batteries' ? 'Baterias' :
                               product === 'parts' ? 'Peças' :
                               product === 'silobag' ? 'Silo Bolsa' :
                               product === 'disk' ? 'Disco' : product}
                            </Label>
                          </div>

                          {data.needsProduct && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 ml-6">
                              <div>
                                <Label className="text-sm">Quantidade</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  value={data.quantity}
                                  onChange={(e) => updateCallQuestion(product as keyof typeof callQuestions, 'quantity', parseInt(e.target.value) || 0)}
                                />
                              </div>
                              <div>
                                <Label className="text-sm">Valor Unitário</Label>
                                <Input
                                  value={data.unitValue ? formatCurrency(data.unitValue) : ''}
                                  onChange={(e) => updateCallQuestion(product as keyof typeof callQuestions, 'unitValue', parseCurrency(e.target.value))}
                                  placeholder="R$ 0,00"
                                />
                              </div>
                              <div>
                                <Label className="text-sm">Valor Total</Label>
                                <div className="font-semibold text-primary p-2 bg-primary/5 rounded">
                                  {formatCurrency(data.totalValue)}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 p-4 bg-primary/5 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold">Valor Total da Oportunidade:</span>
                        <span className="text-2xl font-bold text-primary">
                          {formatCurrency(task.salesValue || 0)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Notas do Prospect */}
              {task.isProspect && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Notas do Prospect
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={task.prospectNotes || ''}
                      onChange={(e) => setTask(prev => ({ ...prev, prospectNotes: e.target.value }))}
                      placeholder="Adicione observações sobre o prospect, próximos passos, etc..."
                      rows={4}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Localização */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    Localização
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CheckInLocation 
                    checkInLocation={task.checkInLocation}
                    onCheckIn={(location) => setTask(prev => ({ ...prev, checkInLocation: location }))}
                  />
                </CardContent>
              </Card>

              {/* Fotos */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Camera className="w-5 h-5" />
                    Fotos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <PhotoUpload 
                    photos={task.photos || []}
                    onPhotosChange={(photos) => setTask(prev => ({ ...prev, photos }))}
                  />
                </CardContent>
              </Card>

              {/* Lembretes */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Lembretes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="reminder-title">Título</Label>
                      <Input
                        id="reminder-title"
                        value={newReminder.title}
                        onChange={(e) => setNewReminder(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="Ex: Ligar para cliente"
                      />
                    </div>
                    <div>
                      <Label htmlFor="reminder-time">Horário</Label>
                      <Input
                        id="reminder-time"
                        type="time"
                        value={newReminder.time}
                        onChange={(e) => setNewReminder(prev => ({ ...prev, time: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="reminder-description">Descrição</Label>
                    <Textarea
                      id="reminder-description"
                      value={newReminder.description}
                      onChange={(e) => setNewReminder(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Detalhes do lembrete..."
                      rows={2}
                    />
                  </div>

                  <div>
                    <Label>Data</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(newReminder.date, "PPP", { locale: ptBR })}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={newReminder.date}
                          onSelect={(date) => date && setNewReminder(prev => ({ ...prev, date }))}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <Button type="button" onClick={addReminder} className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Lembrete
                  </Button>

                  {reminders.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold">Lembretes Adicionados:</h4>
                      {reminders.map((reminder) => (
                        <div key={reminder.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div>
                            <div className="font-medium">{reminder.title}</div>
                            <div className="text-sm text-muted-foreground">
                              {format(reminder.date, "PPP", { locale: ptBR })} às {reminder.time}
                            </div>
                            {reminder.description && (
                              <div className="text-sm text-muted-foreground mt-1">{reminder.description}</div>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeReminder(reminder.id)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Botões de Ação */}
              <div className="flex gap-4 pt-8">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/')}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-gradient-primary hover:bg-primary-hover"
                >
                  {isSubmitting ? 'Salvando...' : `Salvar ${getTaskTitle(taskCategory)}`}
                </Button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default CreateTask;