import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LayoutDashboard, Plus, CheckSquare, BarChart3, Car, User, Settings, LogOut, Users, Building, TrendingUp } from 'lucide-react';
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
    path: '/management',
    icon: Settings,
    label: 'Dados Gerenciais'
  }, {
    path: '/create-task',
    icon: LayoutDashboard,
    label: 'Nova Tarefa'
  }, {
    path: '/',
    icon: CheckSquare,
    label: 'Resumo Tarefas'
  }, {
    path: '/dashboard',
    icon: TrendingUp,
    label: 'Funil de Vendas'
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
        <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex items-center space-x-1 sm:space-x-2">
                <Car className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                <h1 className="text-lg sm:text-2xl font-bold text-foreground">Ferramenta de Vendas</h1>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="hidden sm:flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="text-sm font-medium">{user?.email || 'Usuário'}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair" className="h-8 w-8 sm:h-10 sm:w-10">
                <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-6">
        <div className="flex flex-col lg:flex-row gap-2 lg:gap-6">
          {/* Sidebar - Hidden on mobile, visible on desktop */}
          <aside className="hidden lg:block w-64 space-y-2">
            <Card className="p-4">
              <nav className="space-y-1">
                {navItems.map(item => <Link key={item.path} to={item.path} className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-all ${isActive(item.path) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>)}
                
                {isAdmin && <>
                    <div className="border-t pt-2 mt-2">
                      <p className="text-xs font-semibold text-muted-foreground px-3 py-2">ADMINISTRAÇÃO</p>
                    </div>
                    {adminItems.map(item => <Link key={item.path} to={item.path} className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-all ${isActive(item.path) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>)}
                  </>}
              </nav>
            </Card>
          </aside>

          {/* Mobile Navigation */}
          <div className="lg:hidden mb-4">
            <Card className="p-2">
              <nav className="flex overflow-x-auto space-x-2 pb-2">
                {navItems.map(item => <Link key={item.path} to={item.path} className={`flex flex-col items-center space-y-1 px-3 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap min-w-fit ${isActive(item.path) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                    <item.icon className="h-4 w-4" />
                    <span className="text-[10px]">{item.label}</span>
                  </Link>)}
                
                {isAdmin && adminItems.map(item => <Link key={item.path} to={item.path} className={`flex flex-col items-center space-y-1 px-3 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap min-w-fit ${isActive(item.path) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
                    <item.icon className="h-4 w-4" />
                    <span className="text-[10px]">{item.label}</span>
                  </Link>)}
              </nav>
            </Card>
          </div>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <div className="animate-fade-in">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>;
};