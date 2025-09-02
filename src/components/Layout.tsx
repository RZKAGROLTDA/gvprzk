
import React, { memo, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LayoutDashboard, Plus, CheckSquare, BarChart3, Car, User, Settings, LogOut, Users, Building, TrendingUp } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useSessionSecurity } from '@/hooks/useSessionSecurity';

interface LayoutProps {
  children: React.ReactNode;
}

// Memoize navigation items to prevent unnecessary re-renders
const useNavigationItems = () => {
  return useMemo(() => ({
    navItems: [
      {
        path: '/create-task',
        icon: LayoutDashboard,
        label: 'Nova Tarefa'
      }, 
      {
        path: '/dashboard',
        icon: TrendingUp,
        label: 'Dashboard'
      }, 
      {
        path: '/reports',
        icon: BarChart3,
        label: 'Relatórios'
      }
    ],
    adminItems: [
      {
        path: '/users',
        icon: Users,
        label: 'Usuários'
      }, 
      {
        path: '/filiais',
        icon: Building,
        label: 'Filiais'
      },
      {
        path: '/management',
        icon: Settings,
        label: 'Gestão'
      }
    ]
  }), []);
};

// Mapeamento de roles para português
const roleLabels: Record<string, string> = {
  'manager': 'Gerente',
  'supervisor': 'Supervisor',
  'rac': 'RAC',
  'consultant': 'Consultor',
  'sales_consultant': 'Consultor de Vendas',
  'technical_consultant': 'Consultor Técnico'
};

// Memoize navigation link component to prevent unnecessary re-renders
const NavLink = memo(({ item, isActive, className }: { 
  item: { path: string; icon: React.ComponentType<any>; label: string }; 
  isActive: boolean;
  className?: string;
}) => (
  <Link 
    to={item.path} 
    className={`${className} ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
  >
    <item.icon className="h-4 w-4" />
    <span>{item.label}</span>
  </Link>
));

NavLink.displayName = 'NavLink';

export const Layout: React.FC<LayoutProps> = memo(({ children }) => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { profile, isAdmin } = useProfile();
  
  // Initialize session security monitoring
  useSessionSecurity();
  
  const { navItems, adminItems } = useNavigationItems();
  
  // Memoize active path check to prevent recalculation on every render
  const isActive = useMemo(() => (path: string) => location.pathname === path, [location.pathname]);
  
  const handleLogout = useMemo(() => async () => {
    await signOut();
  }, [signOut]);

  const userDisplayName = useMemo(() => user?.email || 'Usuário', [user?.email]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b shadow-sm">
        <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex items-center space-x-1 sm:space-x-2">
                <Car className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                <h1 className="text-lg sm:text-2xl font-bold text-foreground">Gestão de Vendas de Peças</h1>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-sm font-medium text-foreground">{profile?.name || userDisplayName}</span>
                  <div className="flex flex-col text-xs text-muted-foreground">
                    <span>{roleLabels[profile?.role] || 'Usuário'}</span>
                    {profile?.filial_nome && <span>{profile.filial_nome}</span>}
                  </div>
                </div>
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
                {navItems.map(item => (
                  <NavLink 
                    key={item.path}
                    item={item}
                    isActive={isActive(item.path)}
                    className="flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-all"
                  />
                ))}
                
                {isAdmin && (
                  <>
                    <div className="border-t pt-2 mt-2">
                      <p className="text-xs font-semibold text-muted-foreground px-3 py-2">ADMINISTRAÇÃO</p>
                    </div>
                    {adminItems.map(item => (
                      <NavLink 
                        key={item.path}
                        item={item}
                        isActive={isActive(item.path)}
                        className="flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-all"
                      />
                    ))}
                  </>
                )}
              </nav>
            </Card>
          </aside>

          {/* Mobile Navigation */}
          <div className="lg:hidden mb-4">
            <Card className="p-2">
              <nav className="flex overflow-x-auto space-x-2 pb-2">
                {navItems.map(item => (
                  <NavLink 
                    key={item.path}
                    item={item}
                    isActive={isActive(item.path)}
                    className="flex flex-col items-center space-y-1 px-3 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap min-w-fit"
                  />
                ))}
                
                {isAdmin && adminItems.map(item => (
                  <NavLink 
                    key={item.path}
                    item={item}
                    isActive={isActive(item.path)}
                    className="flex flex-col items-center space-y-1 px-3 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap min-w-fit"
                  />
                ))}
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
    </div>
  );
});

Layout.displayName = 'Layout';
