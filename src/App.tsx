import React from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster as HotToaster } from "react-hot-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { AuthProvider } from '@/components/AuthProvider';
import { ProfileAutoCreator } from '@/components/ProfileAutoCreator';
import { LoginForm } from '@/components/LoginForm';
import { SecurityHeaders } from '@/components/SecurityHeaders';
import { useAuth } from '@/hooks/useAuth';
import Dashboard from "./pages/Dashboard";
import { SalesFunnel } from "./components/SalesFunnel";
import CreateTask from "./pages/CreateTask";
import CreateFieldVisit from "./pages/CreateFieldVisit";
import CreateCall from "./pages/CreateCall";
import CreateWorkshopChecklist from "./pages/CreateWorkshopChecklist";

import Reports from "./pages/Reports";
import Management from "./pages/Management";
import { Users } from "./pages/Users";
import { Filiais } from "./pages/Filiais";
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

  // If user exists but no profile found, show profile setup (auto-approved after creation)
  if (!profile) {
    return <ProfileSetup />;
  }


  // If everything is approved, show main app routes
  return (
    <Routes>
      <Route path="/" element={<Layout><CreateTask /></Layout>} />
      <Route path="/dashboard" element={<Layout><SalesFunnel /></Layout>} />
      <Route path="/create-task" element={<Layout><CreateTask /></Layout>} />
      <Route path="/create-field-visit" element={<Layout><CreateFieldVisit /></Layout>} />
      <Route path="/create-call" element={<Layout><CreateCall /></Layout>} />
      <Route path="/create-workshop-checklist" element={<Layout><CreateWorkshopChecklist /></Layout>} />
      <Route path="/management" element={<Layout><Management /></Layout>} />
      <Route path="/reports" element={<Layout><Reports /></Layout>} />
      <Route path="/reports/filial" element={<Layout><PerformanceByFilial /></Layout>} />
      <Route path="/reports/seller" element={<Layout><PerformanceBySeller /></Layout>} />
      <Route path="/users" element={<Layout><Users /></Layout>} />
      <Route path="/filiais" element={<Layout><Filiais /></Layout>} />
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
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const [showProfileCreator, setShowProfileCreator] = React.useState(false);

  // Show profile creator if user exists but no profile
  React.useEffect(() => {
    if (!loading && !profileLoading && user && !profile) {
      setShowProfileCreator(true);
    } else {
      setShowProfileCreator(false);
    }
  }, [user, profile, loading, profileLoading]);

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (showProfileCreator) {
    return (
      <ProfileAutoCreator 
        onProfileCreated={() => {
          setShowProfileCreator(false);
          window.location.reload();
        }} 
      />
    );
  }

  return <AppRoutes user={user} profile={profile} />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SecurityHeaders />
      <Toaster />
      <Sonner />
      <HotToaster />
      <AppContent />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
