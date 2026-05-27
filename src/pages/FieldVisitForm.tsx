import React, { useMemo } from 'react';
import {
  TaskHeader,
  SummaryCards,
  NextActionCard,
  OpportunitySummary,
  EquipmentCard,
  MobileStickyFooter,
  type SummaryCardItem,
} from '@/components/task-form';
import {
  FieldVisitSnapshotProvider,
  useFieldVisitSnapshot,
} from '@/components/task-form/FieldVisitSnapshotContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Coins,
  Tractor,
  Package,
  CalendarCheck2,
  User2,
  Wrench,
  ClipboardList,
} from 'lucide-react';
import CreateTask from './CreateTask';
import { useProfile } from '@/hooks/useProfile';
import { getSalesValueAsNumber } from '@/lib/securityUtils';

const SERVICE_CATEGORIES = new Set(['services']);

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/**
 * Calcula score visual da oportunidade (0-100). Puramente UI — não persistido.
 * Heurística leve baseada no preenchimento do formulário.
 */
function computeScore(args: {
  hasClient: boolean;
  equipmentCount: number;
  itemsCount: number;
  totalValue: number;
  hasObservations: boolean;
}): number {
  let s = 0;
  if (args.hasClient) s += 20;
  if (args.equipmentCount > 0) s += Math.min(20, args.equipmentCount * 7);
  if (args.itemsCount > 0) s += Math.min(30, args.itemsCount * 6);
  if (args.totalValue > 0) s += Math.min(20, Math.log10(args.totalValue + 1) * 6);
  if (args.hasObservations) s += 10;
  return Math.max(0, Math.min(100, Math.round(s)));
}

const FieldVisitShell: React.FC = () => {
  const { profile } = useProfile();
  const { task, checklist, equipmentList } = useFieldVisitSnapshot();

  const selectedItems = useMemo(() => checklist.filter(p => p.selected), [checklist]);
  const parts = useMemo(
    () => selectedItems.filter(p => !SERVICE_CATEGORIES.has(p.category)),
    [selectedItems],
  );
  const services = useMemo(
    () => selectedItems.filter(p => SERVICE_CATEGORIES.has(p.category)),
    [selectedItems],
  );

  const totalValue = useMemo(() => {
    const fromItems = selectedItems.reduce(
      (sum, p) => sum + (p.price || 0) * (p.quantity || 1),
      0,
    );
    if (fromItems > 0) return fromItems;
    return getSalesValueAsNumber(task.salesValue) || 0;
  }, [selectedItems, task.salesValue]);

  const score = useMemo(
    () =>
      computeScore({
        hasClient: !!task.client,
        equipmentCount: equipmentList.length,
        itemsCount: selectedItems.length,
        totalValue,
        hasObservations: !!(task.observations && task.observations.trim().length > 10),
      }),
    [task.client, task.observations, equipmentList.length, selectedItems.length, totalValue],
  );

  const nextReminder = useMemo(() => {
    const list = task.reminders ?? [];
    const upcoming = list
      .filter(r => !r.completed)
      .map(r => ({ ...r, date: r.date instanceof Date ? r.date : new Date(r.date) }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return upcoming[0];
  }, [task.reminders]);

  const summary: SummaryCardItem[] = [
    {
      icon: Coins,
      label: 'Valor oportunidade',
      value: formatBRL(totalValue),
      hint: totalValue > 0 ? 'Calculado dos itens selecionados' : 'Selecione itens para calcular',
      tone: 'primary',
    },
    {
      icon: Tractor,
      label: 'Equipamentos',
      value: String(equipmentList.length),
      hint: equipmentList.length
        ? equipmentList.map(e => e.familyProduct).filter(Boolean).slice(0, 2).join(' · ')
        : 'Adicione na aba Equipamentos',
    },
    {
      icon: Package,
      label: 'Itens da oferta',
      value: `Peças ${parts.length} · Serviços ${services.length}`,
      hint: `${selectedItems.length} item(ns) no total`,
    },
    {
      icon: CalendarCheck2,
      label: 'Próxima ação',
      value: nextReminder
        ? nextReminder.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
        : 'A definir',
      hint: nextReminder?.title ?? 'Agende um lembrete na aba Visita',
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
        title="Visita à Fazenda"
        subtitle="Registre a visita, ofereça produtos e serviços, e mantenha a oportunidade viva."
        status={{ label: statusLabel, variant: statusVariant as any }}
        score={score}
        client={task.client || undefined}
        filial={task.filial || profile?.filial_nome || undefined}
        consultant={task.responsible || profile?.name || undefined}
        backTo="/create-task"
      />

      <SummaryCards items={summary} />

      <Tabs defaultValue="cliente" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="cliente" className="gap-1.5">
            <User2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Cliente</span>
          </TabsTrigger>
          <TabsTrigger value="equipamentos" className="gap-1.5">
            <Tractor className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Equipamentos</span>
          </TabsTrigger>
          <TabsTrigger value="oferta" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Oferta</span>
          </TabsTrigger>
          <TabsTrigger value="visita" className="gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Visita</span>
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
                <SnapField label="Propriedade" value={task.property} />
                <SnapField label="Filial" value={task.filial} />
                <SnapField label="Telefone" value={task.phone} />
                <SnapField label="E-mail" value={task.email} />
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Edite os dados do cliente no formulário abaixo.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="equipamentos">
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-base">Equipamentos visitados</CardTitle>
              <Badge variant="outline">{equipmentList.length}</Badge>
            </CardHeader>
            <CardContent>
              {equipmentList.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum equipamento cadastrado ainda. Use o formulário abaixo para adicionar.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {equipmentList.map(eq => (
                    <EquipmentCard
                      key={eq.id}
                      item={{
                        id: eq.id,
                        familyProduct: eq.familyProduct,
                        quantity: eq.quantity,
                        hectares: task.propertyHectares,
                      }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="oferta" className="space-y-4">
          <OpportunitySummary
            totalValue={totalValue}
            partsCount={parts.length}
            servicesCount={services.length}
            equipmentCount={equipmentList.length}
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

        <TabsContent value="visita" className="space-y-4">
          <NextActionCard
            empty={!nextReminder}
            title={nextReminder?.title}
            description={nextReminder?.description}
            date={nextReminder?.date}
          />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Observações</CardTitle>
            </CardHeader>
            <CardContent>
              {task.observations ? (
                <p className="text-sm whitespace-pre-wrap text-foreground/90">
                  {task.observations}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma observação registrada. Use o formulário abaixo.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/*
        Motor de gravação intacto. Todos os campos, validações, fluxos de
        prospect/ganho/parcial/perdido, salvamento online/offline e contratos
        com Supabase continuam controlados aqui dentro. O snapshot acima é
        publicado por um useEffect interno no CreateTask — somente leitura,
        zero impacto em gravação ou histórico.
      */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-muted-foreground">Formulário completo</CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-4">
          <CreateTask taskType="field-visit" />
        </CardContent>
      </Card>

      <MobileStickyFooter score={score}>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {formatBRL(totalValue)} · {selectedItems.length} item(ns)
        </span>
      </MobileStickyFooter>
    </div>
  );
};

const SnapField: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div className="min-w-0">
    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium truncate">
      {value && value.trim() ? value : <span className="text-muted-foreground/60">—</span>}
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

const FieldVisitForm: React.FC = () => (
  <FieldVisitSnapshotProvider>
    <FieldVisitShell />
  </FieldVisitSnapshotProvider>
);

export default FieldVisitForm;
