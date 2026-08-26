import React from 'react';
import { Navigate } from 'react-router-dom';
import { SalesFunnel } from '@/components/SalesFunnel';
import { useUserRole } from '@/hooks/useUserRole';
import { shouldLandOnMyDay } from '@/lib/myDay';

/**
 * Rota "/" — decide a primeira tela da SESSÃO.
 *
 * Cargos operacionais caem no /meu-dia apenas no PRIMEIRO acesso da sessão.
 * Depois disso a raiz volta a renderizar o funil e nenhuma navegação manual
 * é redirecionada (sem loop). admin/manager/supervisor não mudam de comportamento.
 */
let landingRedirectDone = false;

export const MyDayLanding: React.FC = () => {
  const { rawRoles, isLoading } = useUserRole();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  if (!landingRedirectDone && shouldLandOnMyDay(rawRoles as string[])) {
    landingRedirectDone = true;
    return <Navigate to="/meu-dia" replace />;
  }

  landingRedirectDone = true;
  return <SalesFunnel />;
};
