import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import CreateTask from './CreateTask';

const CreateWorkshopChecklist: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/create-task')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <h1 className="text-2xl font-bold">Checklist da Oficina</h1>
      </div>
      
      <div className="min-h-0">
        <CreateTask taskType="workshop-checklist" />
      </div>
    </div>
  );
};

export default CreateWorkshopChecklist;