import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { AuthProvider } from '@/components/AuthProvider';
import { useAuth } from '@/hooks/useAuth';
import { LoginForm } from '@/components/LoginForm';
import Dashboard from "./pages/Dashboard";
import { SalesFunnel } from "./components/SalesFunnel";
import CreateTask from "./pages/CreateTask";
import Tasks from "./pages/Tasks";
import Reports from "./pages/Reports";
import Management from "./pages/Management";
import { Users } from "./pages/Users";
import { Filiais } from "./pages/Filiais";
import { Home } from "./pages/Home";
import InviteAccept from "./pages/InviteAccept";
import UserRegistration from "./pages/UserRegistration";
import RegistrationSuccess from "./pages/RegistrationSuccess";
import SecureRegistration from "./pages/SecureRegistration";
import ProfileSetup from "./pages/ProfileSetup";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";

const queryClient = new QueryClient();

interface ProtectedRoutesProps {
  user: any;
  profile: any;
}

const ProtectedRoutes: React.FC<ProtectedRoutesProps> = ({ user, profile }) => {
  // If not authenticated, show login form
  if (!user) {
    return <LoginForm />;
  }

  // Debug logging
  console.log('DEBUG: User:', user?.id);
  console.log('DEBUG: Profile:', profile);
  console.log('DEBUG: Profile status:', profile?.approval_status);
  
  // If user exists but no profile found, show profile setup
  if (!profile) {
    console.log('DEBUG: Redirecionando para ProfileSetup - perfil não encontrado');
    return <ProfileSetup />;
  }

  // If profile is pending approval, force logout and show registration success page
  if (profile.approval_status === 'pending') {
    supabase.auth.signOut();
    return <RegistrationSuccess />;
  }

  // If profile is rejected, force logout and show rejection message
  if (profile.approval_status === 'rejected') {
    supabase.auth.signOut();
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-destructive mb-4">Acesso Negado</h1>
          <p className="text-muted-foreground">Seu cadastro foi rejeitado. Entre em contato com o administrador.</p>
        </div>
      </div>
    );
  }

  // Only allow access if approval_status is 'approved'
  if (profile.approval_status !== 'approved') {
    supabase.auth.signOut();
    return <RegistrationSuccess />;
  }

  // If everything is approved, show main app routes
  return (
    <Routes>
      <Route path="/" element={<Layout><Home /></Layout>} />
      <Route path="/dashboard" element={<Layout><SalesFunnel /></Layout>} />
      <Route path="/tasks" element={<Layout><Tasks /></Layout>} />
      <Route path="/create-task" element={<Layout><CreateTask /></Layout>} />
      <Route path="/management" element={<Layout><Management /></Layout>} />
      <Route path="/reports" element={<Layout><Reports /></Layout>} />
      <Route path="/users" element={<Layout><Users /></Layout>} />
      <Route path="/filiais" element={<Layout><Filiais /></Layout>} />
      <Route path="/profile-setup" element={<Layout><ProfileSetup /></Layout>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  console.log('DEBUG AppContent: loading auth:', loading, 'loading profile:', profileLoading, 'user:', !!user, 'profile:', !!profile);
  console.log('DEBUG: User:', user?.id);
  console.log('DEBUG: Profile:', profile?.id);
  console.log('DEBUG: Profile status:', { 
    _type: typeof profile?.approval_status, 
    value: profile?.approval_status 
  });

  // Wait for auth to load first
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Carregando autenticação...</p>
        </div>
      </div>
    );
  }

  // If user is authenticated, wait for profile to load
  if (user && profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Carregando perfil...</p>
        </div>
      </div>
    );
  }

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
