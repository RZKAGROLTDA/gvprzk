import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, Loader2 } from 'lucide-react';
import { CLIENT_CODES } from '@/lib/clientCodes';
import { ClientInfoSection } from '@/components/task-form/sections';
import { supabase } from '@/integrations/supabase/client';

/**
 * BasicInfoBlock — bloco padronizado de Informações Básicas do cliente.
 *
 * 100% presentational/controlled:
 *   - sem estado de negócio
 *   - sem chamada Supabase
 *   - usa CLIENT_CODES (base única) para busca por código/nome
 *
 * Usado em: Ligação, Visita à Fazenda, Checklist, Visita Técnica.
 */

export interface BasicInfoBlockProps {
  // Contato
  contactName: string;
  onContactNameChange: (v: string) => void;

  showFunction?: boolean;
  contactFunction?: string;
  onContactFunctionChange?: (v: string) => void;
  contactFunctionOther?: string;
  onContactFunctionOtherChange?: (v: string) => void;

  phone: string;
  onPhoneChange: (v: string) => void;

  // Cliente
  clientCode: string;
  onClientCodeChange: (v: string) => void;
  clientName: string;
  onClientNameChange: (v: string) => void;

  email: string;
  onEmailChange: (v: string) => void;
  property: string;
  onPropertyChange: (v: string) => void;

  // Display-only (perfil do vendedor logado)
  vendedor: string;
  filial: string;

  // Filial atendida (opcional)
  showFilialAtendida?: boolean;
  filialAtendidaRequired?: boolean;
  filialAtendida?: string;
  onFilialAtendidaChange?: (v: string) => void;
  filiais?: { id: string; nome: string }[];

  // Callback quando um cliente é selecionado da busca
  onClientSelected?: (code: string, name: string) => void | Promise<void>;
}

const FUNCTION_OPTIONS = ['Comprador', 'Socio', 'Esposa', 'Gerente', 'Outros'];

export const BasicInfoBlock: React.FC<BasicInfoBlockProps> = ({
  contactName, onContactNameChange,
  showFunction = true,
  contactFunction = '', onContactFunctionChange,
  contactFunctionOther = '', onContactFunctionOtherChange,
  phone, onPhoneChange,
  clientCode, onClientCodeChange,
  clientName, onClientNameChange,
  email, onEmailChange,
  property, onPropertyChange,
  vendedor, filial,
  showFilialAtendida = false,
  filialAtendidaRequired = false,
  filialAtendida = '',
  onFilialAtendidaChange,
  filiais = [],
  onClientSelected,
}) => {
  const [search, setSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filtered, setFiltered] = useState<Array<{ code: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = search.trim();
    if (!q) { setFiltered([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        // [DIAG-TEMP] termo digitado
        console.log('[BasicInfoBlock][search] termo:', q);
        const { data, error } = await supabase.rpc('search_clients', {
          p_query: q,
          p_limit: 20,
        });
        // [DIAG-TEMP] resposta bruta da RPC
        console.log('[BasicInfoBlock][search] RPC search_clients =>', { error, data });
        if (cancelled) return;
        let results: Array<{ code: string; name: string }> = [];
        if (!error && Array.isArray(data) && data.length > 0) {
          results = data.map((r: any) => ({
            code: String(r.client_code ?? '').trim(),
            name: String(r.client_name ?? '').trim(),
          }));
        } else {
          const ql = q.toLowerCase();
          results = CLIENT_CODES
            .filter((c) => c.code.includes(q) || c.name.toLowerCase().includes(ql))
            .slice(0, 20);
          // [DIAG-TEMP] fallback ativado
          console.log('[BasicInfoBlock][search] fallback CLIENT_CODES hits:', results.length);
        }
        // [DIAG-TEMP] lista mapeada para o autocomplete
        console.log('[BasicInfoBlock][search] filtered (autocomplete):', results);
        setFiltered(results);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search]);

  const handleSelect = async (c: { code: string; name: string }) => {
    // [DIAG-TEMP] item selecionado
    console.log('[BasicInfoBlock][select] item selecionado:', c);
    onClientCodeChange(c.code);
    onClientNameChange(c.name);
    setSearch(`${c.code} - ${c.name}`);
    setShowSuggestions(false);
    if (onClientSelected) {
      // [DIAG-TEMP] chamada onClientSelected
      console.log('[BasicInfoBlock][select] onClientSelected(', c.code, ',', c.name, ')');
      await onClientSelected(c.code, c.name);
    }
  };

  const today = new Date().toLocaleDateString('pt-BR');

  return (
    <ClientInfoSection>
      <div className="space-y-4">
        {/* Busca unificada */}
        <div className="space-y-2 relative">
          <Label htmlFor="clientSearch">Buscar Cliente (código ou nome)</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="clientSearch"
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Digite o código ou nome do cliente..."
              autoComplete="off"
            />
          </div>
          {showSuggestions && (loading || filtered.length > 0) && (
            <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-md border border-border bg-popover shadow-lg">
              {loading && (
                <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Buscando...
                </div>
              )}
              {filtered.map((c) => (
                <button
                  type="button"
                  key={c.code}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(c)}
                  className="w-full text-left px-3 py-2 hover:bg-muted flex justify-between items-center"
                >
                  <span className="font-medium">{c.code}</span>
                  <span className="text-muted-foreground text-sm">{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="contactName">Nome do Contato</Label>
            <Input
              id="contactName"
              value={contactName}
              onChange={(e) => onContactNameChange(e.target.value)}
              placeholder="Nome do contato"
            />
          </div>

          {showFunction && (
            <div className="space-y-2">
              <Label htmlFor="contactFunction">Função</Label>
              <Select
                value={contactFunction}
                onValueChange={(v) => {
                  onContactFunctionChange?.(v);
                  if (v !== 'Outros') onContactFunctionOtherChange?.('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a função" />
                </SelectTrigger>
                <SelectContent>
                  {FUNCTION_OPTIONS.map((f) => (
                    <SelectItem key={f} value={f}>{f === 'Socio' ? 'Sócio' : f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {contactFunction === 'Outros' && (
                <Input
                  className="mt-2"
                  placeholder="Especifique a função"
                  value={contactFunctionOther}
                  onChange={(e) => onContactFunctionOtherChange?.(e.target.value)}
                />
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reportDate">Data do Relatório</Label>
            <Input id="reportDate" value={today} readOnly className="bg-muted cursor-not-allowed" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientCode">Código do Cliente</Label>
            <Input
              id="clientCode"
              value={clientCode}
              onChange={(e) => onClientCodeChange(e.target.value)}
              placeholder="Preenchido pela busca"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientName">Nome do Cliente</Label>
            <Input
              id="clientName"
              value={clientName}
              onChange={(e) => onClientNameChange(e.target.value)}
              placeholder="Nome do cliente"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email do Cliente/Contato</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="email@exemplo.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="property">Nome da Propriedade</Label>
            <Input
              id="property"
              value={property}
              onChange={(e) => onPropertyChange(e.target.value)}
              placeholder="Nome da propriedade"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vendedor">Vendedor</Label>
            <Input id="vendedor" value={vendedor} disabled className="bg-muted" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="filial">Filial</Label>
            <Input id="filial" value={filial} disabled className="bg-muted" />
          </div>

          {showFilialAtendida && (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="filialAtendida">
                Filial Atendida {filialAtendidaRequired && <span className="text-destructive">*</span>}
              </Label>
              <Select
                value={filialAtendida}
                onValueChange={(v) => onFilialAtendidaChange?.(v)}
              >
                <SelectTrigger className={filialAtendidaRequired && !filialAtendida ? 'border-destructive/50' : ''}>
                  <SelectValue placeholder="Selecione a filial atendida" />
                </SelectTrigger>
                <SelectContent>
                  {filiais.map((f) => (
                    <SelectItem key={f.id} value={f.nome}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
    </ClientInfoSection>
  );
};

export default BasicInfoBlock;
