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
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const SalesFunnel = React.lazy(() => import("./components/SalesFunnel").then((m) => ({ default: m.SalesFunnel })));
const MyDay = React.lazy(() => import("./pages/MyDay"));
const MyDayLanding = React.lazy(() => import("@/components/myday/MyDayLanding").then((m) => ({ default: m.MyDayLanding })));
const CreateTask = React.lazy(() => import("./pages/CreateTask"));
const CreateFieldVisit = React.lazy(() => import("./pages/CreateFieldVisit"));
const CreateCall = React.lazy(() => import("./pages/CreateCall"));
const CreateWorkshopChecklist = React.lazy(() => import("./pages/CreateWorkshopChecklist"));
const CreateTechnicalVisit = React.lazy(() => import("./pages/CreateTechnicalVisit"));

const Campaigns = React.lazy(() => import("./pages/Campaigns"));
const Management = React.lazy(() => import("./pages/Management"));
const Users = React.lazy(() => import("./pages/Users").then((m) => ({ default: m.Users })));
const Filiais = React.lazy(() => import("./pages/Filiais").then((m) => ({ default: m.Filiais })));
const Equipamentos = React.lazy(() => import("./pages/Equipamentos"));
const Pops = React.lazy(() => import("./pages/Pops"));
const PerformanceByFilial = React.lazy(() => import("./pages/PerformanceByFilial"));
const PerformanceBySeller = React.lazy(() => import("./pages/PerformanceBySeller"));

const InviteAccept = React.lazy(() => import("./pages/InviteAccept"));
const UserRegistration = React.lazy(() => import("./pages/UserRegistration"));
const RegistrationSuccess = React.lazy(() => import("./pages/RegistrationSuccess"));
const SecureRegistration = React.lazy(() => import("./pages/SecureRegistration"));
const ProfileSetup = React.lazy(() => import("./pages/ProfileSetup"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const ResetPassword = React.lazy(() => import("./pages/ResetPassword"));
const CRM = React.lazy(() => import("./pages/CRM"));
const Vacations = React.lazy(() => import("./pages/Vacations"));
import { ErrorBoundary } from "@/components/ErrorBoundary";
const MediaDiagnostics = React.lazy(() => import("./pages/MediaDiagnostics"));
const UserVersions = React.lazy(() => import("./pages/UserVersions"));
const ClientMasterReview = React.lazy(() => import("./pages/ClientMasterReview"));
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

// Fallback único de carregamento de rota (mesmo spinner já usado no gate de auth).
const RouteFallback: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
  </div>
);

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
    return (
      <React.Suspense fallback={<RouteFallback />}>
        <ProfileSetup />
      </React.Suspense>
    );
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
    <React.Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/" element={<Layout><MyDayLanding /></Layout>} />
      <Route path="/meu-dia" element={<Layout><ErrorBoundary title="Não foi possível exibir o Meu Dia"><MyDay /></ErrorBoundary></Layout>} />
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
      <Route path="/pops" element={<Layout><ErrorBoundary title="Não foi possível exibir o POPS"><Pops /></ErrorBoundary></Layout>} />
      <Route path="/diagnostico-midia" element={<Layout><MediaDiagnostics /></Layout>} />
      <Route path="/versoes-usuarios" element={<Layout><UserVersions /></Layout>} />
      <Route path="/revisao-clientes" element={<Layout><ClientMasterReview /></Layout>} />
      <Route path="/profile-setup" element={<Layout><ProfileSetup /></Layout>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </React.Suspense>
  );
};

// Simplified routing component without auth dependencies
const AppRoutes: React.FC<{ user: any; profile: any }> = ({ user, profile }) => {
  return (
    <BrowserRouter>
      <React.Suspense fallback={<RouteFallback />}>
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
      </React.Suspense>
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
