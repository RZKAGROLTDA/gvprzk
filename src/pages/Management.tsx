import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Settings, FileText, Target, TrendingUp, Users, Building2, Plus, Edit, Trash2, Save, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
interface Goal {
  id: string;
  title: string;
  description: string;
  target_value: number;
  current_value: number;
  period: string;
  status: 'active' | 'completed' | 'paused';
  created_at: string;
}
interface Report {
  id: string;
  title: string;
  description: string;
  type: 'monthly' | 'quarterly' | 'yearly';
  content: string;
  created_at: string;
}
const Management: React.FC = () => {
  const {
    user
  } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [newGoal, setNewGoal] = useState({
    title: '',
    description: '',
    target_value: 0,
    period: 'monthly'
  });
  const [showNewGoalForm, setShowNewGoalForm] = useState(false);
  const loadGoals = async () => {
    setLoading(true);
    try {
      // Por enquanto, vamos usar dados mockados já que não temos tabelas específicas para isso
      setGoals([{
        id: '1',
        title: 'Meta de Visitas Mensais',
        description: 'Atingir 100 visitas por mês em todas as filiais',
        target_value: 100,
        current_value: 75,
        period: 'monthly',
        status: 'active',
        created_at: new Date().toISOString()
      }, {
        id: '2',
        title: 'Meta de Conversão',
        description: 'Alcançar 30% de taxa de conversão em oportunidades',
        target_value: 30,
        current_value: 25,
        period: 'monthly',
        status: 'active',
        created_at: new Date().toISOString()
      }]);
      setReports([{
        id: '1',
        title: 'Relatório Mensal - Janeiro',
        description: 'Desempenho geral do mês de Janeiro',
        type: 'monthly',
        content: 'Relatório detalhado das atividades...',
        created_at: new Date().toISOString()
      }]);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados gerenciais');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (user) {
      loadGoals();
    }
  }, [user]);
  const handleCreateGoal = async () => {
    if (!newGoal.title || !newGoal.description) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    const goal: Goal = {
      id: Date.now().toString(),
      ...newGoal,
      current_value: 0,
      status: 'active',
      created_at: new Date().toISOString()
    };
    setGoals([...goals, goal]);
    setNewGoal({
      title: '',
      description: '',
      target_value: 0,
      period: 'monthly'
    });
    setShowNewGoalForm(false);
    toast.success('Meta criada com sucesso!');
  };
  const getStatusBadge = (status: string) => {
    const variants = {
      active: 'default',
      completed: 'secondary',
      paused: 'outline'
    };
    const labels = {
      active: 'Ativa',
      completed: 'Concluída',
      paused: 'Pausada'
    };
    return <Badge variant={variants[status as keyof typeof variants] as any}>
        {labels[status as keyof typeof labels]}
      </Badge>;
  };
  const getProgressPercentage = (current: number, target: number) => {
    return target > 0 ? Math.min(current / target * 100, 100) : 0;
  };
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Gestão</h1>
      </div>

      {/* Metas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Metas e Objetivos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {showNewGoalForm && (
              <Card className="p-4 border-dashed">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title">Título da Meta</Label>
                    <Input
                      id="title"
                      value={newGoal.title}
                      onChange={(e) => setNewGoal({...newGoal, title: e.target.value})}
                      placeholder="Ex: Meta de Visitas Mensais"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea
                      id="description"
                      value={newGoal.description}
                      onChange={(e) => setNewGoal({...newGoal, description: e.target.value})}
                      placeholder="Descreva a meta..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="target">Valor Alvo</Label>
                    <Input
                      id="target"
                      type="number"
                      value={newGoal.target_value}
                      onChange={(e) => setNewGoal({...newGoal, target_value: Number(e.target.value)})}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleCreateGoal}>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar Meta
                    </Button>
                    <Button variant="outline" onClick={() => setShowNewGoalForm(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              </Card>
            )}
            
            {!showNewGoalForm && (
              <Button onClick={() => setShowNewGoalForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Meta
              </Button>
            )}

            <div className="grid gap-4">
              {goals.map((goal) => (
                <Card key={goal.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold">{goal.title}</h3>
                      {getStatusBadge(goal.status)}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{goal.description}</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progresso</span>
                        <span>{goal.current_value} / {goal.target_value}</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${getProgressPercentage(goal.current_value, goal.target_value)}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Relatórios */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Relatórios Gerenciais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {reports.map((report) => (
              <Card key={report.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{report.title}</h3>
                      <p className="text-sm text-muted-foreground">{report.description}</p>
                      <Badge variant="outline" className="mt-2">
                        {report.type}
                      </Badge>
                    </div>
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4 mr-2" />
                      Visualizar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
export default Management;