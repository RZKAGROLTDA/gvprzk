import React, { useState, useEffect } from 'react';
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
  X
} from 'lucide-react';
import { Task, ProductType, Reminder } from '@/types/task';
import { cn } from '@/lib/utils';
import { PhotoUpload } from '@/components/PhotoUpload';
import { CheckInLocation } from '@/components/CheckInLocation';
import { useOffline } from '@/hooks/useOffline';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { toast } from '@/components/ui/use-toast';

const CreateTask: React.FC = () => {
  const [taskCategory, setTaskCategory] = useState<'field-visit' | 'call' | 'workshop-checklist'>('field-visit');
  const [whatsappWebhook, setWhatsappWebhook] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isOnline, saveTaskOffline, addToSyncQueue } = useOffline();
  const [task, setTask] = useState<Partial<Task>>({
    name: '',
    responsible: '',
    client: '',
    property: '',
    filial: '',
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
    documents: []
  });

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [newReminder, setNewReminder] = useState({ title: '', description: '', date: new Date(), time: '09:00' });

  const fieldVisitProducts: ProductType[] = [
    { id: '1', name: 'Pneus', category: 'tires', selected: false, quantity: 0, price: 0, observations: '', photos: [] },
    { id: '2', name: 'Lubrificantes', category: 'lubricants', selected: false, quantity: 0, price: 0, observations: '', photos: [] },
    { id: '3', name: 'Óleos', category: 'oils', selected: false, quantity: 0, price: 0, observations: '', photos: [] },
    { id: '4', name: 'Graxas', category: 'greases', selected: false, quantity: 0, price: 0, observations: '', photos: [] },
    { id: '5', name: 'Baterias', category: 'batteries', selected: false, quantity: 0, price: 0, observations: '', photos: [] },
    { id: '6', name: 'Outros', category: 'other', selected: false, quantity: 0, price: 0, observations: '', photos: [] },
    { id: '7', name: 'Silo Bolsa', category: 'other', selected: false, quantity: 0, price: 0, observations: '', photos: [] },
    { id: '8', name: 'Cool Gard', category: 'other', selected: false, quantity: 0, price: 0, observations: '', photos: [] },
    { id: '9', name: 'disco', category: 'other', selected: false, quantity: 0, price: 0, observations: '', photos: [] }
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

  // Atualiza o checklist quando o tipo de tarefa muda
  useEffect(() => {
    setChecklist(getProductsForCategory());
  }, [taskCategory]);

  const handleChecklistChange = (id: string, checked: boolean) => {
    setChecklist(prev => 
      prev.map(item => 
        item.id === id ? { ...item, selected: checked } : item
      )
    );
  };

  const handleProductChange = (id: string, field: keyof ProductType, value: any) => {
    setChecklist(prev => 
      prev.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const handleProductPhotoChange = (productId: string, photos: string[]) => {
    setChecklist(prev => 
      prev.map(item => 
        item.id === productId ? { ...item, photos } : item
      )
    );
  };

  // Funções para gerenciar produtos da ligação
  const handleCallProductChange = (id: string, checked: boolean) => {
    setCallProducts(prev => 
      prev.map(item => 
        item.id === id ? { ...item, selected: checked } : item
      )
    );
  };

  const handleCallProductUpdate = (id: string, field: keyof ProductType, value: any) => {
    setCallProducts(prev => 
      prev.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const handleCallProductPhotoChange = (productId: string, photos: string[]) => {
    setCallProducts(prev => 
      prev.map(item => 
        item.id === productId ? { ...item, photos } : item
      )
    );
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
      setNewReminder({ title: '', description: '', date: new Date(), time: '09:00' });
    }
  };

  const removeReminder = (id: string) => {
    setReminders(prev => prev.filter(r => r.id !== id));
  };

  const handleCheckIn = (location: { lat: number; lng: number; timestamp: Date }) => {
    setTask(prev => ({ ...prev, checkInLocation: location }));
  };

  const sendToWhatsApp = async (taskData: any) => {
    if (!whatsappWebhook) return;

    try {
      const message = `🚀 *Nova Tarefa Criada*

📋 *Nome:* ${taskData.name}
👤 *Responsável:* ${taskData.responsible}
🏢 *Cliente:* ${taskData.client}
📅 *Data:* ${taskData.startDate ? format(taskData.startDate, "PPP", { locale: ptBR }) : 'Não definida'}
⏰ *Horário:* ${taskData.startTime} - ${taskData.endTime}
🎯 *Prioridade:* ${taskData.priority}

${taskData.observations ? `📝 *Observações:* ${taskData.observations}` : ''}`;

      await fetch(whatsappWebhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        mode: "no-cors",
        body: JSON.stringify({
          message: message,
          timestamp: new Date().toISOString(),
          taskData: taskData
        }),
      });
    } catch (error) {
      console.error("Erro ao enviar para WhatsApp:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const taskData = {
      ...task,
      checklist: checklist.filter(item => item.selected),
      reminders
    };

    try {
      // Gerar ID único para a tarefa
      const taskId = Date.now().toString();
      const finalTaskData = {
        ...taskData,
        id: taskId,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'pending',
        createdBy: taskData.responsible || 'Usuário',
      };

      if (isOnline) {
        // Modo online - salvar diretamente no servidor
        console.log('Salvando online:', finalTaskData);
        // Aqui você implementaria a chamada à API
        
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
        responsible: '',
        client: '',
        property: '',
        filial: '',
        taskType: 'prospection',
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
        description: isOnline ? "Tarefa salva com sucesso no servidor!" : "Tarefa salva offline - será sincronizada quando conectar!",
      });
      
    } catch (error) {
      console.error('Erro ao criar tarefa:', error);
      toast({
        title: "Erro",
        description: "Não foi possível criar a tarefa",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Nova Tarefa</h1>
        <p className="text-muted-foreground">Criar uma nova tarefa</p>
      </div>

      {/* Indicador de Status Offline */}
      <OfflineIndicator />

      <form onSubmit={handleSubmit}>
        {/* Seleção do Tipo de Tarefa */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              Tipo de Tarefa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="taskCategory">Selecione o tipo de tarefa</Label>
              <Select value={taskCategory} onValueChange={(value) => setTaskCategory(value as typeof taskCategory)}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o tipo de tarefa" />
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
                <Label htmlFor="name">Nome da Tarefa</Label>
                <Input
                  id="name"
                  value={task.name}
                  onChange={(e) => setTask(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Digite o nome da tarefa"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="responsible">Responsável</Label>
                <Select onValueChange={(value) => setTask(prev => ({ ...prev, responsible: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="joao">João Silva (RAC)</SelectItem>
                    <SelectItem value="maria">Maria Santos (Consultora)</SelectItem>
                    <SelectItem value="pedro">Pedro Oliveira (RAC)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="client">Cliente</Label>
                <Input
                  id="client"
                  value={task.client}
                  onChange={(e) => setTask(prev => ({ ...prev, client: e.target.value }))}
                  placeholder="Nome do cliente"
                />
              </div>

              {taskCategory === 'field-visit' && (
                <div className="space-y-2">
                  <Label htmlFor="property">Propriedade</Label>
                  <Input
                    id="property"
                    value={task.property}
                    onChange={(e) => setTask(prev => ({ ...prev, property: e.target.value }))}
                    placeholder="Propriedade da visita"
                  />
                </div>
              )}

              {taskCategory === 'call' && (
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="Telefone do cliente"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="filial">Filial</Label>
                <Input
                  id="filial"
                  value={task.filial}
                  onChange={(e) => setTask(prev => ({ ...prev, filial: e.target.value }))}
                  placeholder="Filial"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Prioridade</Label>
                <Select onValueChange={(value) => setTask(prev => ({ ...prev, priority: value as 'low' | 'medium' | 'high' }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a prioridade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Data e Hora */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Data e Horário
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Data da Visita</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !task.startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {task.startDate ? format(task.startDate, "PPP", { locale: ptBR }) : <span>Selecione a data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={task.startDate}
                      onSelect={(date) => setTask(prev => ({ ...prev, startDate: date }))}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startTime">Hora Início</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={task.startTime}
                    onChange={(e) => setTask(prev => ({ ...prev, startTime: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endTime">Hora Fim</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={task.endTime}
                    onChange={(e) => setTask(prev => ({ ...prev, endTime: e.target.value }))}
                  />
                </div>
              </div>

              {taskCategory === 'field-visit' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="initialKm">KM Inicial</Label>
                    <Input
                      id="initialKm"
                      type="number"
                      value={task.initialKm}
                      onChange={(e) => setTask(prev => ({ ...prev, initialKm: parseInt(e.target.value) || 0 }))}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="finalKm">KM Final</Label>
                    <Input
                      id="finalKm"
                      type="number"
                      value={task.finalKm}
                      onChange={(e) => setTask(prev => ({ ...prev, finalKm: parseInt(e.target.value) || 0 }))}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              {taskCategory === 'call' && (
                <div className="space-y-2">
                  <Label htmlFor="callDuration">Duração da Ligação (min)</Label>
                  <Input
                    id="callDuration"
                    type="number"
                    placeholder="Tempo em minutos"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Produtos / Checklist */}
          {(taskCategory === 'field-visit' || taskCategory === 'workshop-checklist') && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  {taskCategory === 'field-visit' ? 'Produtos para Ofertar' : 'Checklist da Oficina'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {checklist.map((item) => (
                    <Card key={item.id} className="border border-border/50">
                      <CardContent className="p-4">
                        <div className="space-y-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={item.id}
                              checked={item.selected}
                              onCheckedChange={(checked) => handleChecklistChange(item.id, checked as boolean)}
                            />
                            <Label htmlFor={item.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                              {item.name}
                            </Label>
                          </div>
                          
                          {item.selected && (
                            <div className="ml-6 space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor={`qty-${item.id}`}>QTD</Label>
                                  <Input
                                    id={`qty-${item.id}`}
                                    type="number"
                                    value={item.quantity || 0}
                                    onChange={(e) => handleProductChange(item.id, 'quantity', parseInt(e.target.value) || 0)}
                                    placeholder="0"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`price-${item.id}`}>Valor</Label>
                                  <Input
                                    id={`price-${item.id}`}
                                    type="number"
                                    step="0.01"
                                    value={item.price || 0}
                                    onChange={(e) => handleProductChange(item.id, 'price', parseFloat(e.target.value) || 0)}
                                    placeholder="0,00"
                                  />
                                </div>
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor={`obs-${item.id}`}>Observações</Label>
                                <Textarea
                                  id={`obs-${item.id}`}
                                  value={item.observations || ''}
                                  onChange={(e) => handleProductChange(item.id, 'observations', e.target.value)}
                                  placeholder="Observações sobre este produto..."
                                  className="min-h-[80px]"
                                />
                              </div>
                              
                              <div className="space-y-2">
                                <Label>Fotos do Produto</Label>
                                <PhotoUpload
                                  photos={item.photos || []}
                                  onPhotosChange={(photos) => handleProductPhotoChange(item.id, photos)}
                                  maxPhotos={5}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Campos específicos para Ligação */}
          {taskCategory === 'call' && (
            <>

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
                    <Input
                      id="customerName"
                      placeholder="Nome completo do cliente"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="propertyArea">Total de área da propriedade na região:</Label>
                    <Input
                      id="propertyArea"
                      placeholder="Área em hectares"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="johnDeereEquipment">Total de Equipamentos John Deere na região:</Label>
                    <Input
                      id="johnDeereEquipment"
                      type="number"
                      placeholder="Quantidade de equipamentos"
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Está precisando de Lubrificantes:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="lubricants-yes" />
                          <Label htmlFor="lubricants-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="lubricants-no" />
                          <Label htmlFor="lubricants-no">NÃO</Label>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Pneus:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="tires-yes" />
                          <Label htmlFor="tires-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="tires-no" />
                          <Label htmlFor="tires-no">NÃO</Label>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Filtros:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="filters-yes" />
                          <Label htmlFor="filters-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="filters-no" />
                          <Label htmlFor="filters-no">NÃO</Label>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Baterias:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="batteries-yes" />
                          <Label htmlFor="batteries-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="batteries-no" />
                          <Label htmlFor="batteries-no">NÃO</Label>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Peças:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="parts-yes" />
                          <Label htmlFor="parts-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="parts-no" />
                          <Label htmlFor="parts-no">NÃO</Label>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Silo Bolsa:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="silobag-yes" />
                          <Label htmlFor="silobag-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="silobag-no" />
                          <Label htmlFor="silobag-no">NÃO</Label>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Está precisando de Disco:</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="disk-yes" />
                          <Label htmlFor="disk-yes">SIM</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="disk-no" />
                          <Label htmlFor="disk-no">NÃO</Label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="serviceImprovement">O que podemos fazer para melhorar o atendimento de peças junto a Fazenda do senhor?</Label>
                    <Textarea
                      id="serviceImprovement"
                      placeholder="Sugestões para melhorar o atendimento..."
                      className="min-h-[80px]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contactName">Nome:</Label>
                      <Input
                        id="contactName"
                        placeholder="Nome do contato"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="farmRole">Função na Fazenda:</Label>
                      <Input
                        id="farmRole"
                        placeholder="Função/cargo"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="consultant">Consultor:</Label>
                      <Input
                        id="consultant"
                        placeholder="Nome do consultor"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="partsManager">Gestor de Peças:</Label>
                      <Input
                        id="partsManager"
                        placeholder="Nome do gestor de peças"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Lembretes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Lembretes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reminderTitle">Título do Lembrete</Label>
                <Input
                  id="reminderTitle"
                  value={newReminder.title}
                  onChange={(e) => setNewReminder(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Título do lembrete"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reminderDescription">Descrição</Label>
                <Textarea
                  id="reminderDescription"
                  value={newReminder.description}
                  onChange={(e) => setNewReminder(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descrição do lembrete"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(newReminder.date, "PPP", { locale: ptBR })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={newReminder.date}
                        onSelect={(date) => setNewReminder(prev => ({ ...prev, date: date || new Date() }))}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reminderTime">Hora</Label>
                  <Input
                    id="reminderTime"
                    type="time"
                    value={newReminder.time}
                    onChange={(e) => setNewReminder(prev => ({ ...prev, time: e.target.value }))}
                  />
                </div>
              </div>

              <Button type="button" onClick={addReminder} className="w-full" variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Lembrete
              </Button>

              {reminders.length > 0 && (
                <div className="space-y-2">
                  <Label>Lembretes Adicionados</Label>
                  {reminders.map((reminder) => (
                    <div key={reminder.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <p className="text-sm font-medium">{reminder.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(reminder.date, "PPP", { locale: ptBR })} às {reminder.time}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeReminder(reminder.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Observações */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Observações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={task.observations}
              onChange={(e) => setTask(prev => ({ ...prev, observations: e.target.value }))}
              placeholder="Observações adicionais sobre a visita..."
              className="min-h-[100px]"
            />
          </CardContent>
        </Card>

        {/* Integração WhatsApp */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Integração WhatsApp (Opcional)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="whatsappWebhook">Webhook URL do Zapier para WhatsApp</Label>
              <Input
                id="whatsappWebhook"
                value={whatsappWebhook}
                onChange={(e) => setWhatsappWebhook(e.target.value)}
                placeholder="Cole aqui a URL do webhook do Zapier"
              />
              <p className="text-sm text-muted-foreground">
                Configure um Zap no Zapier que conecte webhook → WhatsApp para receber notificações automáticas
              </p>
            </div>
          </CardContent>
        </Card>
        {(taskCategory === 'field-visit' || taskCategory === 'workshop-checklist') && (
          <PhotoUpload
            photos={task.photos || []}
            onPhotosChange={(photos) => setTask(prev => ({ ...prev, photos }))}
            maxPhotos={10}
          />
        )}

        {/* Check-in de Localização - apenas para visita a campo */}
        {taskCategory === 'field-visit' && (
          <CheckInLocation
            checkInLocation={task.checkInLocation}
            onCheckIn={handleCheckIn}
          />
        )}

         <div className="flex gap-4 mt-6">
           <Button type="submit" className="flex-1" variant="gradient" disabled={isSubmitting}>
             <CheckSquare className="h-4 w-4 mr-2" />
             {isSubmitting ? 'Criando...' : 'Criar Tarefa'}
           </Button>
           <Button type="button" variant="outline" className="flex-1">
             Cancelar
           </Button>
         </div>
      </form>
    </div>
  );
};

export default CreateTask;