import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, MapPin, Save, X } from 'lucide-react';
import { Task, ProductType } from '@/types/task';
import { PhotoUpload } from '@/components/PhotoUpload';
import { CheckInLocation } from '@/components/CheckInLocation';
import { useProfile } from '@/hooks/useProfile';
import { useTasks } from '@/hooks/useTasks';
import { useOffline } from '@/hooks/useOffline';
import { toast } from '@/components/ui/use-toast';

const FarmVisit: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { createTask } = useTasks();
  const { isOnline, saveTaskOffline } = useOffline();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [task, setTask] = useState<Partial<Task>>({
    name: 'Visita à Fazenda',
    responsible: profile?.name || '',
    client: '',
    property: '',
    filial: profile?.filial_id || '',
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
    salesConfirmed: undefined
  });

  const fieldVisitProducts: ProductType[] = [
    {
      id: '1',
      name: 'Pneus',
      category: 'tires',
      selected: false,
      quantity: 0,
      price: 0,
      observations: '',
      photos: []
    },
    {
      id: '2',
      name: 'Lubrificantes',
      category: 'lubricants',
      selected: false,
      quantity: 0,
      price: 0,
      observations: '',
      photos: []
    },
    {
      id: '3',
      name: 'Óleos',
      category: 'oils',
      selected: false,
      quantity: 0,
      price: 0,
      observations: '',
      photos: []
    },
    {
      id: '4',
      name: 'Graxas',
      category: 'greases',
      selected: false,
      quantity: 0,
      price: 0,
      observations: '',
      photos: []
    },
    {
      id: '5',
      name: 'Baterias',
      category: 'batteries',
      selected: false,
      quantity: 0,
      price: 0,
      observations: '',
      photos: []
    },
    {
      id: '6',
      name: 'Silo Bolsa',
      category: 'other',
      selected: false,
      quantity: 0,
      price: 0,
      observations: '',
      photos: []
    },
    {
      id: '7',
      name: 'Cool Gard',
      category: 'other',
      selected: false,
      quantity: 0,
      price: 0,
      observations: '',
      photos: []
    },
    {
      id: '8',
      name: 'Disco',
      category: 'other',
      selected: false,
      quantity: 0,
      price: 0,
      observations: '',
      photos: []
    }
  ];

  const [checklist, setChecklist] = useState<ProductType[]>(fieldVisitProducts);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const taskData = {
        ...task,
        checklist,
        prospectItems: task.salesConfirmed === null ? checklist.filter(item => item.selected) : undefined,
        taskCategory: 'field-visit' as const
      };

      if (isOnline) {
        await createTask(taskData);
        toast({
          title: "✅ Visita criada com sucesso!",
          description: "A tarefa foi registrada no sistema"
        });
      } else {
        await saveTaskOffline(taskData);
        toast({
          title: "📱 Visita salva offline",
          description: "Será sincronizada quando voltar a conexão"
        });
      }

      navigate('/');
    } catch (error) {
      toast({
        title: "❌ Erro ao criar visita",
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
            <MapPin className="h-5 w-5 text-success" />
            <h1 className="text-2xl font-bold">Visita à Fazenda</h1>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Informações Básicas */}
        <Card>
          <CardHeader>
            <CardTitle>Informações da Visita</CardTitle>
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
                <Label htmlFor="property">Propriedade</Label>
                <Input
                  id="property"
                  value={task.property || ''}
                  onChange={(e) => setTask(prev => ({ ...prev, property: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cpf">CPF</Label>
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
                <Select 
                  value={task.familyProduct || ''} 
                  onValueChange={(value) => setTask(prev => ({ ...prev, familyProduct: value }))}
                >
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
              <Label htmlFor="observations">Observações</Label>
              <Textarea
                id="observations"
                value={task.observations || ''}
                onChange={(e) => setTask(prev => ({ ...prev, observations: e.target.value }))}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Produtos */}
        <Card>
          <CardHeader>
            <CardTitle>Produtos Visitados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {checklist.map((item) => (
                <div key={item.id} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(e) => updateChecklist(item.id, 'selected', e.target.checked)}
                      className="rounded"
                    />
                    <span className="font-medium">{item.name}</span>
                  </div>
                  
                  {item.selected && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 ml-6">
                      <div>
                        <Label>Quantidade</Label>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateChecklist(item.id, 'quantity', parseInt(e.target.value) || 0)}
                          min="0"
                        />
                      </div>
                      <div>
                        <Label>Preço Unitário (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.price}
                          onChange={(e) => updateChecklist(item.id, 'price', parseFloat(e.target.value) || 0)}
                          min="0"
                        />
                      </div>
                      <div>
                        <Label>Observações</Label>
                        <Input
                          value={item.observations}
                          onChange={(e) => updateChecklist(item.id, 'observations', e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Status da Venda/Oportunidade */}
        <Card>
          <CardHeader>
            <CardTitle>Status da Oportunidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
          <div>
            <Label>Status da Venda</Label>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="prospect"
                  name="salesStatus"
                  value="prospect"
                  checked={task.salesConfirmed === undefined}
                  onChange={() => setTask(prev => ({ ...prev, salesConfirmed: undefined, isProspect: true }))}
                  className="rounded"
                />
                <Label htmlFor="prospect">Prospect</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="vendaParcial"
                  name="salesStatus"
                  value="vendaParcial"
                  checked={task.salesConfirmed === null}
                  onChange={() => setTask(prev => ({ ...prev, salesConfirmed: null, isProspect: true }))}
                  className="rounded"
                />
                <Label htmlFor="vendaParcial">Venda Parcial</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="vendaRealizada"
                  name="salesStatus"
                  value="vendaRealizada"
                  checked={task.salesConfirmed === true}
                  onChange={() => setTask(prev => ({ ...prev, salesConfirmed: true, isProspect: false }))}
                  className="rounded"
                />
                <Label htmlFor="vendaRealizada">Venda Realizada</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="vendaPerdida"
                  name="salesStatus"
                  value="vendaPerdida"
                  checked={task.salesConfirmed === false}
                  onChange={() => setTask(prev => ({ ...prev, salesConfirmed: false, isProspect: false }))}
                  className="rounded"
                />
                <Label htmlFor="vendaPerdida">Venda Perdida</Label>
              </div>
            </div>
          </div>

          {task.salesConfirmed === null && (
            <div className="space-y-4">
              <Label className="text-base font-medium">Produtos da Venda Parcial</Label>
              <div className="space-y-3 p-4 border rounded-lg bg-blue-50">
                <p className="text-sm text-blue-700">Selecione os produtos específicos que fazem parte desta venda parcial:</p>
                {checklist.map((item) => (
                  <div key={`partial-${item.id}`} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`partial-checkbox-${item.id}`}
                      checked={item.selected}
                      onChange={(e) => updateChecklist(item.id, 'selected', e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor={`partial-checkbox-${item.id}`} className="text-sm">
                      {item.name} - Qtd: {item.quantity || 0} - R$ {((item.quantity || 0) * (item.price || 0)).toFixed(2)}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="salesValue">Valor da Oportunidade (R$)</Label>
              <Input
                id="salesValue"
                type="number"
                step="0.01"
                value={task.salesValue || ''}
                onChange={(e) => setTask(prev => ({ ...prev, salesValue: parseFloat(e.target.value) || 0 }))}
                min="0"
              />
            </div>
            <div>
              <Label>
                {task.salesConfirmed === null ? "Valor da Venda Parcial (R$)" : "Valor Total dos Produtos (R$)"}
              </Label>
              <Input
                type="number"
                step="0.01"
                value={checklist.filter(item => item.selected).reduce((sum, item) => sum + (item.quantity * item.price), 0).toFixed(2)}
                readOnly
                className="bg-muted"
              />
            </div>
          </div>

            <div>
              <Label htmlFor="prospectNotes">Observações do Prospect</Label>
              <Textarea
                id="prospectNotes"
                value={task.prospectNotes || ''}
                onChange={(e) => setTask(prev => ({ ...prev, prospectNotes: e.target.value }))}
                rows={3}
                placeholder="Anotações específicas sobre a oportunidade de venda..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Localização */}
        <Card>
          <CardHeader>
            <CardTitle>Localização</CardTitle>
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
            <CardTitle>Fotos da Visita</CardTitle>
          </CardHeader>
          <CardContent>
            <PhotoUpload 
              photos={task.photos || []}
              onPhotosChange={(photos) => setTask(prev => ({ ...prev, photos }))}
            />
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
            {isSubmitting ? 'Salvando...' : 'Salvar Visita'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default FarmVisit;