
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import CreateTask from './CreateTask';
import { OfflineIndicator } from '@/components/OfflineIndicator';

const CreateFieldVisit: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/create-task')}
            className="flex items-center gap-2 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <h1 className="text-xl sm:text-2xl font-bold">Visita à Fazenda</h1>
        </div>
        <div className="w-full sm:w-80">
          <OfflineIndicator />
        </div>
      </div>
      
      <div className="min-h-0">
        <CreateTask taskType="field-visit" />
      </div>
    </div>
  );
};

export default CreateFieldVisit;
