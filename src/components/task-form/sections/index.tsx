import React from 'react';
import {
  User,
  Tractor,
  Package,
  Wrench,
  TrendingUp,
  Target,
  BarChart3,
  CalendarClock,
  MessageSquare,
  Camera,
} from 'lucide-react';
import { SectionCard } from './SectionCard';

type ChildrenProps = {
  children: React.ReactNode;
  className?: string;
  headerRight?: React.ReactNode;
};

/**
 * Componentes de seção do formulário de tarefa.
 *
 * Todos são PURE PRESENTATIONAL / CONTROLLED:
 *   - Não mantêm estado.
 *   - Não chamam Supabase.
 *   - Não contêm regras de negócio.
 *   - Recebem `children` (campos controlados pelo formulário pai).
 *
 * Reutilizam o design system (tokens semânticos de cor + shadcn Card).
 */

export const ClientInfoSection: React.FC<ChildrenProps> = ({ children, className, headerRight }) => (
  <SectionCard
    icon={User}
    title="Informações do Cliente"
    description="Dados de contato, propriedade e filial atendida"
    tone="primary"
    className={className}
    headerRight={headerRight}
  >
    {children}
  </SectionCard>
);

export const EquipmentParkSection: React.FC<ChildrenProps> = ({ children, className, headerRight }) => (
  <SectionCard
    icon={Tractor}
    title="Parque de Máquinas"
    description="Equipamentos do cliente"
    tone="success"
    className={className}
    headerRight={headerRight}
  >
    {children}
  </SectionCard>
);

export const ProductsOfferSection: React.FC<ChildrenProps> = ({ children, className, headerRight }) => (
  <SectionCard
    icon={Package}
    title="Produtos para Ofertar"
    description="Selecione os produtos abordados na ligação"
    tone="primary"
    className={className}
    headerRight={headerRight}
  >
    {children}
  </SectionCard>
);

export const TechnicalServiceSection: React.FC<ChildrenProps> = ({ children, className, headerRight }) => (
  <SectionCard
    icon={Wrench}
    title="Atendimento Técnico"
    description="Categoria técnica e detalhes do serviço"
    tone="warning"
    className={className}
    headerRight={headerRight}
  >
    {children}
  </SectionCard>
);

export const SalesEstimateSection: React.FC<ChildrenProps> = ({ children, className, headerRight }) => (
  <SectionCard
    icon={TrendingUp}
    title="Estimativa de Venda"
    description="Projeção de valor da oportunidade"
    tone="success"
    className={className}
    headerRight={headerRight}
  >
    {children}
  </SectionCard>
);

export const OpportunityClassificationSection: React.FC<ChildrenProps> = ({ children, className, headerRight }) => (
  <SectionCard
    icon={Target}
    title="Classificação da Oportunidade"
    description="Interesse, urgência, impacto e perspectiva de fechamento"
    tone="primary"
    className={className}
    headerRight={headerRight}
  >
    {children}
  </SectionCard>
);

export const SalesFunnelSection: React.FC<ChildrenProps> = ({ children, className, headerRight }) => (
  <SectionCard
    icon={BarChart3}
    title="Funil de Vendas"
    description="Status atual da oportunidade"
    tone="primary"
    className={className}
    headerRight={headerRight}
  >
    {children}
  </SectionCard>
);

export const NextActionSection: React.FC<ChildrenProps> = ({ children, className, headerRight }) => (
  <SectionCard
    icon={CalendarClock}
    title="Próxima Ação"
    description="Próximo passo planejado com o cliente"
    tone="warning"
    className={className}
    headerRight={headerRight}
  >
    {children}
  </SectionCard>
);

export const ObservationsSection: React.FC<ChildrenProps> = ({ children, className, headerRight }) => (
  <SectionCard
    icon={MessageSquare}
    title="Observações"
    description="Anotações gerais da tarefa"
    tone="muted"
    className={className}
    headerRight={headerRight}
  >
    {children}
  </SectionCard>
);

export const PhotosCheckinSection: React.FC<ChildrenProps> = ({ children, className, headerRight }) => (
  <SectionCard
    icon={Camera}
    title="Fotos e Check-in"
    description="Registros visuais e localização"
    tone="muted"
    className={className}
    headerRight={headerRight}
  >
    {children}
  </SectionCard>
);
