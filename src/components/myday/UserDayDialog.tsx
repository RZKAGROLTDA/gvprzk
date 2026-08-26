import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { ExecutionCards } from '@/components/myday/ExecutionCards';
import { PendingBlock } from '@/components/myday/PendingBlock';
import { useMyDayUserSummary } from '@/hooks/useMyDay';
import { getRoleLabel } from '@/lib/roles';
import type { MyDayBucket, MyDayTeamRow } from '@/lib/myDay';

const BUCKETS: MyDayBucket[] = ['overdue', 'today', 'upcoming'];

interface UserDayDialogProps {
  open: boolean;
  member: MyDayTeamRow | null;
  onOpenChange: (open: boolean) => void;
}

/** Meu Dia do colaborador em modo somente leitura (carregado sob demanda). */
export const UserDayDialog: React.FC<UserDayDialogProps> = ({ open, member, onOpenChange }) => {
  const { data, isLoading, isError } = useMyDayUserSummary(member?.user_id ?? null, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">
            {member?.name ?? 'Colaborador'}
          </DialogTitle>
          <DialogDescription>
            {member ? getRoleLabel(member.role) : ''}
            {member?.filial_nome ? ` • ${member.filial_nome}` : ''} — visualização somente leitura
          </DialogDescription>
        </DialogHeader>

        {isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Não foi possível carregar o dia deste colaborador</AlertTitle>
            <AlertDescription>Verifique suas permissões e tente novamente.</AlertDescription>
          </Alert>
        ) : isLoading || !data ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <ExecutionCards visitas={data.goals?.visitas} ligacoes={data.goals?.ligacoes} />
            <div className="space-y-3">
              {BUCKETS.map((bucket) => (
                <PendingBlock
                  key={bucket}
                  bucket={bucket}
                  summary={data}
                  defaultOpen={bucket === 'overdue'}
                  onSelect={() => undefined}
                  onSeeAll={() => undefined}
                />
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
