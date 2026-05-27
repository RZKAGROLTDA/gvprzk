import React from 'react';
import {
  TaskHeader,
  SummaryCards,
  NextActionCard,
  MobileStickyFooter,
  type SummaryCardItem,
} from '@/components/task-form';
import { Coins, Tractor, Package, CalendarCheck2 } from 'lucide-react';
import CreateTask from './CreateTask';
import { useProfile } from '@/hooks/useProfile';

/**
 * Visita Fazenda — redesign visual (iteração 1).
 *
 * O motor de gravação permanece sendo <CreateTask taskType="field-visit" />:
 * mesma `task` state, mesmo `handleSubmit`, mesmos contratos com Supabase,
 * mesmas regras de negócio (prospect/ganho/parcial/perdido, valor, offline).
 *
 * Esta camada adiciona apenas:
 *   - Header executivo (título, status, score visual, contexto cliente/filial/consultor)
 *   - Cards de resumo (guidance — score/cards refletirão state ao vivo na próxima iteração)
 *   - Próxima ação (placeholder visual)
 *   - Footer sticky mobile-first
 *
 * Próxima etapa lifa state do CreateTask para alimentar score/summary com dados reais
 * e introduz tabs (Cliente · Equipamentos · Oferta · Visita) separando Peças x Serviços.
 */
const FieldVisitForm: React.FC = () => {
  const { profile } = useProfile();

  const summary: SummaryCardItem[] = [
    {
      icon: Coins,
      label: 'Valor oportunidade',
      value: 'R$ 0',
      hint: 'Atualiza ao selecionar itens',
      tone: 'primary',
    },
    {
      icon: Tractor,
      label: 'Equipamentos',
      value: '0',
      hint: 'Família · quantidade · hectares',
    },
    {
      icon: Package,
      label: 'Itens da oferta',
      value: 'Peças 0 · Serviços 0',
      hint: 'Separados por categoria',
    },
    {
      icon: CalendarCheck2,
      label: 'Próxima ação',
      value: 'A definir',
      hint: 'Agende um lembrete',
      tone: 'warning',
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <TaskHeader
        title="Visita à Fazenda"
        subtitle="Registre a visita, ofereça produtos e serviços, e mantenha a oportunidade viva."
        status={{ label: 'Em andamento', variant: 'secondary' }}
        score={0}
        client={undefined}
        filial={profile?.filial_nome ?? undefined}
        consultant={profile?.name ?? undefined}
        backTo="/create-task"
      />

      <SummaryCards items={summary} />

      <NextActionCard empty />

      {/*
        Motor de gravação intacto. Todos os campos, validações, fluxos de
        prospect/ganho/parcial/perdido, salvamento online/offline e contratos
        com Supabase continuam sendo controlados aqui dentro.
      */}
      <div className="rounded-xl border bg-card p-2 sm:p-4">
        <CreateTask taskType="field-visit" />
      </div>

      <MobileStickyFooter score={0}>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Use o botão "Salvar" do formulário acima
        </span>
      </MobileStickyFooter>
    </div>
  );
};

export default FieldVisitForm;
