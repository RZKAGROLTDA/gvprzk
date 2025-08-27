import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LOSS_REASONS } from './TaskFormCore';

export interface StatusSelectionProps {
  salesConfirmed?: boolean | null;
  salesType?: 'total' | 'parcial';
  prospectNotes?: string;
  isProspect?: boolean;
  onStatusChange: (status: { 
    salesConfirmed?: boolean | null; 
    salesType?: 'total' | 'parcial';
    isProspect?: boolean; 
    prospectNotes?: string 
  }) => void;
  showError?: boolean;
  errorMessage?: string;
}

export const StatusSelectionComponent: React.FC<StatusSelectionProps> = ({
  salesConfirmed,
  salesType,
  prospectNotes,
  isProspect,
  onStatusChange,
  showError = false,
  errorMessage
}) => {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-base font-medium">Status do Prospect</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
          {/* Prospect Em Andamento */}
          <div 
            className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
              salesConfirmed === undefined && isProspect
                ? 'border-blue-500 bg-blue-50 shadow-lg' 
                : 'border-gray-200 bg-white hover:border-blue-300'
            }`} 
            onClick={() => {
              onStatusChange({
                salesConfirmed: undefined,
                isProspect: true,
                prospectNotes: ''
              });
            }}
          >
            <div className="flex flex-col items-center text-center space-y-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                salesConfirmed === undefined && isProspect
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 text-gray-400'
              }`}>
                ⏳
              </div>
              <div>
                <div className="font-medium text-sm">Prospect Em Andamento</div>
                <div className="text-xs text-muted-foreground">Negociação em curso</div>
              </div>
            </div>
            {salesConfirmed === undefined && isProspect && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
            )}
          </div>
          
          {/* Vendas Total */}
          <div 
            className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
              salesConfirmed === true && salesType === 'total'
                ? 'border-green-500 bg-green-50 shadow-lg' 
                : 'border-gray-200 bg-white hover:border-green-300'
            }`} 
            onClick={() => {
              onStatusChange({
                salesConfirmed: true,
                salesType: 'total',
                isProspect: true,
                prospectNotes: ''
              });
            }}
          >
            <div className="flex flex-col items-center text-center space-y-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                salesConfirmed === true && salesType === 'total'
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-100 text-gray-400'
              }`}>
                💰
              </div>
              <div>
                <div className="font-medium text-sm">Vendas Total</div>
                <div className="text-xs text-muted-foreground">Negócio 100% fechado</div>
              </div>
            </div>
            {salesConfirmed === true && salesType === 'total' && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
            )}
          </div>

          {/* Vendas Parcial */}
          <div 
            className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
              salesConfirmed === true && salesType === 'parcial'
                ? 'border-yellow-500 bg-yellow-50 shadow-lg' 
                : 'border-gray-200 bg-white hover:border-yellow-300'
            }`} 
            onClick={() => {
              onStatusChange({
                salesConfirmed: true,
                salesType: 'parcial',
                isProspect: true,
                prospectNotes: ''
              });
            }}
          >
            <div className="flex flex-col items-center text-center space-y-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                salesConfirmed === true && salesType === 'parcial'
                  ? 'bg-yellow-500 text-white' 
                  : 'bg-gray-100 text-gray-400'
              }`}>
                📊
              </div>
              <div>
                <div className="font-medium text-sm">Vendas Parcial</div>
                <div className="text-xs text-muted-foreground">Negócio parcialmente fechado</div>
              </div>
            </div>
            {salesConfirmed === true && salesType === 'parcial' && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
            )}
          </div>
          
          {/* Venda Perdida */}
          <div 
            className={`relative cursor-pointer p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
              salesConfirmed === false 
                ? 'border-red-500 bg-red-50 shadow-lg' 
                : 'border-gray-200 bg-white hover:border-red-300'
            }`} 
            onClick={() => {
              console.log('🔍 StatusSelection - Venda perdida selecionada');
              onStatusChange({
                salesConfirmed: false,
                salesType: undefined,
                isProspect: true,
                prospectNotes: prospectNotes || ''
              });
            }}
          >
            <div className="flex flex-col items-center text-center space-y-2">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                salesConfirmed === false 
                  ? 'bg-red-500 text-white' 
                  : 'bg-gray-100 text-gray-400'
              }`}>
                ❌
              </div>
              <div>
                <div className="font-medium text-sm">Venda Perdida</div>
                <div className="text-xs text-muted-foreground">Negócio não realizado</div>
              </div>
            </div>
            {salesConfirmed === false && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Campo obrigatório para motivo da perda */}
      {salesConfirmed === false && (
        <div className="space-y-2">
          <Label htmlFor="lossReason" className="text-sm font-medium">
            Motivo da Perda *
          </Label>
          <Select 
            value={prospectNotes || ''} 
            onValueChange={(value) => {
              console.log('🔍 StatusSelection - Motivo da perda selecionado:', value);
              onStatusChange({
                salesConfirmed: false,
                salesType: undefined,
                isProspect: true,
                prospectNotes: value
              });
            }}
          >
            <SelectTrigger className={showError && (!prospectNotes || prospectNotes.trim() === '') ? 'border-red-500' : ''}>
              <SelectValue placeholder="Selecione o motivo da perda" />
            </SelectTrigger>
            <SelectContent>
              {LOSS_REASONS.map((reason) => (
                <SelectItem key={reason} value={reason}>
                  {reason}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showError && (!prospectNotes || prospectNotes.trim() === '') && (
            <p className="text-sm text-red-500">
              {errorMessage || 'O motivo da perda é obrigatório'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};