import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Phone, Save, X } from 'lucide-react';
import { Task } from '@/types/task';
import { useProfile } from '@/hooks/useProfile';
import { useTasks } from '@/hooks/useTasks';
import { useOffline } from '@/hooks/useOffline';
import { toast } from '@/components/ui/use-toast';

const ClientCall: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { createTask } = useTasks();
  const { isOnline, saveTaskOffline } = useOffline();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [task, setTask] = useState<Partial<Task>>({
    name: 'Ligação para Cliente',
    responsible: profile?.name || '',
    client: '',
    property: '',
    filial: profile?.filial_id || '',
    cpf: '',
    email: '',
    taskType: 'ligacao',
    priority: 'medium',
    observations: '',
    startDate: new Date(),
    endDate: new Date(),
    startTime: '09:00',
    endTime: '17:00',
    photos: [],
    documents: [],
    isProspect: true,
    salesConfirmed: undefined
  });

  const [callQuestions, setCallQuestions] = useState({
    lubricants: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    tires: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    filters: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    batteries: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    parts: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    silobag: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 },
    disk: { needsProduct: false, quantity: 0, unitValue: 0, totalValue: 0 }
  });

  const updateCallQuestion = (product: keyof typeof callQuestions, field: 'needsProduct' | 'quantity' | 'unitValue', value: boolean | number) => {
    setCallQuestions(prev => {
      const updated = {
        ...prev,
        [product]: {
          ...prev[product],
          [field]: value
        }
      };

      // Recalcular valor total quando quantidade ou valor unitário mudarem
      const productData = updated[product];
      const totalValue = productData.quantity * productData.unitValue;
      updated[product] = {
        ...productData,
        totalValue: totalValue
      };
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const taskData = {
        ...task,
        prospectItems: task.salesConfirmed === null ? Object.entries(callQuestions)
          .filter(([_, data]) => data.needsProduct)
          .map(([key, data]) => ({
            id: Math.random().toString(36).substr(2, 9),
            name: productLabels[key as keyof typeof productLabels],
            category: 'other' as const,
            selected: true,
            quantity: data.quantity,
            price: data.unitValue
          })) : undefined,
        taskCategory: 'call' as const,
        callQuestions
      };

      if (isOnline) {
        await createTask(taskData);
        toast({
          title: "✅ Ligação registrada com sucesso!",
          description: "A tarefa foi registrada no sistema"
        });
      } else {
        await saveTaskOffline(taskData);
        toast({
          title: "📱 Ligação salva offline",
          description: "Será sincronizada quando voltar a conexão"
        });
      }

      navigate('/');
    } catch (error) {
      toast({
        title: "❌ Erro ao registrar ligação",
        description: "Tente novamente"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const productLabels = {
    lubricants: 'Lubrificantes',
    tires: 'Pneus', 
    filters: 'Filtros',
    batteries: 'Baterias',
    parts: 'Peças',
    silobag: 'Silo Bolsa',
    disk: 'Disco'
  };

  const renderValueFields = (product: keyof typeof callQuestions) => (
    <div className="ml-6 grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
      <div className="space-y-2">
        <Label>Quantidade</Label>
        <Input
          type="number"
          value={callQuestions[product].quantity}
          onChange={(e) => updateCallQuestion(product, 'quantity', parseInt(e.target.value) || 0)}
          min="0"
        />
      </div>
      <div className="space-y-2">
        <Label>Valor Unitário (R$)</Label>
        <Input
          type="number"
          step="0.01"
          value={callQuestions[product].unitValue}
          onChange={(e) => updateCallQuestion(product, 'unitValue', parseFloat(e.target.value) || 0)}
          min="0"
        />
      </div>
      <div className="space-y-2">
        <Label>Valor Total (R$)</Label>
        <Input
          type="number"
          step="0.01"
          value={callQuestions[product].totalValue}
          readOnly
          className="bg-muted"
        />
      </div>
    </div>
  );

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
            <Phone className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Ligação para Cliente</h1>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Informações Básicas */}
        <Card>
          <CardHeader>
            <CardTitle>Informações da Ligação</CardTitle>
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
              <Label htmlFor="observations">Resumo da Conversa</Label>
              <Textarea
                id="observations"
                value={task.observations || ''}
                onChange={(e) => setTask(prev => ({ ...prev, observations: e.target.value }))}
                rows={4}
                placeholder="Descreva o que foi conversado durante a ligação..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Perguntas da Ligação */}
        <Card>
          <CardHeader>
            <CardTitle>Perguntas da Ligação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {Object.entries(callQuestions).map(([key, data]) => (
                <div key={key} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Está precisando de {productLabels[key as keyof typeof productLabels]}:</Label>
                    <div className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`${key}-yes`}
                          checked={data.needsProduct}
                          onChange={(e) => updateCallQuestion(key as keyof typeof callQuestions, 'needsProduct', e.target.checked)}
                          className="rounded"
                        />
                        <Label htmlFor={`${key}-yes`}>SIM</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`${key}-no`}
                          checked={!data.needsProduct}
                          onChange={(e) => updateCallQuestion(key as keyof typeof callQuestions, 'needsProduct', !e.target.checked)}
                          className="rounded"
                        />
                        <Label htmlFor={`${key}-no`}>NÃO</Label>
                      </div>
                    </div>
                    {data.needsProduct && renderValueFields(key as keyof typeof callQuestions)}
                  </div>
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
                  {Object.entries(callQuestions).map(([key, data]) => (
                    <div key={`partial-${key}`} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`partial-checkbox-${key}`}
                        checked={data.needsProduct}
                        onChange={(e) => updateCallQuestion(key as keyof typeof callQuestions, 'needsProduct', e.target.checked)}
                        className="rounded"
                      />
                      <Label htmlFor={`partial-checkbox-${key}`} className="text-sm">
                        {productLabels[key as keyof typeof productLabels]} - Qtd: {data.quantity || 0} - R$ {data.totalValue.toFixed(2)}
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
                  {task.salesConfirmed === null ? "Valor da Venda Parcial (R$)" : "Valor Total das Perguntas (R$)"}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={task.salesConfirmed === null ? 
                    Object.values(callQuestions).filter(item => item.needsProduct).reduce((sum, item) => sum + item.totalValue, 0).toFixed(2) :
                    Object.values(callQuestions).reduce((sum, item) => sum + item.totalValue, 0).toFixed(2)
                  }
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
            {isSubmitting ? 'Salvando...' : 'Salvar Ligação'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ClientCall;