import React, { useState } from 'react';
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

const CreateTask: React.FC = () => {
  const [task, setTask] = useState<Partial<Task>>({
    name: '',
    responsible: '',
    client: '',
    property: '',
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

  const productTypes: ProductType[] = [
    { id: '1', name: 'Pneus', category: 'tires', selected: false },
    { id: '2', name: 'Lubrificantes', category: 'lubricants', selected: false },
    { id: '3', name: 'Óleos', category: 'oils', selected: false },
    { id: '4', name: 'Graxas', category: 'greases', selected: false },
    { id: '5', name: 'Baterias', category: 'batteries', selected: false },
    { id: '6', name: 'Outros', category: 'other', selected: false }
  ];

  const [checklist, setChecklist] = useState<ProductType[]>(productTypes);

  const handleChecklistChange = (id: string, checked: boolean) => {
    setChecklist(prev => 
      prev.map(item => 
        item.id === id ? { ...item, selected: checked } : item
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Implementar lógica de salvamento
    console.log('Task created:', {
      ...task,
      checklist: checklist.filter(item => item.selected),
      reminders
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Nova Tarefa</h1>
        <p className="text-muted-foreground">Criar uma nova tarefa de visita</p>
      </div>

      <form onSubmit={handleSubmit}>
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

              <div className="space-y-2">
                <Label htmlFor="property">Propriedade</Label>
                <Input
                  id="property"
                  value={task.property}
                  onChange={(e) => setTask(prev => ({ ...prev, property: e.target.value }))}
                  placeholder="Propriedade/Filial da visita"
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
            </CardContent>
          </Card>

          {/* Checklist de Produtos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Produtos para Ofertar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {checklist.map((item) => (
                  <div key={item.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={item.id}
                      checked={item.selected}
                      onCheckedChange={(checked) => handleChecklistChange(item.id, checked as boolean)}
                    />
                    <Label htmlFor={item.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      {item.name}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

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

        {/* Upload de Fotos */}
        <PhotoUpload
          photos={task.photos || []}
          onPhotosChange={(photos) => setTask(prev => ({ ...prev, photos }))}
          maxPhotos={10}
        />

        {/* Botões de Ação */}
        <div className="flex gap-4 mt-6">
          <Button type="submit" className="flex-1" variant="gradient">
            <CheckSquare className="h-4 w-4 mr-2" />
            Criar Tarefa
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