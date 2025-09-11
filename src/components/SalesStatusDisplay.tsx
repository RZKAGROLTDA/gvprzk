import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Clock, DollarSign } from 'lucide-react';
import { Task } from '@/types/task';
import { mapSalesStatus, getStatusLabel, getStatusColor } from '@/lib/taskStandardization';
import { calculateTaskSalesValue, calculatePartialSalesValue } from '@/lib/salesValueCalculator';
import { getSalesValueAsNumber } from '@/lib/securityUtils';

interface SalesStatusDisplayProps {
  task: Task;
  showDetails?: boolean;
  showLossReason?: boolean;
}

export const SalesStatusDisplay: React.FC<SalesStatusDisplayProps> = ({
  task,
  showDetails = true,
  showLossReason = true
}) => {
  const salesStatus = mapSalesStatus(task);
  const totalSalesValue = getSalesValueAsNumber(task.salesValue);
  const partialSalesValue = calculatePartialSalesValue(task);
  const finalSalesValue = calculateTaskSalesValue(task);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ganho': return <TrendingUp className="w-5 h-5" />;
      case 'perdido': return <TrendingDown className="w-5 h-5" />;
      case 'parcial': return <DollarSign className="w-5 h-5" />;
      case 'prospect': return <Clock className="w-5 h-5" />;
      default: return <Clock className="w-5 h-5" />;
    }
  };

  const getStatusDescription = (status: string) => {
    switch (status) {
      case 'ganho': return 'Venda Total realizada com sucesso';
      case 'perdido': return 'Oportunidade não convertida';
      case 'parcial': return 'Venda Parcial realizada';
      case 'prospect': return 'Negociação em andamento';
      default: return 'Negociação em andamento';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getStatusIcon(salesStatus)}
          Status da Oportunidade
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Badge className={`${getStatusColor(salesStatus)} text-lg px-4 py-2`}>
              {getStatusLabel(salesStatus)}
            </Badge>
            <p className="text-sm text-muted-foreground">
              {getStatusDescription(salesStatus)}
            </p>
          </div>
        </div>

        {showDetails && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Valor Total da Oportunidade
                </label>
                <p className="text-xl font-bold text-primary">
                  R$ {totalSalesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>

              {salesStatus === 'parcial' && partialSalesValue > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Valor da Venda Parcial
                  </label>
                  <p className="text-xl font-bold text-green-600">
                    R$ {partialSalesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Valor Final Realizado
                </label>
                <p className={`text-xl font-bold ${
                  salesStatus === 'ganho' ? 'text-green-600' : 
                  salesStatus === 'parcial' ? 'text-yellow-600' : 
                  salesStatus === 'perdido' ? 'text-red-600' : 'text-blue-600'
                }`}>
                  R$ {finalSalesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>

              {salesStatus === 'parcial' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Valor Não Realizado
                  </label>
                  <p className="text-xl font-bold text-red-500">
                    R$ {(totalSalesValue - partialSalesValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {showLossReason && salesStatus === 'perdido' && task.prospectNotes && (
          <div className="space-y-2 pt-4 border-t">
            <label className="text-sm font-medium text-muted-foreground">
              Motivo da Perda
            </label>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 font-medium">{task.prospectNotes}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};