import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSecurityCache } from '@/hooks/useSecurityCache';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  CheckSquare, 
  Clock, 
  MapPin, 
  User, 
  Calendar,
  Camera,
  FileText,
  TrendingUp,
  Eye,
  Edit,
  Trash2
} from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Task } from '@/types/task';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PhotoGallery } from '@/components/PhotoGallery';
import { TaskLocationInfo } from '@/components/TaskLocationInfo';
import { FormVisualization } from '@/components/FormVisualization';
import { SecureTaskDisplay } from '@/components/SecureTaskDisplay';

interface TaskCardProps {
  task: Task;
  onView?: (taskId: string) => void;
  onEdit?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onView, onEdit, onDelete }) => {
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const { isAdmin } = useUserRole();

  const handleDeleteTask = async () => {
    if (!confirm(`Tem certeza que deseja excluir a tarefa "${task.name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', task.id);

      if (error) throw error;

      toast.success('Tarefa excluída com sucesso');
      onDelete?.(task.id);
    } catch (error: any) {
      console.error('Erro ao excluir tarefa:', error);
      toast.error(error.message || 'Erro ao excluir tarefa');
    }
  };
  const { invalidateAll } = useSecurityCache();
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'warning';
      case 'low': return 'success';
      default: return 'secondary';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'in_progress': return 'warning';
      case 'pending': return 'secondary';
      default: return 'secondary';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Concluída';
      case 'in_progress': return 'Em Andamento';
      case 'pending': return 'Pendente';
      case 'closed': return 'Fechada';
      default: return status;
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high': return 'Alta';
      case 'medium': return 'Média';
      case 'low': return 'Baixa';
      default: return priority;
    }
  };

  const getProgressPercentage = () => {
    switch (task.status) {
      case 'completed': return 100;
      case 'in_progress': return 60;
      case 'pending': return 20;
      default: return 0;
    }
  };

  return (
    <Card className="hover:shadow-lg transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <CheckSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{task.name}</CardTitle>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                <div className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {task.responsible}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {format(task.startDate, "dd/MM/yyyy", { locale: ptBR })}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {task.startTime} - {task.endTime}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={getPriorityColor(task.priority)}>
              {getPriorityLabel(task.priority)}
            </Badge>
            <Badge variant={getStatusColor(task.status)}>
              {getStatusLabel(task.status)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Cliente e Localização */}
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{task.client}</span>
          <span className="text-muted-foreground">-</span>
          <span className="text-muted-foreground">{task.property}</span>
        </div>

        {/* Progresso */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="font-medium">Progresso</span>
            <span className="text-muted-foreground">{getProgressPercentage()}%</span>
          </div>
          <Progress value={getProgressPercentage()} className="h-2" />
        </div>

        {/* Observações */}
        {task.observations && (
          <div className="text-sm">
            <p className="text-muted-foreground line-clamp-2">
              {task.observations}
            </p>
          </div>
        )}

        {/* Check-in de Localização */}
        {task.checkInLocation && (
          <TaskLocationInfo checkInLocation={task.checkInLocation} compact />
        )}

        {/* Fotos */}
        {task.photos && task.photos.length > 0 && (
          <PhotoGallery photos={task.photos} maxDisplay={3} />
        )}

        {/* Informações Extras */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            {task.documents && task.documents.length > 0 && (
              <div className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                <span>{task.documents.length}</span>
              </div>
            )}
            {task.initialKm > 0 && task.finalKm > 0 && (
              <div>
                KM: {task.initialKm} - {task.finalKm} ({task.finalKm - task.initialKm} km)
              </div>
            )}
          </div>
          <div>
            Criado em {format(task.createdAt, "dd/MM/yyyy", { locale: ptBR })}
          </div>
        </div>

        {/* Badges adicionais */}
        <div className="flex items-center gap-2 flex-wrap">
          {task.isProspect && (
            <Badge variant="default">
              <TrendingUp className="h-3 w-3 mr-1" />
              Prospect
            </Badge>
          )}
          {task.salesConfirmed && (
            <Badge variant="success">
              Venda Confirmada
            </Badge>
          )}
          {task.salesValue && (
            <Badge variant="outline">
              R$ {task.salesValue.toLocaleString('pt-BR')}
            </Badge>
          )}
        </div>

        {/* Ações */}
        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsReportModalOpen(true)}
            className="flex-1"
          >
            <Eye className="h-4 w-4 mr-2" />
            Relatório
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => onEdit?.(task.id)}
            className="flex-1"
          >
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
          {isAdmin && (
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={handleDeleteTask}
              className="flex-1"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </Button>
          )}
        </div>
      </CardContent>

      {/* Modal de Relatório */}
      <FormVisualization
        task={task}
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onTaskUpdated={async () => {
          // Invalidar cache para garantir sincronização
          await invalidateAll();
        }}
      />
    </Card>
  );
};