import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LayoutDashboard, Plus, CheckSquare, BarChart3, Car, User, Bell, Settings, LogOut, Users, Building } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
interface LayoutProps {
  children: React.ReactNode;
}
export const Layout: React.FC<LayoutProps> = ({
  children
}) => {
  const location = useLocation();
  const {
    user,
    signOut
  } = useAuth();
  const {
    isAdmin
  } = useProfile();
  const isActive = (path: string) => location.pathname === path;
  const handleLogout = async () => {
    await signOut();
  };
  const navItems = [{
    path: '/',
    icon: LayoutDashboard,
    label: 'Dashboard'
  }, {
    path: '/tasks',
    icon: CheckSquare,
    label: 'Tarefas'
  }, {
    path: '/create-task',
    icon: Plus,
    label: 'Nova Tarefa'
  }, {
    path: '/management',
    icon: Settings,
    label: 'Dados Gerenciais'
  }, {
    path: '/reports',
    icon: BarChart3,
    label: 'Relatórios'
  }];
  const adminItems = [{
    path: '/users',
    icon: Users,
    label: 'Usuários'
  }, {
    path: '/filiais',
    icon: Building,
    label: 'Filiais'
  }];
  return <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Car className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold text-foreground">
                  Gestão de Visitas
                </h1>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="icon">
                <Bell className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="text-sm font-medium">{user?.email || 'Usuário'}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className="w-64 space-y-2">
            <Card className="p-4">
              <nav className="space-y-1">
                {navItems.map(item => <Link key={item.path} to={item.path} className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-all ${isActive(item.path) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>)}
                
                {isAdmin && <>
                    <div className="border-t pt-2 mt-2">
                      <p className="text-xs font-semibold text-muted-foreground px-3 py-2">ADMINISTRAÇÃO</p>
                      <Link 
                        to="/profile-setup" 
                        className="flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-all text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        <User className="h-4 w-4" />
                        <span>Criar Novo Usuário</span>
                      </Link>
                    </div>
                    {adminItems.map(item => <Link key={item.path} to={item.path} className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-all ${isActive(item.path) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>)}
                  </>}
              </nav>
            </Card>
          </aside>

          {/* Main Content */}
          <main className="flex-1">
            <div className="animate-fade-in">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>;
};