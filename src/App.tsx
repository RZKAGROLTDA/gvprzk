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
import CreateTask from "./pages/CreateTask";
import Tasks from "./pages/Tasks";
import Reports from "./pages/Reports";
import Management from "./pages/Management";
import { Users } from "./pages/Users";
import { Filiais } from "./pages/Filiais";
import { Home } from "./pages/Home";
import ProfileSetup from "./pages/ProfileSetup";
import NotFound from "./pages/NotFound";
import { useProfile } from "@/hooks/useProfile";

const queryClient = new QueryClient();

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  // Check if user needs to complete profile setup
  if (!profile || !profile.name || !profile.role) {
    return <ProfileSetup />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout><Home /></Layout>} />
        <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
        <Route path="/tasks" element={<Layout><Tasks /></Layout>} />
        <Route path="/create-task" element={<Layout><CreateTask /></Layout>} />
        <Route path="/management" element={<Layout><Management /></Layout>} />
        <Route path="/reports" element={<Layout><Reports /></Layout>} />
        <Route path="/users" element={<Layout><Users /></Layout>} />
        <Route path="/filiais" element={<Layout><Filiais /></Layout>} />
        <Route path="/profile-setup" element={<Layout><ProfileSetup /></Layout>} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
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
