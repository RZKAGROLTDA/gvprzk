import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useUserRole } from '@/hooks/useUserRole';
import { useFilteredConsultants } from '@/hooks/useFilteredConsultants';
import {
  useClientSearch,
  useUpsertVisitSchedule,
  VisitSchedule,
  VisitScheduleStatus,
} from '@/hooks/useVisitSchedules';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: VisitSchedule | null;
  defaultDate?: string;
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const VisitScheduleForm: React.FC<Props> = ({ open, onOpenChange, initial, defaultDate }) => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isManager, isAdmin, isSupervisor } = useUserRole() as any;
  const isPrivileged = !!(isManager || isAdmin || isSupervisor);
  const { consultants } = useFilteredConsultants();

  const { data: filiais = [] } = useQuery({
    queryKey: ['filiais-options-vs'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('filiais').select('id, nome').order('nome');
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const [planned_date, setPlannedDate] = useState(initial?.planned_date || defaultDate || todayISO());
  const [client_code, setClientCode] = useState(initial?.client_code || '');
  const [client_name, setClientName] = useState(initial?.client_name || '');
  const [client_property, setClientProperty] = useState(initial?.client_property || '');
  const [client_phone, setClientPhone] = useState(initial?.client_phone || '');
  const [client_email, setClientEmail] = useState(initial?.client_email || '');
  const [filial_id, setFilialId] = useState<string | null>(initial?.filial_id || profile?.filial_id || null);
  const [filial, setFilial] = useState(initial?.filial || profile?.filial_nome || '');
  const [seller_id, setSellerId] = useState<string>(initial?.seller_id || user?.id || '');
  const [observation, setObservation] = useState(initial?.observation || '');
  const [status, setStatus] = useState<VisitScheduleStatus>(initial?.status || 'planejado');

  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data: clientResults = [], isFetching: searching } = useClientSearch(debounced);

  // Sync filial nome quando muda filial_id
  useEffect(() => {
    if (filial_id) {
      const f = filiais.find((x) => x.id === filial_id);
      if (f) setFilial(f.nome);
    }
  }, [filial_id, filiais]);

  // Seller name snapshot
  const sellerName = useMemo(() => {
    if (seller_id === user?.id) return profile?.name || user?.email || '';
    const c = consultants.find((c: any) => c.user_id === seller_id || c.id === seller_id);
    return c?.name || '';
  }, [seller_id, consultants, user, profile]);

  const upsert = useUpsertVisitSchedule();

  const onSelectClient = (c: { code: string; name: string; property?: string; phone?: string; email?: string; filial?: string }) => {
    setClientCode(c.code);
    setClientName(c.name);
    if (c.property) setClientProperty(c.property);
    if (c.phone) setClientPhone(c.phone);
    if (c.email) setClientEmail(c.email);
    if (c.filial && !filial_id) {
      setFilial(c.filial);
      const match = filiais.find((f) => f.nome.trim().toLowerCase() === c.filial!.trim().toLowerCase());
      if (match) setFilialId(match.id);
    }
    setSearchOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client_code.trim() || !client_name.trim()) {
      return;
    }
    if (!user?.id) return;

    await upsert.mutateAsync({
      id: initial?.id,
      planned_date,
      client_code: client_code.trim(),
      client_name: client_name.trim(),
      client_property: client_property.trim() || null,
      client_phone: client_phone.trim() || null,
      client_email: client_email.trim() || null,
      filial: filial.trim() || (profile?.filial_nome ?? ''),
      filial_id: filial_id,
      seller_id: seller_id || user.id,
      seller_name: sellerName || (profile?.name ?? user.email ?? ''),
      observation: observation.trim() || null,
      status,
      created_by: initial?.created_by || user.id,
    } as any);

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar Programação' : 'Nova Programação de Visita'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Busca de cliente */}
          <div className="space-y-2">
            <Label>Buscar Cliente (código ou nome)</Label>
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-start">
                  <Search className="h-4 w-4 mr-2" />
                  {client_name ? `${client_code} — ${client_name}` : 'Buscar cliente...'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Digite código ou nome..."
                    value={search}
                    onValueChange={setSearch}
                  />
                  <CommandList>
                    {searching && <div className="p-3 text-sm text-muted-foreground">Buscando...</div>}
                    {!searching && debounced.length < 2 && (
                      <div className="p-3 text-sm text-muted-foreground">Digite ao menos 2 caracteres</div>
                    )}
                    {!searching && debounced.length >= 2 && clientResults.length === 0 && (
                      <CommandEmpty>Nenhum cliente. Preencha manualmente abaixo.</CommandEmpty>
                    )}
                    <CommandGroup>
                      {clientResults.map((c, idx) => (
                        <CommandItem
                          key={`${c.code || c.name}-${idx}`}
                          onSelect={() => onSelectClient(c)}
                          value={`${c.code} ${c.name}`}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{c.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {c.code ? `Cód. ${c.code}` : 'Sem código'} {c.filial ? `• ${c.filial}` : ''}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Data planejada *</Label>
              <Input type="date" value={planned_date} onChange={(e) => setPlannedDate(e.target.value)} required />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as VisitScheduleStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planejado">Planejado</SelectItem>
                  <SelectItem value="realizado">Realizado</SelectItem>
                  <SelectItem value="nao_realizado">Não realizado</SelectItem>
                  <SelectItem value="reagendado">Reagendado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Código do cliente *</Label>
              <Input value={client_code} onChange={(e) => setClientCode(e.target.value)} required />
            </div>
            <div>
              <Label>Nome do cliente *</Label>
              <Input value={client_name} onChange={(e) => setClientName(e.target.value)} required />
            </div>

            <div>
              <Label>Propriedade/Fazenda</Label>
              <Input value={client_property} onChange={(e) => setClientProperty(e.target.value)} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={client_phone} onChange={(e) => setClientPhone(e.target.value)} />
            </div>

            <div>
              <Label>E-mail</Label>
              <Input type="email" value={client_email} onChange={(e) => setClientEmail(e.target.value)} />
            </div>
            <div>
              <Label>Filial</Label>
              <Select value={filial_id ?? ''} onValueChange={(v) => setFilialId(v || null)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {filiais.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isPrivileged && (
              <div className="sm:col-span-2">
                <Label>Vendedor responsável</Label>
                <Select value={seller_id} onValueChange={setSellerId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {user?.id && (
                      <SelectItem value={user.id}>{profile?.name || user.email} (eu)</SelectItem>
                    )}
                    {consultants.map((c: any) => (
                      <SelectItem key={c.user_id || c.id} value={c.user_id || c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label>Observação</Label>
            <Textarea value={observation} onChange={(e) => setObservation(e.target.value)} rows={3} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
