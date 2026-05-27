import React, { useMemo } from 'react';
import {
  TaskHeader,
  SummaryCards,
  NextActionCard,
  OpportunitySummary,
  MobileStickyFooter,
  type SummaryCardItem,
} from '@/components/task-form';
import {
  TaskFormSnapshotProvider,
  useTaskFormSnapshot,
} from '@/components/task-form/FieldVisitSnapshotContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Coins,
  Package,
  CalendarCheck2,
  User2,
  Wrench,
  Phone,
  PhoneCall,
} from 'lucide-react';
import CreateTask from './CreateTask';
import { useProfile } from '@/hooks/useProfile';
import { getSalesValueAsNumber } from '@/lib/securityUtils';
import type { ProductType } from '@/types/task';

const SERVICE_CATEGORIES = new Set(['services']);

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function computeCallScore(args: {
  hasClient: boolean;
  itemsCount: number;
  totalValue: number;
  hasObservations: boolean;
  hasReminder: boolean;
}): number {
  let s = 0;
  if (args.hasClient) s += 25;
  if (args.itemsCount > 0) s += Math.min(30, args.itemsCount * 8);
  if (args.totalValue > 0) s += Math.min(20, Math.log10(args.totalValue + 1) * 6);
  if (args.hasObservations) s += 10;
  if (args.hasReminder) s += 15;
  return Math.max(0, Math.min(100, Math.round(s)));
}

const CallShell: React.FC = () => {
  const { profile } = useProfile();
  const { task, checklist, callProducts } = useTaskFormSnapshot();

  // Ligação usa principalmente callProducts; checklist serve de fallback se vier preenchido.
  const allOffered: ProductType[] = useMemo(() => {
    const merged = [...callProducts, ...checklist];
    const seen = new Set<string>();
    return merged.filter(p => {
      if (!p.selected) return false;
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [callProducts, checklist]);

  const parts = useMemo(
    () => allOffered.filter(p => !SERVICE_CATEGORIES.has(p.category)),
    [allOffered],
  );
  const services = useMemo(
    () => allOffered.filter(p => SERVICE_CATEGORIES.has(p.category)),
    [allOffered],
  );

  const totalValue = useMemo(() => {
    const fromItems = allOffered.reduce(
      (sum, p) => sum + (p.price || 0) * (p.quantity || 1),
      0,
    );
    if (fromItems > 0) return fromItems;
    return getSalesValueAsNumber(task.salesValue) || 0;
  }, [allOffered, task.salesValue]);

  const nextReminder = useMemo(() => {
    const list = task.reminders ?? [];
    const upcoming = list
      .filter(r => !r.completed)
      .map(r => ({ ...r, date: r.date instanceof Date ? r.date : new Date(r.date) }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return upcoming[0];
  }, [task.reminders]);

  const score = useMemo(
    () =>
      computeCallScore({
        hasClient: !!task.client,
        itemsCount: allOffered.length,
        totalValue,
        hasObservations: !!(task.observations && task.observations.trim().length > 10),
        hasReminder: !!nextReminder,
      }),
    [task.client, task.observations, allOffered.length, totalValue, nextReminder],
  );

  const summary: SummaryCardItem[] = [
    {
      icon: Coins,
      label: 'Valor ofertado',
      value: formatBRL(totalValue),
      hint: totalValue > 0 ? 'Calculado dos itens ofertados' : 'Selecione itens para calcular',
      tone: 'primary',
    },
    {
      icon: Package,
      label: 'Itens ofertados',
      value: `Peças ${parts.length} · Serviços ${services.length}`,
      hint: `${allOffered.length} item(ns) no total`,
    },
    {
      icon: PhoneCall,
      label: 'Filial atendida',
      value: task.filialAtendida || task.filial || profile?.filial_nome || '—',
      hint: 'Filial alvo da ligação',
    },
    {
      icon: CalendarCheck2,
      label: 'Retorno agendado',
      value: nextReminder
        ? nextReminder.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
        : 'A definir',
      hint: nextReminder?.title ?? 'Agende um retorno na aba Retorno',
      tone: nextReminder ? 'success' : 'warning',
    },
  ];

  const statusLabel = task.salesType
    ? task.salesType === 'ganho'
      ? 'Ganho'
      : task.salesType === 'parcial'
        ? 'Parcial'
        : task.salesType === 'perdido'
          ? 'Perdido'
          : 'Prospect'
    : 'Em andamento';

  const statusVariant =
    task.salesType === 'ganho'
      ? 'success'
      : task.salesType === 'perdido'
        ? 'destructive'
        : task.salesType === 'parcial'
          ? 'warning'
          : 'secondary';

  return (
    <div className="space-y-4 sm:space-y-6">
      <TaskHeader
        title="Ligação para Cliente"
        subtitle="Registre o contato, ofereça produtos e serviços, e agende o retorno."
        status={{ label: statusLabel, variant: statusVariant as any }}
        score={score}
        client={task.client || undefined}
        filial={task.filialAtendida || task.filial || profile?.filial_nome || undefined}
        consultant={task.responsible || profile?.name || undefined}
        backTo="/create-task"
      />

      <SummaryCards items={summary} />

      <Tabs defaultValue="cliente" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="cliente" className="gap-1.5">
            <User2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Cliente</span>
          </TabsTrigger>
          <TabsTrigger value="oferta" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Oferta</span>
          </TabsTrigger>
          <TabsTrigger value="retorno" className="gap-1.5">
            <CalendarCheck2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Retorno</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cliente">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resumo do cliente</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SnapField label="Cliente" value={task.client} />
                <SnapField label="Código" value={task.clientCode} />
                <SnapField label="Telefone" value={task.phone} icon={<Phone className="h-3.5 w-3.5" />} />
                <SnapField label="E-mail" value={task.email} />
                <SnapField label="Filial atendida" value={task.filialAtendida || task.filial} />
                <SnapField label="Função do contato" value={task.function} />
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Edite os dados do cliente no formulário abaixo.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="oferta" className="space-y-4">
          <OpportunitySummary
            totalValue={totalValue}
            partsCount={parts.length}
            servicesCount={services.length}
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <OfferList
              title="Peças"
              icon={<Package className="h-4 w-4" />}
              items={parts}
              emptyHint="Marque peças no formulário abaixo."
            />
            <OfferList
              title="Serviços"
              icon={<Wrench className="h-4 w-4" />}
              items={services}
              emptyHint="Marque serviços no formulário abaixo."
              accent
            />
          </div>
        </TabsContent>

        <TabsContent value="retorno" className="space-y-4">
          <NextActionCard
            empty={!nextReminder}
            title={nextReminder?.title}
            description={nextReminder?.description}
            date={nextReminder?.date}
          />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notas do contato</CardTitle>
            </CardHeader>
            <CardContent>
              {task.observations ? (
                <p className="text-sm whitespace-pre-wrap text-foreground/90">{task.observations}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma nota registrada. Use o formulário abaixo.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/*
        Motor de gravação intacto: prospect/ganho/parcial/perdido, valor, offline e
        contratos com Supabase continuam controlados aqui dentro. Sem checklist,
        fotos pesadas ou geolocalização — Ligação herda o mesmo motor configurado
        via taskType="call".
      */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-muted-foreground">Formulário completo</CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-4">
          <CreateTask taskType="call" />
        </CardContent>
      </Card>

      <MobileStickyFooter score={score}>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {formatBRL(totalValue)} · {allOffered.length} item(ns)
        </span>
      </MobileStickyFooter>
    </div>
  );
};

const SnapField: React.FC<{ label: string; value?: string | null; icon?: React.ReactNode }> = ({
  label,
  value,
  icon,
}) => (
  <div className="min-w-0">
    <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
      {icon}
      {label}
    </dt>
    <dd className="mt-0.5 text-sm font-medium truncate">
      {value && String(value).trim() ? value : <span className="text-muted-foreground/60">—</span>}
    </dd>
  </div>
);

const OfferList: React.FC<{
  title: string;
  icon: React.ReactNode;
  items: { id: string; name: string; quantity?: number; price?: number }[];
  emptyHint: string;
  accent?: boolean;
}> = ({ title, icon, items, emptyHint, accent }) => {
  const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
  return (
    <Card className={accent ? 'border-accent/40' : undefined}>
      <CardHeader className="pb-3 flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
        <Badge variant="outline" className="font-mono">
          {items.length}
        </Badge>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
        ) : (
          <>
            <ul className="divide-y">
              {items.map(it => (
                <li key={it.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate" title={it.name}>
                    {it.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {it.quantity || 1}× {formatBRL(it.price || 0)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t pt-2 text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold tabular-nums">{formatBRL(subtotal)}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

const CallForm: React.FC = () => (
  <TaskFormSnapshotProvider>
    <CallShell />
  </TaskFormSnapshotProvider>
);

export default CallForm;
