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
import { EquipmentParkBlock } from '@/components/equipment';
import {
  useEquipmentByClient, syncTaskEquipment,
} from '@/hooks/useClientEquipment';
import {
  EquipmentParkSection,
  ProductsOfferSection,
  TechnicalServiceSection,
  SalesEstimateSection,
  OpportunityClassificationSection,
  SalesFunnelSection,
  NextActionSection,
  ObservationsSection,
} from '@/components/task-form/sections';
import { CollapsibleProductsBlock } from '@/components/task-form/CollapsibleProductsBlock';
import { offerProducts } from '@/lib/predefinedProducts';
import { ProductType } from '@/types/task';
import { Checkbox } from '@/components/ui/checkbox';

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

  // Selecionados na visita (vínculo em task_equipment)
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const { data: clientEquipments = [] } = useEquipmentByClient(clientCode, clientName);

  // Mantém o bloco antigo somente para "cadastrar novo equipamento em campo".
  // A busca/listagem/edição agora é feita pelo EquipmentParkBlock.
  const loadClientEquipments = async (_code: string) => {
    // intencionalmente vazio — useEquipmentByClient reage à mudança do clientCode/Name
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

  // --- Produtos para Ofertar (mesma estrutura usada em Ligação/Visita à Fazenda) ---
  const [productsOffer, setProductsOffer] = useState<ProductType[]>(
    () => offerProducts.map((p, i) => ({
      id: `tv-prod-${i}`,
      name: p.name,
      category: p.category as any,
      selected: false,
      quantity: 0,
      price: 0,
      observations: '',
    })),
  );
  const updateProduct = (id: string, patch: Partial<ProductType>) =>
    setProductsOffer((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));



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
    const manualSnapshot = equipments
      .filter(e => e.model || e.serial_chassis || e.hours || e.year || e.observation)
      .map(e => ({
        model: e.model,
        serial_chassis: e.serial_chassis,
        hours: e.hours ? Number(e.hours) : null,
        year: e.year ? Number(e.year) : null,
        observation: e.observation,
      }));
    const selectedSnapshot = clientEquipments
      .filter(e => selectedEquipmentIds.includes(e.id))
      .map(e => ({
        id: e.id,
        model: e.model,
        serial_chassis: e.serial_chassis,
        hours: e.hours,
        year: e.year,
        machine_type: e.machine_type,
        puk_status: e.puk_status,
        observation: e.observation,
      }));
    const equipmentSnapshot = [...selectedSnapshot, ...manualSnapshot];

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

    const filialNome = profile?.filial_nome || '';


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
      checklist: productsOffer.filter((p) => p.selected),
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
      equipmentList: equipmentSnapshot,
    };

    try {
      const created: any = await createTask(taskData);
      // Vínculo task_equipment para equipamentos selecionados do cadastro mestre
      if (created?.id && selectedEquipmentIds.length > 0) {
        try {
          await syncTaskEquipment(created.id, selectedEquipmentIds);
        } catch (linkErr) {
          console.warn('Falha ao vincular equipamentos à task:', linkErr);
        }
      }
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
      {/* Informações Básicas (bloco padronizado) */}
      <BasicInfoBlock
        contactName={contactName}
        onContactNameChange={setContactName}
        showFunction
        contactFunction={contactFunction}
        onContactFunctionChange={setContactFunction}
        contactFunctionOther={contactFunctionOther}
        onContactFunctionOtherChange={setContactFunctionOther}
        phone={phone}
        onPhoneChange={setPhone}
        clientCode={clientCode}
        onClientCodeChange={setClientCode}
        clientName={clientName}
        onClientNameChange={setClientName}
        email={email}
        onEmailChange={setEmail}
        property={property}
        onPropertyChange={setProperty}
        vendedor={profile?.name || ''}
        filial={profile?.filial_nome || 'Não informado'}
        showFilialAtendida
        filialAtendida={filialAtendida}
        onFilialAtendidaChange={setFilialAtendida}
        filiais={filiais as any[]}
        onClientSelected={async (code) => {
          await Promise.all([
            loadClientEquipments(code),
            loadPreviousClientData(code),
          ]);
        }}
      />



      {/* Parque de Máquinas */}
      <EquipmentParkSection
        headerRight={
          <Button type="button" size="sm" variant="outline" onClick={addEquipmentRow}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        }
      >
        {/* Cadastro mestre: buscar, validar e selecionar equipamentos do cliente */}
        <EquipmentParkBlock
          clientCode={clientCode}
          clientName={clientName}
          selectable
          selectedIds={selectedEquipmentIds}
          onSelectionChange={setSelectedEquipmentIds}
        />

        {/* Cadastro em campo: novo equipamento que ainda não está no mestre */}
        <div className="pt-4 mt-4 border-t border-border/60">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Cadastrar novo equipamento em campo
          </p>
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
        </div>
      </EquipmentParkSection>

      {/* Produtos para Ofertar — recolhível, mesmo padrão de Ligação/Visita à Fazenda */}
      <ProductsOfferSection>
        <CollapsibleProductsBlock products={productsOffer}>
          <div className="space-y-3">
            {productsOffer.map((item) => (
              <div key={item.id} className="rounded-lg border border-border/50 p-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`tv-${item.id}`}
                    checked={item.selected}
                    onCheckedChange={(v) => updateProduct(item.id, { selected: !!v })}
                  />
                  <Label htmlFor={`tv-${item.id}`} className="text-sm font-medium">
                    {item.name}
                  </Label>
                </div>
                {item.selected && (
                  <div className="ml-6 mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label>QTD</Label>
                      <Input
                        type="number"
                        min="0"
                        value={item.quantity || ''}
                        onChange={(e) => updateProduct(item.id, { quantity: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Valor Unitário (R$)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.price || ''}
                        onChange={(e) => updateProduct(item.id, { price: parseFloat(e.target.value) || 0 })}
                        placeholder="0,00"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Valor Total</Label>
                      <Input
                        type="text"
                        readOnly
                        className="bg-muted cursor-not-allowed"
                        value={formatBRL((item.price || 0) * (item.quantity || 0))}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleProductsBlock>
      </ProductsOfferSection>



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
