import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useSecureUserDirectory } from '@/hooks/useSecureTaskData';
import {
  CURRENT_BUILD_HASH,
  CURRENT_BUILD_TIME,
  CURRENT_VERSION,
  LOCAL_MIN_BUILD_HASH,
  LOCAL_MIN_BUILD_TIME,
  fetchRemoteVersion,
} from '@/lib/appUpdate';
import { platformLabel, shortDeviceId } from '@/lib/deviceInfo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ChevronDown,
  ChevronRight,
  MonitorSmartphone,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

type DeviceStatus = 'updated' | 'compatible' | 'outdated';
type UserStatus = DeviceStatus | 'unknown';

interface DeviceRow {
  device_id: string;
  platform: string | null;
  build_hash: string;
  build_time: string | null;
  app_version: string | null;
  last_seen_at: string;
}

const statusLabels: Record<UserStatus, string> = {
  updated: 'Atualizado',
  compatible: 'Compatível',
  outdated: 'Desatualizado',
  unknown: 'Sem informação',
};

const StatusBadge: React.FC<{ status: UserStatus }> = ({ status }) => {
  const variants: Record<UserStatus, string> = {
    updated: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    compatible: 'bg-amber-100 text-amber-800 border-amber-200',
    outdated: 'bg-red-100 text-red-800 border-red-200',
    unknown: 'bg-muted text-muted-foreground border-border',
  };
  return (
    <Badge variant="outline" className={variants[status]}>
      {statusLabels[status]}
    </Badge>
  );
};

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString('pt-BR') : '—';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  supervisor: 'Supervisor',
  rac: 'RAC',
  cpa: 'CPA',
  csa: 'CSA',
  consultant: 'Consultor',
  sales_consultant: 'Consultor de Vendas',
  technical_consultant: 'Consultor Técnico',
};

const KpiCard: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-xl font-bold break-all">{value}</div>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </CardContent>
  </Card>
);

const UserVersions: React.FC = () => {
  const { isAdmin, isManager, isLoading: roleLoading } = useUserRole();
  const allowed = isAdmin || isManager;

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [filialFilter, setFilialFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [windowDays, setWindowDays] = useState('30');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: remote } = useQuery({
    queryKey: ['remote-version-json'],
    queryFn: fetchRemoteVersion,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: directory = [], isLoading: dirLoading } = useSecureUserDirectory();

  const {
    data: versions = [],
    isLoading: versionsLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['user-app-versions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_app_versions')
        .select('user_id, device_id, platform, build_hash, build_time, app_version, last_seen_at')
        .order('last_seen_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
    enabled: allowed,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const publishedHash = remote?.buildHash || CURRENT_BUILD_HASH;
  const publishedVersion = remote?.version || CURRENT_VERSION;
  const minBuildTime = remote?.minBuildTime || LOCAL_MIN_BUILD_TIME;
  const minBuildHash = remote?.minBuildHash || LOCAL_MIN_BUILD_HASH;

  const deviceStatus = (device: DeviceRow): DeviceStatus => {
    if (device.build_hash === publishedHash) return 'updated';
    const min = minBuildTime ? Date.parse(minBuildTime) : NaN;
    const bt = device.build_time ? Date.parse(device.build_time) : NaN;
    if (!Number.isNaN(min) && !Number.isNaN(bt) && bt < min) return 'outdated';
    return 'compatible';
  };

  const rows = useMemo(() => {
    const days = Number(windowDays) || 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const byUser = new Map<string, DeviceRow[]>();
    for (const v of versions as DeviceRow[] & { user_id: string }[]) {
      const row = v as unknown as DeviceRow & { user_id: string };
      if (Date.parse(row.last_seen_at) < cutoff) continue;
      const list = byUser.get(row.user_id) ?? [];
      list.push(row);
      byUser.set(row.user_id, list);
    }

    return (directory as any[]).map((u) => {
      const devices = (byUser.get(u.user_id) ?? []).map((d) => ({
        ...d,
        status: deviceStatus(d),
      }));
      let status: UserStatus = 'unknown';
      if (devices.length > 0) {
        if (devices.some((d) => d.status === 'outdated')) status = 'outdated';
        else if (devices.some((d) => d.status === 'compatible')) status = 'compatible';
        else status = 'updated';
      }
      const latest = devices
        .slice()
        .sort((a, b) => Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at))[0];

      return {
        userId: u.user_id as string,
        name: u.name as string,
        email: u.email as string,
        filial: (u.filial_nome as string) || 'Sem filial',
        role: (u.role as string) || 'consultant',
        devices,
        status,
        lastSeen: latest?.last_seen_at ?? null,
        latestBuild: latest?.build_hash ?? null,
        latestVersion: latest?.app_version ?? null,
      };
    });
  }, [versions, directory, windowDays, publishedHash, minBuildTime]);

  const kpis = useMemo(() => {
    const devices = rows.flatMap((r) => r.devices);
    return {
      activeUsers: rows.filter((r) => r.devices.length > 0).length,
      fullyUpdated: rows.filter((r) => r.status === 'updated').length,
      compatible: rows.filter((r) => r.status === 'compatible').length,
      withOutdated: rows.filter((r) => r.status === 'outdated').length,
      unknown: rows.filter((r) => r.status === 'unknown').length,
      devicesUpdated: devices.filter((d) => d.status === 'updated').length,
      devicesOutdated: devices.filter((d) => d.status === 'outdated').length,
    };
  }, [rows]);

  const filiais = useMemo(
    () => Array.from(new Set(rows.map((r) => r.filial))).sort(),
    [rows]
  );
  const roles = useMemo(() => Array.from(new Set(rows.map((r) => r.role))).sort(), [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (filialFilter !== 'all' && r.filial !== filialFilter) return false;
      if (roleFilter !== 'all' && r.role !== roleFilter) return false;
      if (term && !`${r.name} ${r.email}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, statusFilter, filialFilter, roleFilter, search]);

  if (roleLoading) {
    return (
      <div className="p-6 text-muted-foreground">Verificando permissões...</div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Esta área é restrita a administradores e gerentes.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const loading = dirLoading || versionsLoading;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MonitorSmartphone className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Versões dos Usuários</h1>
            <p className="text-sm text-muted-foreground">
              Monitoramento de convergência de build por usuário e dispositivo
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar dados
        </Button>
      </div>

      {/* Informação de versão */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Versão publicada" value={publishedVersion} hint="version.json remoto" />
        <KpiCard
          label="Build atual"
          value={publishedHash}
          hint={`este dispositivo: ${CURRENT_BUILD_HASH} · ${formatDateTime(CURRENT_BUILD_TIME)}`}
        />
        <KpiCard
          label="Build mínimo obrigatório"
          value={minBuildHash || '—'}
          hint={
            minBuildTime
              ? `mínimo desde ${formatDateTime(minBuildTime)}`
              : 'nenhum mínimo configurado'
          }
        />
      </div>

      {/* Contagens */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard label="Usuários ativos" value={kpis.activeUsers} />
        <KpiCard label="100% atualizados" value={kpis.fullyUpdated} />
        <KpiCard label="Compatíveis" value={kpis.compatible} />
        <KpiCard label="Com dispositivo desatualizado" value={kpis.withOutdated} />
        <KpiCard label="Dispositivos atualizados" value={kpis.devicesUpdated} />
        <KpiCard label="Dispositivos desatualizados" value={kpis.devicesOutdated} />
        <KpiCard label="Sem informação" value={kpis.unknown} />
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-5 gap-3">
          <Input
            placeholder="Buscar por nome ou e-mail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="updated">Atualizado</SelectItem>
              <SelectItem value="compatible">Compatível</SelectItem>
              <SelectItem value="outdated">Desatualizado</SelectItem>
              <SelectItem value="unknown">Sem informação</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filialFilter} onValueChange={setFilialFilter}>
            <SelectTrigger><SelectValue placeholder="Filial" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as filiais</SelectItem>
              {filiais.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger><SelectValue placeholder="Perfil" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os perfis</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r} value={r}>{roleLabels[r] || r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={windowDays} onValueChange={setWindowDays}>
            <SelectTrigger><SelectValue placeholder="Janela" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Ativos nos últimos 7 dias</SelectItem>
              <SelectItem value="30">Ativos nos últimos 30 dias</SelectItem>
              <SelectItem value="90">Ativos nos últimos 90 dias</SelectItem>
              <SelectItem value="3650">Todos os dispositivos</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Usuários ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground py-6 text-center">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center">
              Nenhum usuário encontrado com os filtros atuais.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-2 w-8" />
                    <th className="py-2 pr-4 whitespace-nowrap">Usuário</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Filial</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Perfil</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Último acesso</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Build mais recente</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const isOpen = expanded === r.userId;
                    return (
                      <React.Fragment key={r.userId}>
                        <tr
                          className="border-b hover:bg-muted/50 cursor-pointer"
                          onClick={() => setExpanded(isOpen ? null : r.userId)}
                        >
                          <td className="py-2 pr-2">
                            {r.devices.length > 0 ? (
                              isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )
                            ) : null}
                          </td>
                          <td className="py-2 pr-4">
                            <div className="font-medium">{r.name}</div>
                            <div className="text-xs text-muted-foreground">{r.email}</div>
                          </td>
                          <td className="py-2 pr-4 whitespace-nowrap">{r.filial}</td>
                          <td className="py-2 pr-4 whitespace-nowrap">
                            {roleLabels[r.role] || r.role}
                          </td>
                          <td className="py-2 pr-4 whitespace-nowrap">
                            {formatDateTime(r.lastSeen)}
                          </td>
                          <td className="py-2 pr-4 whitespace-nowrap">
                            {r.latestBuild ? (
                              <span className="font-mono text-xs">
                                {r.latestBuild}
                                {r.latestVersion ? ` · v${r.latestVersion}` : ''}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2 pr-4"><StatusBadge status={r.status} /></td>
                        </tr>

                        {isOpen && r.devices.length > 0 && (
                          <tr className="bg-muted/30">
                            <td />
                            <td colSpan={6} className="py-3 pr-4">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-muted-foreground text-left">
                                    <th className="py-1 pr-4">Dispositivo</th>
                                    <th className="py-1 pr-4">Plataforma</th>
                                    <th className="py-1 pr-4">Build</th>
                                    <th className="py-1 pr-4">Versão</th>
                                    <th className="py-1 pr-4">Última atividade</th>
                                    <th className="py-1 pr-4">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.devices.map((d) => (
                                    <tr key={d.device_id} className="border-t border-border/50">
                                      <td className="py-1 pr-4 font-mono">
                                        {shortDeviceId(d.device_id)}
                                      </td>
                                      <td className="py-1 pr-4">{platformLabel(d.platform)}</td>
                                      <td className="py-1 pr-4 font-mono">{d.build_hash}</td>
                                      <td className="py-1 pr-4">
                                        {d.app_version ? `v${d.app_version}` : '—'}
                                      </td>
                                      <td className="py-1 pr-4 whitespace-nowrap">
                                        {formatDateTime(d.last_seen_at)}
                                      </td>
                                      <td className="py-1 pr-4">
                                        <StatusBadge status={d.status} />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserVersions;
