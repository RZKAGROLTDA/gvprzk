import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Settings, Trash } from 'lucide-react';
import { SessionRefresh } from '@/components/SessionRefresh';

export const LoginForm: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'consultant'
  });

  // Limpar dados locais se houver erro persistente
  const clearLocalData = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      
      // Limpar especificamente os dados do Supabase
      localStorage.removeItem('sb-wuvbrkbhunifudaewhng-auth-token');
      
      toast({
        title: "Dados locais limpos",
        description: "Cache e tokens removidos. Tente fazer login novamente.",
      });
      
      console.log('DEBUG: Dados locais limpos');
    } catch (error) {
      console.error('Erro ao limpar dados:', error);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    console.log('DEBUG: Tentando login com:', formData.email);
    
    const { error } = await signIn(formData.email, formData.password);
    
    if (error) {
      console.error('DEBUG: Erro no login:', error);
      
      let errorMessage = error.message;
      
      // Mensagens mais amigáveis para erros comuns
      if (error.message === 'Invalid login credentials') {
        errorMessage = 'Email ou senha incorretos. Verifique suas credenciais.';
      } else if (error.message.includes('refresh_token_not_found')) {
        errorMessage = 'Sessão expirada. Limpe os dados locais e tente novamente.';
      }
      
      toast({
        title: "Erro no login",
        description: errorMessage,
        variant: "destructive",
      });
    } else {
      console.log('DEBUG: Login bem-sucedido');
      toast({
        title: "Login realizado com sucesso!",
        description: "Bem-vindo ao sistema de tarefas",
      });
    }
    
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    console.log('DEBUG: Tentando cadastro com:', formData.email);

    const { error } = await signUp(formData.email, formData.password, {
      name: formData.name,
      role: formData.role
    });
    
    if (error) {
      console.error('DEBUG: Erro no cadastro:', error);
      toast({
        title: "Erro no cadastro",
        description: error.message,
        variant: "destructive",
      });
    } else {
      console.log('DEBUG: Cadastro bem-sucedido');
      toast({
        title: "Cadastro realizado com sucesso!",
        description: "Verifique seu email para confirmar a conta",
      });
    }
    
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!formData.email) {
      toast({
        title: "Email necessário",
        description: "Digite seu email para recuperar a senha",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast({
        title: "Erro ao enviar email",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Email enviado!",
        description: "Verifique sua caixa de entrada para recuperar a senha",
      });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-4xl flex flex-col lg:flex-row gap-6">
        {/* Login Form */}
        <Card className="w-full max-w-md mx-auto lg:mx-0">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Sistema de Tarefas</CardTitle>
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDebug(!showDebug)}
                className="text-xs"
              >
                <Settings className="h-3 w-3 mr-1" />
                {showDebug ? 'Ocultar' : 'Mostrar'} Debug
              </Button>
            </div>
          </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    required
                  />
                </div>
                
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Entrar
                </Button>
                
                <div className="flex justify-between items-center mt-4">
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline"
                    onClick={handleForgotPassword}
                    disabled={loading}
                  >
                    Esqueci minha senha
                  </button>
                  
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearLocalData}
                    className="text-xs"
                    disabled={loading}
                  >
                    <Trash className="h-3 w-3 mr-1" />
                    Limpar Cache
                  </Button>
                </div>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Nome</Label>
                  <Input
                    id="signup-name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    required
                  />
                </div>
                
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Cadastrar
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Debug Panel */}
      {showDebug && (
        <div className="w-full max-w-md mx-auto lg:mx-0">
          <SessionRefresh />
          
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm">Contas de Teste</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="p-2 bg-muted rounded">
                <p className="font-medium">Manager:</p>
                <p>Email: robson.ferro@rzkagro.com.br</p>
                <p>Email: hugo@rzkagro.com.br</p>
                <p className="text-muted-foreground mt-1">Use "Esqueci minha senha" para redefinir</p>
              </div>
              
              <div className="p-2 bg-muted rounded">
                <p className="font-medium">Problemas comuns:</p>
                <ul className="list-disc list-inside text-muted-foreground">
                  <li>Use "Limpar Cache" se tiver erro de token</li>
                  <li>Verifique console para logs detalhados</li>
                  <li>Use "Testar Autenticação" para diagnóstico</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
    </div>
  );
};