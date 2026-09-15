import React from 'react';
import { Building2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUserFiliais } from '@/hooks/useUserFiliais';

/**
 * M3 — Etapa 2: seletor de Filial Ativa no cabeçalho.
 *
 * - Só aparece quando o usuário tem 2+ filiais autorizadas.
 * - As opções vêm exclusivamente de `useUserFiliais` (get_user_filial_ids).
 * - Admin/manager global ganham a opção "Todas as filiais" (valor nulo).
 * - Não altera a filial principal do cadastro nem vínculos em user_filiais.
 */

const ALL = '__all__';

export const FilialSelector: React.FC = () => {
  const { filiais, activeFilialId, setActiveFilialId, isMultiFilial, isGlobal, isLoading } =
    useUserFiliais();

  if (isLoading || !isMultiFilial) return null;

  const value = activeFilialId ?? (isGlobal ? ALL : '');

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground hidden sm:block" />
      <Select
        value={value}
        onValueChange={(next) => setActiveFilialId(next === ALL ? null : next)}
      >
        <SelectTrigger
          className="h-8 w-[140px] sm:w-[190px] text-xs sm:text-sm"
          aria-label="Filial ativa"
        >
          <SelectValue placeholder="Filial ativa" />
        </SelectTrigger>
        <SelectContent align="end" className="z-50">
          {isGlobal && <SelectItem value={ALL}>Todas as filiais</SelectItem>}
          {filiais.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.nome}
              {f.isPrimary ? ' (principal)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
