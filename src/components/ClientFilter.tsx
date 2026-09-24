import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SelectedClient {
  code: string | null;
  name: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (v?: string | null) => (v ?? '').trim().toLowerCase();

/** Espelha public.client_filter_match (mesma regra do servidor). */
export const matchesClient = (
  sel: SelectedClient | null | undefined,
  code?: string | null,
  name?: string | null,
): boolean => {
  if (!sel) return true;
  const sc = norm(sel.code);
  const sn = norm(sel.name);
  if (sc) {
    if (norm(code) === sc) return true;
    return !norm(code) && !!sn && norm(name) === sn;
  }
  return !!sn && norm(name) === sn;
};

/** Parâmetros RPC: sem cliente → NULL (resultado idêntico ao atual). */
export const clientRpcParams = (sel: SelectedClient | null | undefined) => ({
  p_client_code: sel?.code?.trim() ? sel.code.trim() : null,
  p_client_name: sel && !sel.code?.trim() && sel.name.trim() ? sel.name.trim() : null,
});

interface Props {
  value: SelectedClient | null;
  onChange: (v: SelectedClient | null) => void;
  /** Filial do escopo atual (uuid, 'all' ou vazio). */
  filialId?: string | null;
  className?: string;
}

export const ClientFilter: React.FC<Props> = ({ value, onChange, filialId, className }) => {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const p_filial_id = filialId && UUID_RE.test(filialId) ? filialId : null;

  const { data = [], isFetching } = useQuery({
    queryKey: ['search-scoped-clients', debounced, p_filial_id],
    enabled: open && debounced.length >= 2,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_scoped_clients' as any, {
        p_query: debounced,
        p_filial_id,
        p_limit: 15,
      } as any);
      if (error) throw error;
      return (data ?? []) as { client_code: string | null; client_name: string }[];
    },
  });

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start font-normal min-w-[180px]">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {value ? `${value.code ? `${value.code} — ` : ''}${value.name}` : 'Cliente'}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <Input
            autoFocus
            placeholder="Nome ou código (mín. 2 caracteres)"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <div className="mt-2 max-h-72 overflow-y-auto">
            {debounced.length < 2 ? (
              <p className="p-2 text-xs text-muted-foreground">Digite ao menos 2 caracteres.</p>
            ) : isFetching ? (
              <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Buscando...
              </div>
            ) : data.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">Nenhum cliente encontrado.</p>
            ) : (
              data.map((c) => (
                <button
                  key={`${c.client_code ?? ''}|${c.client_name}`}
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    onChange({ code: c.client_code, name: c.client_name });
                    setOpen(false);
                    setTerm('');
                  }}
                >
                  <span className="font-medium">{c.client_name}</span>
                  {c.client_code && <span className="ml-2 text-xs text-muted-foreground">{c.client_code}</span>}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
      {value && (
        <Button variant="ghost" size="icon" aria-label="Limpar cliente" onClick={() => onChange(null)}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};
