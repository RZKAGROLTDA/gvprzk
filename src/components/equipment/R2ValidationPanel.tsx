/**
 * FERRAMENTA TEMPORÁRIA DE DIAGNÓSTICO (R2 — Regularização do Parque).
 * Visível apenas para Gestor/Admin. Somente leitura: chama as 3 RPCs da R2
 * com a sessão autenticada do usuário. Remover após a validação.
 */
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FlaskConical } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';

type Row = { label: string; expected?: string; got: string; ok?: boolean | null };

const EXPECTED = {
  pendentes: 395,
  vendidas: 255,
  inativas: 128,
  sucatas: 12,
  regularizadas: 0,
  semFilial: 379,
  grupos: 136,
};

export const R2ValidationPanel: React.FC = () => {
  const { isManager, isAdmin } = useUserRole();
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [raw, setRaw] = useState<string | null>(null);

  if (!isManager && !isAdmin) return null;

  const run = async () => {
    setRunning(true);
    setRows(null);
    setRaw(null);
    const out: Row[] = [];
    const dump: Record<string, unknown> = {};

    const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? NaN));
    const errText = (e: { code?: string; message?: string; details?: string; hint?: string } | null) =>
      e ? `ERRO ${[e.code, e.message, e.details, e.hint].filter(Boolean).join(' | ')}` : '';
    const cmp = (label: string, got: unknown, expected: number) => {
      const g = num(got);
      out.push({
        label,
        expected: String(expected),
        got: Number.isNaN(g) ? `campo ausente/inválido no retorno (${String(got)})` : String(g),
        ok: g === expected,
      });
    };

    try {
      // 1) KPIs sem filtros
      const kpis = await supabase.rpc('equipment_regularization_pending_kpis' as never, {
        p_filial_id: null,
        p_without_filial: false,
        p_situation: null,
        p_chassis: null,
        p_client: null,
      } as never);
      dump.kpis = kpis.error ?? kpis.data;

      if (kpis.error) {
        out.push({ label: 'KPIs sem filtros', got: errText(kpis.error), ok: false });
      } else {
        const k = (kpis.data ?? {}) as Record<string, unknown>;
        cmp('Pendentes', k.total_pending_machines ?? k.total_machines, EXPECTED.pendentes);
        cmp('Vendidas', k.total_vendida ?? k.total_vendidas, EXPECTED.vendidas);
        cmp('Inativas', k.total_inativa ?? k.total_inativas, EXPECTED.inativas);
        cmp('Sucatas', k.total_sucata ?? k.total_sucatas, EXPECTED.sucatas);
        cmp('Regularizadas', k.total_regularized, EXPECTED.regularizadas);
      }

      // 2) KPIs — filtro "Sem filial"
      const kpisNoFilial = await supabase.rpc('equipment_regularization_pending_kpis' as never, {
        p_filial_id: null,
        p_without_filial: true,
        p_situation: null,
        p_chassis: null,
        p_client: null,
      } as never);
      dump.kpis_sem_filial = kpisNoFilial.error ?? kpisNoFilial.data;
      if (kpisNoFilial.error) {
        out.push({ label: 'Sem filial', got: errText(kpisNoFilial.error), ok: false });
      } else {
        const k = (kpisNoFilial.data ?? {}) as Record<string, unknown>;
        cmp('Sem filial', k.total_pending_machines ?? k.total_machines, EXPECTED.semFilial);
      }

      // 3) KPIs — situação Sucata
      const kpisSucata = await supabase.rpc('equipment_regularization_pending_kpis' as never, {
        p_filial_id: null,
        p_without_filial: false,
        p_situation: 'sucata',
        p_chassis: null,
        p_client: null,
      } as never);
      dump.kpis_sucata = kpisSucata.error ?? kpisSucata.data;
      if (kpisSucata.error) {
        out.push({ label: 'Situação = sucata', got: errText(kpisSucata.error), ok: false });
      } else {
        const k = (kpisSucata.data ?? {}) as Record<string, unknown>;
        cmp('Situação = sucata', k.total_pending_machines ?? k.total_machines, EXPECTED.sucatas);
      }

      // 4) Grupos cliente + filial
      const groups = await supabase.rpc('equipment_regularization_pending_clients' as never, {
        p_filial_id: null,
        p_without_filial: false,
        p_situation: null,
        p_chassis: null,
        p_client: null,
        p_page: 1,
        p_page_size: 20,
      } as never);
      dump.grupos = groups.error ?? groups.data;

      let first: Record<string, unknown> | null = null;
      if (groups.error) {
        out.push({ label: 'Grupos cliente+filial', got: errText(groups.error), ok: false });
      } else {
        const g = (groups.data ?? {}) as Record<string, unknown>;
        cmp('Grupos cliente+filial', g.total_groups, EXPECTED.grupos);
        const list = (g.clients as Record<string, unknown>[]) ?? [];
        first = list[0] ?? null;
      }

      // 5) Busca sem acento
      const accent = await supabase.rpc('equipment_regularization_pending_clients' as never, {
        p_filial_id: null,
        p_without_filial: false,
        p_situation: null,
        p_chassis: null,
        p_client: 'sao',
        p_page: 1,
        p_page_size: 5,
      } as never);
      dump.busca_sem_acento = accent.error ?? accent.data;
      out.push({
        label: 'Busca sem acento ("sao")',
        got: accent.error
          ? errText(accent.error)
          : `${num((accent.data as Record<string, unknown>)?.total_groups)} grupo(s)`,
        ok: accent.error ? false : null,
      });

      // 6) Código sem zeros à esquerda — usa o código do primeiro grupo
      const rawCode = String((first?.client_code as string) ?? '').trim();
      const stripped = rawCode.replace(/^0+/, '');
      if (rawCode) {
        const byCode = await supabase.rpc('equipment_regularization_pending_clients' as never, {
          p_filial_id: null,
          p_without_filial: false,
          p_situation: null,
          p_chassis: null,
          p_client: stripped || rawCode,
          p_page: 1,
          p_page_size: 5,
        } as never);
        dump.busca_codigo_sem_zeros = byCode.error ?? byCode.data;
        out.push({
          label: `Código sem zeros ("${stripped || rawCode}" de "${rawCode}")`,
          got: byCode.error
            ? errText(byCode.error)
            : `${num((byCode.data as Record<string, unknown>)?.total_groups)} grupo(s)`,
          ok: byCode.error ? false : null,
        });
      }

      // 7) Abertura de um grupo + situações retornadas
      if (first) {
        const machines = await supabase.rpc('equipment_regularization_pending_machines' as never, {
          p_client_key: first.client_key,
          p_filial_id: (first.filial_id as string) ?? null,
          p_without_filial: first.filial_id == null,
          p_situation: null,
          p_chassis: null,
          p_client: null,
        } as never);
        dump.maquinas_primeiro_grupo = machines.error ?? machines.data;

        if (machines.error) {
          out.push({ label: 'Abrir grupo cliente+filial', got: errText(machines.error), ok: false });
        } else {
          const list = (machines.data as Record<string, unknown>[]) ?? [];
          out.push({
            label: `Abrir grupo "${String(first.client_name ?? first.client_key)}"`,
            got: `${list.length} máquina(s)`,
            ok: list.length > 0,
          });
          const situations = Array.from(new Set(list.map((m) => String(m.machine_situation))));
          const invalid = situations.filter((s) => !['vendida', 'inativa', 'sucata'].includes(s));
          out.push({
            label: 'machine_situation retornadas',
            got: situations.join(', ') || '—',
            ok: invalid.length === 0,
          });
        }
      }

      setRows(out);
      setRaw(JSON.stringify(dump, null, 2));
    } catch (err: unknown) {
      setRows([{ label: 'Falha inesperada', got: err instanceof Error ? err.message : String(err), ok: false }]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-primary" />
          Diagnóstico temporário — Regularização (R2)
        </CardTitle>
        <Button size="sm" variant="outline" onClick={run} disabled={running}>
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Validar R2
        </Button>
      </CardHeader>
      {rows ? (
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Teste</th>
                  <th className="py-2 pr-4 font-medium whitespace-nowrap">Esperado</th>
                  <th className="py-2 pr-4 font-medium whitespace-nowrap">Obtido</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-t">
                    <td className="py-2 pr-4">{r.label}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{r.expected ?? '—'}</td>
                    <td className="py-2 pr-4">{r.got}</td>
                    <td className="py-2">
                      {r.ok == null ? (
                        <Badge variant="secondary">Info</Badge>
                      ) : r.ok ? (
                        <Badge variant="default">OK</Badge>
                      ) : (
                        <Badge variant="destructive">Falhou</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {raw ? (
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">Retorno bruto das RPCs</summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{raw}</pre>
            </details>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
};
