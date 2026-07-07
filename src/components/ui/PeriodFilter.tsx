import React, { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn, formatDateDisplay, formatDateToLocal } from '@/lib/utils';

/**
 * Filtro de Período padronizado — mesmo componente/comportamento/estilo em todos
 * os painéis gerenciais (CRM, Análise Gerencial, Performance).
 *
 * Opções:
 * - today, yesterday, 7, 15, 30, 60, 90, this_month, last_month, custom
 *
 * NÃO altera regras de negócio. Apenas encapsula a UI e o cálculo do intervalo.
 */

export type PeriodPreset =
  | 'today'
  | 'yesterday'
  | '7'
  | '15'
  | '30'
  | '60'
  | '90'
  | 'this_month'
  | 'last_month'
  | 'custom';

export interface PeriodValue {
  preset: PeriodPreset;
  /** Data inicial calculada (Date). Null se preset não define. */
  startDate: Date | null;
  /** Data final calculada (Date). Null se preset não define. */
  endDate: Date | null;
  /** Strings YYYY-MM-DD prontas para RPC. */
  startStr: string | null;
  endStr: string | null;
}

export const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: '7', label: 'Últimos 7 dias' },
  { value: '15', label: 'Últimos 15 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '60', label: 'Últimos 60 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês passado' },
  { value: 'custom', label: 'Personalizado' },
];

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** Resolve preset → { startDate, endDate } (Datas locais). */
export const resolvePeriodRange = (
  preset: PeriodPreset,
  customStart?: Date,
  customEnd?: Date,
): { startDate: Date | null; endDate: Date | null } => {
  const today = startOfDay(new Date());
  const end = new Date();

  switch (preset) {
    case 'today':
      return { startDate: today, endDate: end };
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const yEnd = new Date(y);
      yEnd.setHours(23, 59, 59, 999);
      return { startDate: y, endDate: yEnd };
    }
    case '7':
    case '15':
    case '30':
    case '60':
    case '90': {
      const days = parseInt(preset, 10);
      const s = new Date(today);
      s.setDate(s.getDate() - days);
      return { startDate: s, endDate: end };
    }
    case 'this_month': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: s, endDate: end };
    }
    case 'last_month': {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
      return { startDate: s, endDate: e };
    }
    case 'custom':
      return {
        startDate: customStart ?? null,
        endDate: customEnd ?? null,
      };
    default:
      return { startDate: null, endDate: null };
  }
};

export const buildPeriodValue = (
  preset: PeriodPreset,
  customStart?: Date,
  customEnd?: Date,
): PeriodValue => {
  const { startDate, endDate } = resolvePeriodRange(preset, customStart, customEnd);
  return {
    preset,
    startDate,
    endDate,
    startStr: startDate ? formatDateToLocal(startDate) : null,
    endStr: endDate ? formatDateToLocal(endDate) : null,
  };
};

interface PeriodFilterProps {
  preset: PeriodPreset;
  customStart?: Date;
  customEnd?: Date;
  onChange: (value: PeriodValue) => void;
  className?: string;
  /** Rótulo acima do controle. */
  label?: string;
}

/**
 * Componente controlado. O caller mantém o estado (`preset`, `customStart`,
 * `customEnd`) e é notificado via `onChange`.
 */
export const PeriodFilter: React.FC<PeriodFilterProps> = ({
  preset,
  customStart,
  customEnd,
  onChange,
  className,
  label = 'Período',
}) => {
  const value = useMemo(
    () => buildPeriodValue(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );

  const handlePreset = (next: PeriodPreset) => {
    onChange(buildPeriodValue(next, customStart, customEnd));
  };
  const handleStart = (d?: Date) => {
    onChange(buildPeriodValue('custom', d, customEnd));
  };
  const handleEnd = (d?: Date) => {
    onChange(buildPeriodValue('custom', customStart, d));
  };

  return (
    <div className={cn('space-y-2', className)}>
      {label && <label className="text-sm font-medium">{label}</label>}
      <div className="flex flex-col md:flex-row gap-2">
        <Select value={preset} onValueChange={(v) => handlePreset(v as PeriodPreset)}>
          <SelectTrigger className="md:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {preset === 'custom' && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'justify-start text-left font-normal sm:w-44',
                    !value.startDate && 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {value.startDate ? formatDateDisplay(value.startDate) : 'Data inicial'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={value.startDate ?? undefined}
                  onSelect={handleStart}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'justify-start text-left font-normal sm:w-44',
                    !value.endDate && 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {value.endDate ? formatDateDisplay(value.endDate) : 'Data final'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={value.endDate ?? undefined}
                  onSelect={handleEnd}
                  initialFocus
                  disabled={(date) =>
                    value.startDate ? date < value.startDate : false
                  }
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
    </div>
  );
};

export default PeriodFilter;
