import React from 'react';
import { Eye, Loader2, MapPin, Phone, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatSalesValue } from '@/lib/securityUtils';
import type { ConsolidatedMetrics } from '@/hooks/useConsolidatedSalesMetrics';
import type { ActivityKind, FunnelStage } from '@/lib/salesFunnelView';

type Funnel = ConsolidatedMetrics['funnel'];

const TONE: Record<FunnelStage, { text: string; soft: string; ring: string; fill: string }> = {
  contacts: { text: 'text-metric-activities', soft: 'bg-metric-activities-soft', ring: 'ring-metric-activities', fill: 'bg-metric-activities' },
  prospects: { text: 'text-metric-clients', soft: 'bg-metric-clients-soft', ring: 'ring-metric-clients', fill: 'bg-metric-clients' },
  sales: { text: 'text-metric-visits', soft: 'bg-metric-visits-soft', ring: 'ring-metric-visits', fill: 'bg-metric-visits' },
  partial: { text: 'text-metric-calls', soft: 'bg-metric-calls-soft', ring: 'ring-metric-calls', fill: 'bg-metric-calls' },
  lost: { text: 'text-metric-lost', soft: 'bg-metric-lost-soft', ring: 'ring-metric-lost', fill: 'bg-metric-lost' },
};

export const STAGE_LABEL: Record<FunnelStage, string> = {
  contacts: 'Contatos com clientes',
  prospects: 'Prospecção',
  sales: 'Vendas fechadas',
  partial: 'Vendas parciais',
  lost: 'Vendas perdidas',
};

const Trapezoid: React.FC<{
  stage: FunnelStage; widthPct: number; selected: boolean; onClick: () => void;
  count: number; value?: number; extra?: React.ReactNode;
}> = ({ stage, widthPct, selected, onClick, count, value, extra }) => {
  const t = TONE[stage];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="group mx-auto block w-full focus-visible:outline-none"
      style={{ maxWidth: `${widthPct}%` }}
    >
      <div
        className={cn('relative border border-border px-[12%] py-5 text-center transition-all', t.soft,
          selected ? 'ring-2 ring-offset-2 ring-offset-background ' + t.ring : 'group-hover:brightness-[0.97]')}
        style={{ clipPath: 'polygon(0 0, 100% 0, 92% 100%, 8% 100%)' }}
      >
        <div className={cn('text-xs font-semibold uppercase tracking-wide break-words', t.text)}>{STAGE_LABEL[stage]}</div>
        <div className={cn('text-3xl font-bold tabular-nums leading-tight sm:text-4xl', t.text)}>{count.toLocaleString('pt-BR')}</div>
        {value !== undefined && <div className="text-base font-semibold tabular-nums text-foreground/90">{formatSalesValue(value)}</div>}
        {extra}
      </div>
    </button>
  );
};

const Branch: React.FC<{ stage: FunnelStage; selected: boolean; onClick: () => void; count: number; value: number }> = ({ stage, selected, onClick, count, value }) => {
  const t = TONE[stage];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn('flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-colors',
        selected ? 'border-2 ' + t.ring.replace('ring-', 'border-') + ' ' + t.soft : 'border-border hover:bg-muted/50')}
    >
      <span className={cn('h-8 w-1 rounded-full', t.fill)} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-muted-foreground">{STAGE_LABEL[stage]}</span>
        <span className={cn('block text-lg font-bold tabular-nums', t.text)}>{count.toLocaleString('pt-BR')}</span>
        <span className="block text-xs text-foreground/80">{formatSalesValue(value)}</span>
      </span>
    </button>
  );
};

export const SalesFunnelChart: React.FC<{ funnel: Funnel; selected: FunnelStage; onSelect: (s: FunnelStage) => void }> = ({ funnel, selected, onSelect }) => (
  <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
    <div className="space-y-2">
      <Trapezoid stage="contacts" widthPct={100} selected={selected === 'contacts'} onClick={() => onSelect('contacts')}
        count={funnel.totalContatos}
        extra={<div className="mt-1 text-xs text-muted-foreground">
          {funnel.visitas.count} visitas · {funnel.ligacoes.count} ligações · {funnel.checklists.count} checklists
        </div>} />
      <Trapezoid stage="prospects" widthPct={88} selected={selected === 'prospects'} onClick={() => onSelect('prospects')}
        count={funnel.prospeccoesAbertas.count} value={funnel.prospeccoesAbertas.value}
        extra={<div className="mt-1 text-xs leading-snug text-muted-foreground">
          Abertas · Fechadas {funnel.prospeccoesFechadas.count} ({formatSalesValue(funnel.prospeccoesFechadas.value)}) · Perdidas {funnel.prospeccoesPerdidas.count}
        </div>} />
      <Trapezoid stage="sales" widthPct={76} selected={selected === 'sales'} onClick={() => onSelect('sales')}
        count={funnel.vendasTotal.count} value={funnel.vendasTotal.value}
        extra={<div className="mt-1 text-xs text-muted-foreground">Vendas totais · {funnel.totalVendas} com parciais</div>} />
    </div>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
      <p className="col-span-2 text-xs font-medium text-muted-foreground lg:col-span-1">Desdobramentos</p>
      <Branch stage="partial" selected={selected === 'partial'} onClick={() => onSelect('partial')} count={funnel.vendasParcial.count} value={funnel.vendasParcial.value} />
      <Branch stage="lost" selected={selected === 'lost'} onClick={() => onSelect('lost')} count={funnel.prospeccoesPerdidas.count} value={funnel.prospeccoesPerdidas.value} />
      <div className="col-span-2 rounded-lg border border-border bg-card px-3 py-2 lg:col-span-1">
        <span className="block text-xs font-medium text-muted-foreground">Taxa de conversão (atual)</span>
        <span className="block text-lg font-bold tabular-nums text-foreground">{funnel.taxaConversao.toFixed(1)}%</span>
        <span className="block text-xs text-muted-foreground">{funnel.totalVendas} vendas de {funnel.totalContatos} contatos</span>
        <span className="mt-1 block border-t border-border pt-1 text-[11px] leading-snug text-muted-foreground">
          Base: vendas totais + parciais ÷ total de contatos (visitas, ligações e checklists) no período e filtros.
        </span>
      </div>
    </div>
  </div>
);

const ACTIVITY_TILES: { kind: ActivityKind; label: string; icon: React.ElementType; key: 'visitas' | 'ligacoes' | 'checklists'; tone: string }[] = [
  { kind: 'prospection', label: 'Visitas', icon: MapPin, key: 'visitas', tone: 'text-metric-visits' },
  { kind: 'ligacao', label: 'Ligações', icon: Phone, key: 'ligacoes', tone: 'text-metric-calls' },
  { kind: 'checklist', label: 'Checklists', icon: ClipboardCheck, key: 'checklists', tone: 'text-metric-activities' },
];

export const ActivityBreakdown: React.FC<{ funnel: Funnel; selected: ActivityKind | null; onSelect: (k: ActivityKind | null) => void }> = ({ funnel, selected, onSelect }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
    {ACTIVITY_TILES.map(({ kind, label, icon: Icon, key, tone }) => {
      const on = selected === kind;
      return (
        <button key={kind} type="button" aria-pressed={on} onClick={() => onSelect(on ? null : kind)}
          className={cn('flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors',
            on ? 'border-day-selected-border bg-day-selected' : 'border-border hover:bg-muted/50')}>
          <Icon className={cn('h-5 w-5', tone)} />
          <span className="flex-1">
            <span className="block text-sm font-medium">{label}</span>
            <span className="block text-xs text-muted-foreground">{formatSalesValue(funnel[key].value)}</span>
          </span>
          <span className={cn('text-2xl font-bold tabular-nums', tone)}>{funnel[key].count}</span>
        </button>
      );
    })}
  </div>
);

export interface FunnelRow {
  key: string;
  client: string;
  seller: string;
  filial: string;
  type: string;
  opportunityValue: number;
  soldValue: number;
  status: string;
  date: string;
  onView: () => void;
}

export const FunnelRecords: React.FC<{
  rows: FunnelRow[]; totalAvailable: number; hasMore: boolean; loadingMore: boolean; onLoadMore: () => void;
}> = ({ rows, totalAvailable, hasMore, loadingMore, onLoadMore }) => (
  <div className="space-y-3">
    {rows.length === 0 ? (
      <p className="py-8 text-center text-sm text-muted-foreground">Nenhum registro carregado para esta etapa com os filtros atuais.</p>
    ) : (
      <>
        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead><TableHead>Vendedor</TableHead><TableHead>Filial</TableHead>
                <TableHead>Atividade</TableHead><TableHead className="text-right">Valor oportunidade</TableHead>
                <TableHead className="text-right">Valor vendido</TableHead><TableHead>Status</TableHead>
                <TableHead>Data</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">{r.client}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.seller}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.filial}</TableCell>
                  <TableCell><Badge variant="outline">{r.type}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{formatSalesValue(r.opportunityValue)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-metric-visits">{formatSalesValue(r.soldValue)}</TableCell>
                  <TableCell><Badge variant="secondary" className="whitespace-nowrap">{r.status}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                  <TableCell><Button variant="outline" size="sm" onClick={r.onView}><Eye className="mr-1 h-4 w-4" />Ver</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="space-y-2 md:hidden">
          {rows.map(r => (
            <div key={r.key} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.client}</p>
                  <p className="text-xs text-muted-foreground">{r.seller} · {r.filial}</p>
                </div>
                <Button variant="outline" size="sm" onClick={r.onView}><Eye className="h-4 w-4" /></Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{r.type}</Badge><Badge variant="secondary">{r.status}</Badge>
                <span className="text-muted-foreground">{r.date}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 text-xs">
                <span>Oportunidade: <b className="tabular-nums">{formatSalesValue(r.opportunityValue)}</b></span>
                <span>Vendido: <b className="tabular-nums text-metric-visits">{formatSalesValue(r.soldValue)}</b></span>
              </div>
            </div>
          ))}
        </div>
      </>
    )}
    <div className="text-center text-xs text-muted-foreground">
      {rows.length} registro(s) exibido(s) dos {totalAvailable.toLocaleString('pt-BR')} carregáveis com os filtros.
      {hasMore && (
        <div className="mt-2">
          <Button variant="outline" size="sm" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando...</> : 'Carregar mais registros'}
          </Button>
        </div>
      )}
    </div>
  </div>
);
