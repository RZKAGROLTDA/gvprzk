import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster as HotToaster } from "react-hot-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { AuthProvider } from '@/components/AuthProvider';
import { ProfileAutoCreator } from '@/components/ProfileAutoCreator';
import { LoginForm } from '@/components/LoginForm';
import { SecurityHeaders } from '@/components/SecurityHeaders';
import { ServiceUnavailable } from '@/components/ServiceUnavailable';
import { useAuth } from '@/hooks/useAuth';
import { useSupabaseHealth } from '@/hooks/useSupabaseHealth';
import Dashboard from "./pages/Dashboard";
import { SalesFunnel } from "./components/SalesFunnel";
import CreateTask from "./pages/CreateTask";
import CreateFieldVisit from "./pages/CreateFieldVisit";
import CreateCall from "./pages/CreateCall";
import CreateWorkshopChecklist from "./pages/CreateWorkshopChecklist";
import CreateTechnicalVisit from "./pages/CreateTechnicalVisit";

import Campaigns from "./pages/Campaigns";
import Management from "./pages/Management";
import { Users } from "./pages/Users";
import { Filiais } from "./pages/Filiais";
import Equipamentos from "./pages/Equipamentos";
import PerformanceByFilial from "./pages/PerformanceByFilial";
import PerformanceBySeller from "./pages/PerformanceBySeller";
import { Home } from "./pages/Home";
import InviteAccept from "./pages/InviteAccept";
import UserRegistration from "./pages/UserRegistration";
import RegistrationSuccess from "./pages/RegistrationSuccess";
import SecureRegistration from "./pages/SecureRegistration";
import ProfileSetup from "./pages/ProfileSetup";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import CRM from "./pages/CRM";
import Vacations from "./pages/Vacations";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MediaDiagnostics from "./pages/MediaDiagnostics";
import UserVersions from "./pages/UserVersions";
import ClientMasterReview from "./pages/ClientMasterReview";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { useAutoVersionCheck } from "@/hooks/useAutoVersionCheck";
import { useVersionHeartbeat } from "@/hooks/useVersionHeartbeat";
import { VersionUpdateNotification } from "@/components/VersionUpdateNotification";
import { MandatoryUpdateGate } from "@/components/MandatoryUpdateGate";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, LogOut, RefreshCw } from "lucide-react";

// O QueryClient é ÚNICO e vive em src/components/QueryProvider.tsx (main.tsx).
// Nunca criar outro client/provider aqui: o provider interno sobrescreveria
// staleTime, refetchOnMount, refetchOnWindowFocus e o backoff globais.

// Guarda o último usuário cujo cache está em memória. `undefined` = primeiro
// render (nada a limpar); string/null = usuário já observado nesta sessão.
let lastQueryClientUserId: string | null | undefined = undefined;

interface ProtectedRoutesProps {
  user: any;
  profile: any;
}

const ProtectedRoutes: React.FC<ProtectedRoutesProps> = ({ user, profile }) => {
  // If not authenticated, show login form
  if (!user) {
    return <LoginForm />;
  }

  // If user exists but no profile found, show profile setup
  if (!profile) {
    return <ProfileSetup />;
  }

  // Block access until approved
  if (profile?.approval_status && profile.approval_status !== 'approved') {
    return (
      <ProfileAutoCreator
        onProfileCreated={() => {
          window.location.reload();
        }}
      />
    );
  }

  // Approved: show main app routes
  return (
    <Routes>
      <Route path="/" element={<Layout><SalesFunnel /></Layout>} />
      <Route path="/dashboard" element={<Layout><SalesFunnel /></Layout>} />
      <Route path="/create-task" element={<Layout><CreateTask /></Layout>} />
      <Route path="/create-field-visit" element={<Layout><CreateFieldVisit /></Layout>} />
      <Route path="/create-call" element={<Layout><CreateCall /></Layout>} />
      <Route path="/create-workshop-checklist" element={<Layout><CreateWorkshopChecklist /></Layout>} />
      <Route path="/create-technical-visit" element={<Layout><CreateTechnicalVisit /></Layout>} />
      <Route path="/management" element={<Layout><Management /></Layout>} />
      <Route path="/crm" element={<Layout><CRM /></Layout>} />
      <Route path="/vacations" element={<Layout><ErrorBoundary title="Não foi possível exibir a Agenda de Férias"><Vacations /></ErrorBoundary></Layout>} />
      <Route path="/campaigns" element={<Layout><Campaigns /></Layout>} />
      <Route path="/reports/filial" element={<Layout><PerformanceByFilial /></Layout>} />
      <Route path="/reports/seller" element={<Layout><PerformanceBySeller /></Layout>} />
      <Route path="/users" element={<Layout><Users /></Layout>} />
      <Route path="/filiais" element={<Layout><Filiais /></Layout>} />
      <Route path="/equipamentos" element={<Layout><Equipamentos /></Layout>} />
      <Route path="/diagnostico-midia" element={<Layout><MediaDiagnostics /></Layout>} />
      <Route path="/versoes-usuarios" element={<Layout><UserVersions /></Layout>} />
      <Route path="/revisao-clientes" element={<Layout><ClientMasterReview /></Layout>} />
      <Route path="/profile-setup" element={<Layout><ProfileSetup /></Layout>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

// Simplified routing component without auth dependencies
const AppRoutes: React.FC<{ user: any; profile: any }> = ({ user, profile }) => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes - accessible without authentication */}
        <Route path="/register" element={<UserRegistration />} />
        <Route path="/cadastro" element={<SecureRegistration />} />
        <Route path="/registration-success" element={<RegistrationSuccess />} />
        <Route path="/invite" element={<InviteAccept />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        
        {/* Protected routes */}
        <Route path="/*" element={<ProtectedRoutes user={user} profile={profile} />} />
      </Routes>
    </BrowserRouter>
  );
};

// AuthProvider wrapper with profile management
const AppContent: React.FC = () => {
  return (
    <AuthProvider>
      <AuthAwareWrapper />
    </AuthProvider>
  );
};

// Component that safely uses auth hooks inside AuthProvider
const AuthAwareWrapper: React.FC = () => {
  const { user, loading, signOut } = useAuth();
  const { profile, loading: profileLoading, error: profileError, loadProfile } = useProfile();
  const { isUnhealthy, retryWithBackoff, errorMessage, retryCount } = useSupabaseHealth();
  const queryClient = useQueryClient();

  // Monitoramento de versão por usuário/dispositivo (nunca bloqueia acesso)
  useVersionHeartbeat(user?.id ?? null, !!user && !!profile);

  React.useEffect(() => {
    const currentUserId = user?.id ?? null;

    // Primeiro render da sessão: apenas registra o usuário observado.
    // NUNCA limpar o cache aqui — era isso que descartava profile/roles
    // recém-buscados logo após o login.
    if (lastQueryClientUserId === undefined) {
      lastQueryClientUserId = currentUserId;
      return;
    }

    // Limpeza só quando o user_id REALMENTE muda (troca de conta ou logout),
    // impedindo vazamento de cache entre usuários.
    if (lastQueryClientUserId !== currentUserId) {
      queryClient.clear();
      lastQueryClientUserId = currentUserId;
    }
  }, [user?.id, queryClient]);

  // Show service unavailable screen if Supabase is unhealthy and not loading user
  if (isUnhealthy && !loading && !user) {
    return (
      <ServiceUnavailable
        onRetry={retryWithBackoff}
        errorMessage={errorMessage || undefined}
        retryCount={retryCount}
      />
    );
  }

  // Gate: apenas estado de autenticação + profile mínimo. Sem watchdog.
  if (loading || (user && profileLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Erro real (não timeout artificial) ao buscar o perfil
  if (user && profileError) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-4">
        <Alert variant="destructive" className="max-w-lg">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar seu acesso</AlertTitle>
          <AlertDescription className="mt-2 space-y-4">
            <p>{profileError}</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void loadProfile()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Tentar novamente
              </Button>
              <Button variant="outline" onClick={() => void signOut()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return <AppRoutes user={user} profile={profile} />;
};

const App = () => {
  useAutoVersionCheck();
  return (
    <TooltipProvider>
      <SecurityHeaders />
      <Toaster />
      <Sonner />
      <HotToaster />
      <VersionUpdateNotification />
      <MandatoryUpdateGate>
        <AppContent />
      </MandatoryUpdateGate>
    </TooltipProvider>
  );

};

export default App;
