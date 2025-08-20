import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Wrench, Save, X } from 'lucide-react';
import { Task, ProductType } from '@/types/task';
import { PhotoUpload } from '@/components/PhotoUpload';
import { useProfile } from '@/hooks/useProfile';
import { useTasks } from '@/hooks/useTasks';
import { useOffline } from '@/hooks/useOffline';
import { toast } from '@/components/ui/use-toast';

const WorkshopChecklist: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { createTask } = useTasks();
  const { isOnline, saveTaskOffline } = useOffline();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [task, setTask] = useState<Partial<Task>>({
    name: 'Checklist da Oficina',
    responsible: profile?.name || '',
    client: '',
    property: '',
    filial: profile?.filial_id || '',
    cpf: '',
    email: '',
    taskType: 'checklist',
    priority: 'medium',
    observations: '',
    startDate: new Date(),
    endDate: new Date(),
    startTime: '09:00',
    endTime: '17:00',
    checklist: [],
    photos: [],
    documents: [],
    isProspect: true,
    salesConfirmed: undefined
  });

  const workshopChecklistItems: ProductType[] = [
    {
      id: '1',
      name: 'Verificação de Óleo do Motor',
      category: 'oils',
      selected: false,
      quantity: 1,
      price: 0,
      observations: '',
      photos: []
    },
    {
      id: '2',
      name: 'Inspeção de Freios',
      category: 'other',
      selected: false,
      quantity: 1,
      price: 0,
      observations: '',
      photos: []
    },
    {
      id: '3',
      name: 'Verificação de Pneus',
      category: 'tires',
      selected: false,
      quantity: 1,
      price: 0,
      observations: '',
      photos: []
    },
    {
      id: '4',
      name: 'Teste de Bateria',
      category: 'batteries',
      selected: false,
      quantity: 1,
      price: 0,
      observations: '',
      photos: []
    },
    {
      id: '5',
      name: 'Verificação de Luzes',
      category: 'other',
      selected: false,
      quantity: 1,
      price: 0,
      observations: '',
      photos: []
    },
    {
      id: '6',
      name: 'Inspeção de Suspensão',
      category: 'other',
      selected: false,
      quantity: 1,
      price: 0,
      observations: '',
      photos: []
    },
    {
      id: '7',
      name: 'Verificação de Líquidos',
      category: 'oils',
      selected: false,
      quantity: 1,
      price: 0,
      observations: '',
      photos: []
    },
    {
      id: '8',
      name: 'Diagnóstico Eletrônico',
      category: 'other',
      selected: false,
      quantity: 1,
      price: 0,
      observations: '',
      photos: []
    },
    {
      id: '9',
      name: 'Limpeza Geral',
      category: 'other',
      selected: false,
      quantity: 1,
      price: 0,
      observations: '',
      photos: []
    }
  ];

  const [checklist, setChecklist] = useState<ProductType[]>(workshopChecklistItems);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const taskData = {
        ...task,
        checklist,
        taskCategory: 'workshop-checklist' as const
      };

      if (isOnline) {
        await createTask(taskData);
        toast({
          title: "✅ Checklist criado com sucesso!",
          description: "A tarefa foi registrada no sistema"
        });
      } else {
        await saveTaskOffline(taskData);
        toast({
          title: "📱 Checklist salvo offline",
          description: "Será sincronizado quando voltar a conexão"
        });
      }

      navigate('/');
    } catch (error) {
      toast({
        title: "❌ Erro ao criar checklist",
        description: "Tente novamente"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateChecklist = (id: string, field: keyof ProductType, value: any) => {
    setChecklist(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const getStatusIcon = (selected: boolean) => {
    return selected ? '✅' : '⏸️';
  };

  const getStatusText = (selected: boolean) => {
    return selected ? 'Concluído' : 'Pendente';
  };

  return (
    <div className="space-y-6 px-2 sm:px-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-warning" />
            <h1 className="text-2xl font-bold">Checklist da Oficina</h1>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Informações Básicas */}
        <Card>
          <CardHeader>
            <CardTitle>Informações do Veículo/Equipamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="client">Cliente</Label>
                <Input
                  id="client"
                  value={task.client || ''}
                  onChange={(e) => setTask(prev => ({ ...prev, client: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="property">Equipamento/Modelo</Label>
                <Input
                  id="property"
                  value={task.property || ''}
                  onChange={(e) => setTask(prev => ({ ...prev, property: e.target.value }))}
                  placeholder="Ex: Trator John Deere 6130D"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cpf">CPF do Cliente</Label>
                <Input
                  id="cpf"
                  value={task.cpf || ''}
                  onChange={(e) => setTask(prev => ({ ...prev, cpf: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={task.email || ''}
                  onChange={(e) => setTask(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="propertyHectares">Hectares da Propriedade</Label>
                <Input
                  id="propertyHectares"
                  type="number"
                  step="0.01"
                  value={task.propertyHectares || ''}
                  onChange={(e) => setTask(prev => ({ ...prev, propertyHectares: parseFloat(e.target.value) || 0 }))}
                  min="0"
                />
              </div>
              <div>
                <Label htmlFor="familyProduct">Família de Produtos</Label>
                <Input
                  id="familyProduct"
                  value={task.familyProduct || ''}
                  onChange={(e) => setTask(prev => ({ ...prev, familyProduct: e.target.value }))}
                  placeholder="Ex: Tratores, Colheitadeiras, etc."
                />
              </div>
            </div>

            <div>
              <Label htmlFor="equipmentQuantity">Quantidade de Equipamentos</Label>
              <Input
                id="equipmentQuantity"
                type="number"
                value={task.equipmentQuantity || ''}
                onChange={(e) => setTask(prev => ({ ...prev, equipmentQuantity: parseInt(e.target.value) || 0 }))}
                min="0"
              />
            </div>

            <div>
              <Label htmlFor="observations">Observações Gerais</Label>
              <Textarea
                id="observations"
                value={task.observations || ''}
                onChange={(e) => setTask(prev => ({ ...prev, observations: e.target.value }))}
                rows={3}
                placeholder="Informações adicionais sobre o equipamento ou serviço..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Itens do Checklist */}
        <Card>
          <CardHeader>
            <CardTitle>Itens de Verificação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {checklist.map((item) => (
                <div key={item.id} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(e) => updateChecklist(item.id, 'selected', e.target.checked)}
                        className="rounded"
                      />
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{getStatusIcon(item.selected)}</span>
                      <span className={`text-sm font-medium ${item.selected ? 'text-success' : 'text-muted-foreground'}`}>
                        {getStatusText(item.selected)}
                      </span>
                    </div>
                  </div>
                  
                  {item.selected && (
                    <div className="space-y-3 ml-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label>Custo do Serviço (R$)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.price}
                            onChange={(e) => updateChecklist(item.id, 'price', parseFloat(e.target.value) || 0)}
                            min="0"
                          />
                        </div>
                        <div>
                          <Label>Status</Label>
                          <select
                            className="w-full p-2 border rounded-md"
                            value={item.observations}
                            onChange={(e) => updateChecklist(item.id, 'observations', e.target.value)}
                          >
                            <option value="">Selecione o status</option>
                            <option value="OK">OK - Funcionando perfeitamente</option>
                            <option value="ATENCAO">Atenção - Precisa de monitoramento</option>
                            <option value="MANUTENCAO">Manutenção - Requer reparo</option>
                            <option value="SUBSTITUICAO">Substituição - Precisa trocar</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Fotos */}
        <Card>
          <CardHeader>
            <CardTitle>Fotos da Inspeção</CardTitle>
          </CardHeader>
          <CardContent>
            <PhotoUpload 
              photos={task.photos || []}
              onPhotosChange={(photos) => setTask(prev => ({ ...prev, photos }))}
            />
          </CardContent>
        </Card>

        {/* Resumo */}
        <Card>
          <CardHeader>
            <CardTitle>Resumo do Checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-4 bg-success/10 rounded-lg">
                <div className="text-2xl font-bold text-success">
                  {checklist.filter(item => item.selected && item.observations === 'OK').length}
                </div>
                <div className="text-sm text-muted-foreground">Itens OK</div>
              </div>
              <div className="p-4 bg-warning/10 rounded-lg">
                <div className="text-2xl font-bold text-warning">
                  {checklist.filter(item => item.selected && item.observations === 'ATENCAO').length}
                </div>
                <div className="text-sm text-muted-foreground">Atenção</div>
              </div>
              <div className="p-4 bg-destructive/10 rounded-lg">
                <div className="text-2xl font-bold text-destructive">
                  {checklist.filter(item => item.selected && ['MANUTENCAO', 'SUBSTITUICAO'].includes(item.observations)).length}
                </div>
                <div className="text-sm text-muted-foreground">Requer Reparo</div>
              </div>
              <div className="p-4 bg-primary/10 rounded-lg">
                <div className="text-2xl font-bold text-primary">
                  R$ {checklist.filter(item => item.selected).reduce((sum, item) => sum + item.price, 0).toFixed(2)}
                </div>
                <div className="text-sm text-muted-foreground">Custo Total</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Botões de Ação */}
        <div className="flex justify-end gap-3">
          <Button 
            type="button" 
            variant="outline"
            onClick={() => navigate('/')}
          >
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
          <Button 
            type="submit"
            disabled={isSubmitting}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSubmitting ? 'Salvando...' : 'Salvar Checklist'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default WorkshopChecklist;