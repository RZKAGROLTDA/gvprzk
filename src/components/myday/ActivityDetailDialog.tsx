import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useMyDayActivityDetail } from '@/hooks/useMyDay';
import { BLOCK_LABELS, type MyDayItem } from '@/lib/myDay';
import { formatDateDisplay } from '@/lib/utils';

const LABELS: Record<string, string> = {
  client_name: 'Cliente', client: 'Cliente', client_code: 'Código', clientcode: 'Código',
  client_property: 'Propriedade', property: 'Propriedade', client_phone: 'Telefone', phone: 'Telefone',
  client_email: 'E-mail', email: 'E-mail', contact_name: 'Contato', filial: 'Filial',
  seller_name: 'Vendedor', responsible: 'Responsável', user_name: 'Colaborador', name: 'Nome',
  task_type: 'Tipo', activity_type: 'Tipo', status: 'Situação', priority: 'Prioridade',
  client_temperature: 'Temperatura', planned_date: 'Data programada', start_date: 'Início',
  end_date: 'Fim', start_time: 'Hora início', end_time: 'Hora fim', activity_date: 'Data da atividade',
  next_return_date: 'Próximo retorno', training_date: 'Data', training_time: 'Horário', hours: 'Horas',
  next_action: 'Próxima ação', next_action_date: 'Data da próxima ação', sales_type: 'Tipo de venda',
  sales_value: 'Valor', is_prospect: 'Prospecção', observation: 'Observação',
  observations: 'Observações', return_notes: 'Notas do retorno', notes: 'Notas',
  realized_at: 'Realizada em', created_at: 'Criada em', updated_at: 'Atualizada em',
};
const DATE_KEYS = /(_date|_at)$/;

const fmt = (key: string, v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (key === 'sales_value') return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (DATE_KEYS.test(key) || key === 'start_date' || key === 'end_date') {
    const s = String(v);
    return s.length > 10 ? new Date(s).toLocaleString('pt-BR') : formatDateDisplay(s);
  }
  return String(v);
};

interface Props {
  item: MyDayItem | null;
  userId: string | null;
  filialId: string | null;
  onOpenChange: (open: boolean) => void;
}

/** Detalhes completos da atividade, somente leitura. Fotos e documentos não são carregados. */
export const ActivityDetailDialog: React.FC<Props> = ({ item, userId, filialId, onOpenChange }) => {
  const { data, isLoading, isError } = useMyDayActivityDetail(userId, item?.block ?? null, item?.id ?? null, filialId);
  const rows = data
    ? Object.keys(LABELS).map((k) => [LABELS[k], fmt(k, data[k])] as const).filter(([, v]) => v)
    : [];

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{item ? BLOCK_LABELS[item.block] : ''}</DialogTitle>
          <DialogDescription>{item?.clientLabel} — somente leitura</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Atividade não encontrada ou não está mais disponível</AlertTitle>
            <AlertDescription>Ela pode ter sido removida ou estar fora do seu acesso.</AlertDescription>
          </Alert>
        ) : (
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
            {rows.map(([label, value]) => (
              <React.Fragment key={label + value}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="whitespace-pre-wrap break-words">{value}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
};
