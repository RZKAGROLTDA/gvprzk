import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { useTasksOptimized, useFiliais } from '@/hooks/useTasksOptimized';
import { BasicInfoBlock } from '@/components/task-form/BasicInfoBlock';
import {
  EquipmentParkSection,
  TechnicalServiceSection,
  SalesEstimateSection,
  OpportunityClassificationSection,
  SalesFunnelSection,
  NextActionSection,
  ObservationsSection,
} from '@/components/task-form/sections';
import { format } from 'date-fns';

type Level = 'baixa' | 'media' | 'alta';

const SERVICE_TYPES = [

  'Prospecção',
  'Pacotes',
  'Revisão Preventiva',
  'Revisão Geral',
  'Reforma',
  'Diagnóstico Técnico',
] as const;

const FUNNEL_STAGES = [
  'Prospectado',
  'Orçamento enviado',
  'Negociação',
  'Aguardando aprovação',
  'Fechado',
  'Perdido',
] as const;

const NEXT_ACTIONS = [
  'Enviar Orçamento',
  'Agendar Retorno',
  'Programar Visita Técnica',
  'Acompanhamento Comercial',
] as const;

interface EquipmentRow {
  id?: string;
  model: string;
  serial_chassis: string;
  hours: string;
  year: string;
  observation: string;
  saved: boolean;
}

const emptyEquipment = (): EquipmentRow => ({
  model: '', serial_chassis: '', hours: '', year: '', observation: '', saved: false,
});

const formatBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);

export const TechnicalVisitForm: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { createTask, isCreating } = useTasksOptimized();
  const { data: filiais = [] } = useFiliais();

  // --- Cliente ---
  const [clientCode, setClientCode] = useState('');
  const [clientName, setClientName] = useState('');
  const [property, setProperty] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactFunction, setContactFunction] = useState('');
  const [contactFunctionOther, setContactFunctionOther] = useState('');
  const [filialAtendida, setFilialAtendida] = useState('');

  // Carrega dados anteriores do cliente (mesma lógica das outras tarefas)
  const loadPreviousClientData = async (code: string) => {
    const c = code.trim();
    if (!c) return;
    try {
      const { data } = await (supabase as any)
        .from('tasks')
        .select('property, email, phone')
        .eq('clientCode', c)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        if (data.property && !property) setProperty(data.property);
        if (data.email && !email) setEmail(data.email);
        if (data.phone && !phone) setPhone(data.phone);
      }
    } catch (err) {
      console.warn('loadPreviousClientData:', err);
    }
  };


  // --- Parque de Máquinas ---
  const [equipments, setEquipments] = useState<EquipmentRow[]>([]);
  const [loadingEquip, setLoadingEquip] = useState(false);

  const loadClientEquipments = async (code: string) => {
    const c = code.trim();
    if (!c) return;
    setLoadingEquip(true);
    try {
      const { data, error } = await supabase
        .from('client_equipment' as any)
        .select('id, model, serial_chassis, hours, year, observation')
        .ilike('client_code', c)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows: EquipmentRow[] = (data || []).map((e: any) => ({
        id: e.id,
        model: e.model ?? '',
        serial_chassis: e.serial_chassis ?? '',
        hours: e.hours != null ? String(e.hours) : '',
        year: e.year != null ? String(e.year) : '',
        observation: e.observation ?? '',
        saved: true,
      }));
      setEquipments(rows);
    } catch (err: any) {
      console.error('Erro carregando equipamentos:', err);
    } finally {
      setLoadingEquip(false);
    }
  };

  const addEquipmentRow = () => setEquipments(prev => [...prev, emptyEquipment()]);
  const updateEquipment = (idx: number, patch: Partial<EquipmentRow>) =>
    setEquipments(prev => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  const removeEquipment = (idx: number) =>
    setEquipments(prev => prev.filter((_, i) => i !== idx));

  // --- Tipo de Serviço ---
  const [serviceType, setServiceType] = useState<string>('');

  // --- Estimativa de Venda ---
  const [estServicos, setEstServicos] = useState('');
  const [estPecas, setEstPecas] = useState('');
  const [estTreinamento, setEstTreinamento] = useState('');
  const [estPuk, setEstPuk] = useState('');
  const totalEstimate = useMemo(() => {
    const n = (v: string) => parseFloat(v.replace(',', '.')) || 0;
    return n(estServicos) + n(estPecas) + n(estTreinamento) + n(estPuk);
  }, [estServicos, estPecas, estTreinamento, estPuk]);

  // --- Classificação ---
  const [interest, setInterest] = useState<Level | ''>('');
  const [urgency, setUrgency] = useState<Level | ''>('');
  const [impact, setImpact] = useState<Level | ''>('');
  const [closing, setClosing] = useState<Level | ''>('');

  // --- Funil ---
  const [funnelStage, setFunnelStage] = useState<string>('Prospectado');

  // --- Ações ---
  const [nextAction, setNextAction] = useState<string>('');
  const [nextActionDate, setNextActionDate] = useState<string>('');

  // --- Observações ---
  const [observations, setObservations] = useState('');

  const persistNewEquipments = async () => {
    if (!clientCode.trim() || !clientName.trim()) return;
    const newOnes = equipments.filter(e =>
      !e.saved && (e.model.trim() || e.serial_chassis.trim() || e.hours || e.year || e.observation.trim())
    );
    if (newOnes.length === 0) return;
    try {
      const payload = newOnes.map(e => ({
        client_code: clientCode.trim(),
        client_name: clientName.trim(),
        filial_id: profile?.filial_id || null,

        model: e.model || null,
        serial_chassis: e.serial_chassis || null,
        hours: e.hours ? Number(e.hours) : null,
        year: e.year ? Number(e.year) : null,
        observation: e.observation || null,
      }));
      const { error } = await supabase.from('client_equipment' as any).insert(payload);
      if (error) console.warn('Falha ao salvar equipamentos:', error);
    } catch (err) {
      console.warn('Erro ao salvar equipamentos:', err);
    }
  };

  const validate = (): string | null => {
    if (!clientName.trim()) return 'Nome do cliente é obrigatório';
    if (!property.trim()) return 'Propriedade é obrigatória';
    if (!profile?.filial_id) return 'Filial do usuário não configurada';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast({ title: 'Campo obrigatório', description: err, variant: 'destructive' });
      return;
    }

    // Persistir equipamentos novos (não bloqueante para a tarefa em caso de erro)
    await persistNewEquipments();

    const now = new Date();
    const equipmentSnapshot = equipments
      .filter(e => e.model || e.serial_chassis || e.hours || e.year || e.observation)
      .map(e => ({
        model: e.model,
        serial_chassis: e.serial_chassis,
        hours: e.hours ? Number(e.hours) : null,
        year: e.year ? Number(e.year) : null,
        observation: e.observation,
      }));

    const technicalVisitData = {
      equipments: equipmentSnapshot,
      service_type: serviceType || null,
      total_estimate: totalEstimate,
    };

    const salesEstimate = {
      servicos: parseFloat(estServicos.replace(',', '.')) || 0,
      pecas: parseFloat(estPecas.replace(',', '.')) || 0,
      treinamento: parseFloat(estTreinamento.replace(',', '.')) || 0,
      puk: parseFloat(estPuk.replace(',', '.')) || 0,
    };

    // Mapear funil → status de oportunidade (sem alterar fluxos antigos)
    const isClosed = funnelStage === 'Fechado';
    const isLost = funnelStage === 'Perdido';
    const salesConfirmed = isClosed ? true : isLost ? false : undefined;
    const salesType = isClosed ? 'ganho' : isLost ? 'perdido' : undefined;

    const filialNome = filiais.find((f: any) => f.id === filialId)?.nome
      || profile?.filial_nome
      || '';

    const taskData: any = {
      name: 'Visita Técnica',
      taskType: 'technical_visit',
      responsible: profile?.name || 'Vendedor',
      client: clientName.trim(),
      clientCode: clientCode.trim(),
      property: property.trim(),
      phone,
      email,
      filial: filialNome,
      filial_id: profile?.filial_id,
      priority: 'medium',
      startDate: now,
      endDate: now,
      startTime: format(now, 'HH:mm'),
      endTime: format(now, 'HH:mm'),
      observations,
      checklist: [],
      reminders: [],
      photos: [],
      documents: [],
      isProspect: !salesConfirmed,
      salesValue: totalEstimate,
      salesConfirmed,
      salesType,
      // Technical Visit specifics
      technicalCategory: serviceType || undefined,
      technicalFunnelStage: funnelStage,
      technicalVisitData,
      opportunityInterest: interest || undefined,
      opportunityUrgency: urgency || undefined,
      opportunityImpact: impact || undefined,
      opportunityClosing: closing || undefined,
      salesEstimate,
      nextAction: nextAction || undefined,
      nextActionDate: nextActionDate || undefined,
    };

    try {
      await createTask(taskData);
      toast({ title: '✅ Visita Técnica criada com sucesso!' });
      navigate('/create-task');
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Erro', description: 'Não foi possível salvar a Visita Técnica.', variant: 'destructive' });
    }
  };

  const renderLevel = (
    label: string, value: Level | '', set: (v: Level) => void,
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => set(v as Level)}>
        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="baixa">Baixa</SelectItem>
          <SelectItem value="media">Média</SelectItem>
          <SelectItem value="alta">Alta</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Cliente */}
      <ClientInfoSection>
        <div className="space-y-4">
          {/* Busca de cliente (mesma base usada em Ligação/Visita Fazenda) */}
          <div className="space-y-2 relative">
            <Label htmlFor="clientSearch">Buscar Cliente (código ou nome)</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="clientSearch"
                className="pl-9"
                value={clientSearch}
                onChange={(e) => {
                  setClientSearch(e.target.value);
                  setShowClientSuggestions(true);
                }}
                onFocus={() => setShowClientSuggestions(true)}
                onBlur={() => setTimeout(() => setShowClientSuggestions(false), 150)}
                placeholder="Digite o código ou nome do cliente..."
                autoComplete="off"
              />
            </div>
            {showClientSuggestions && filteredClients.length > 0 && (
              <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-md border border-border bg-popover shadow-lg">
                {filteredClients.map((c) => (
                  <button
                    type="button"
                    key={c.code}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectClient(c)}
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
              <Label htmlFor="clientCode">Código do Cliente</Label>
              <Input
                id="clientCode"
                value={clientCode}
                onChange={(e) => setClientCode(e.target.value)}
                placeholder="Preenchido pela busca"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientName">Nome do Cliente *</Label>
              <Input id="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="property">Propriedade *</Label>
              <Input id="property" value={property} onChange={(e) => setProperty(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Filial</Label>
              <Select value={filialId} onValueChange={setFilialId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {filiais.map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </ClientInfoSection>


      {/* Parque de Máquinas */}
      <EquipmentParkSection
        headerRight={
          <Button type="button" size="sm" variant="outline" onClick={addEquipmentRow}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        }
      >
        {loadingEquip && (
          <div className="flex items-center text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando equipamentos do cliente...
          </div>
        )}
        {equipments.length === 0 && !loadingEquip && (
          <p className="text-sm text-muted-foreground">
            Nenhum equipamento. Informe o código do cliente para buscar, ou clique em "Adicionar".
          </p>
        )}
        <div className="space-y-3">
          {equipments.map((eq, idx) => (
            <div key={idx} className="rounded-lg border border-border/60 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant={eq.saved ? 'secondary' : 'outline'}>
                  {eq.saved ? 'Cadastrado' : 'Novo'}
                </Badge>
                <Button type="button" size="icon" variant="ghost" onClick={() => removeEquipment(idx)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Modelo</Label>
                  <Input value={eq.model} onChange={(e) => updateEquipment(idx, { model: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Chassi / Série</Label>
                  <Input value={eq.serial_chassis} onChange={(e) => updateEquipment(idx, { serial_chassis: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Horas</Label>
                  <Input type="number" value={eq.hours} onChange={(e) => updateEquipment(idx, { hours: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Ano</Label>
                  <Input type="number" value={eq.year} onChange={(e) => updateEquipment(idx, { year: e.target.value })} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Observação</Label>
                  <Textarea
                    value={eq.observation}
                    onChange={(e) => updateEquipment(idx, { observation: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </EquipmentParkSection>

      {/* Tipo de Serviço */}
      <TechnicalServiceSection>
        <div className="space-y-2">
          <Label>Tipo de Serviço</Label>
          <Select value={serviceType} onValueChange={setServiceType}>
            <SelectTrigger><SelectValue placeholder="Selecione o tipo de serviço" /></SelectTrigger>
            <SelectContent>
              {SERVICE_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </TechnicalServiceSection>

      {/* Estimativa de Venda */}
      <SalesEstimateSection>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: 'Serviços', v: estServicos, set: setEstServicos },
            { label: 'Peças', v: estPecas, set: setEstPecas },
            { label: 'Treinamento', v: estTreinamento, set: setEstTreinamento },
            { label: 'PUK', v: estPuk, set: setEstPuk },
          ].map((it) => (
            <div key={it.label} className="space-y-2">
              <Label>{it.label} (R$)</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={it.v}
                onChange={(e) => it.set(e.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <span className="text-sm text-muted-foreground">Total estimado</span>
          <span className="text-lg font-semibold text-success">{formatBRL(totalEstimate)}</span>
        </div>
      </SalesEstimateSection>

      {/* Classificação da Oportunidade */}
      <OpportunityClassificationSection>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderLevel('Interesse do Cliente', interest, setInterest)}
          {renderLevel('Urgência Operacional', urgency, setUrgency)}
          {renderLevel('Impacto na Disponibilidade', impact, setImpact)}
          {renderLevel('Possibilidade de Fechamento', closing, setClosing)}
        </div>
      </OpportunityClassificationSection>

      {/* Funil de Vendas */}
      <SalesFunnelSection>
        <div className="space-y-2">
          <Label>Status no Funil</Label>
          <Select value={funnelStage} onValueChange={setFunnelStage}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FUNNEL_STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </SalesFunnelSection>

      {/* Próxima Ação */}
      <NextActionSection>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Ação</Label>
            <Select value={nextAction} onValueChange={setNextAction}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {NEXT_ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Data prevista</Label>
            <Input type="date" value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)} />
          </div>
        </div>
      </NextActionSection>

      {/* Observações */}
      <ObservationsSection>
        <Textarea
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          placeholder="Anotações gerais sobre a visita técnica..."
          rows={4}
        />
      </ObservationsSection>

      <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
        <Button type="button" variant="outline" onClick={() => navigate('/create-task')}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isCreating}>
          {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar Visita Técnica
        </Button>
      </div>
    </form>
  );
};

export default TechnicalVisitForm;
