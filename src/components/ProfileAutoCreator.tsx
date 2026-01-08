import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, User, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ProfileAutoCreatorProps {
  onProfileCreated: () => void;
}

interface Filial {
  id: string;
  nome: string;
}

export const ProfileAutoCreator: React.FC<ProfileAutoCreatorProps> = ({ onProfileCreated }) => {
  let user = null;
  let authError = false;
  
  try {
    const authContext = useAuth();
    user = authContext.user;
  } catch (error) {
    console.warn('ProfileAutoCreator: AuthProvider context not available:', error);
    authError = true;
  }

  const [isCreating, setIsCreating] = useState(false);
  const [status, setStatus] = useState<'checking' | 'missing' | 'creating' | 'done'>('checking');
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [selectedFilial, setSelectedFilial] = useState<string>('');
  const [loadingFiliais, setLoadingFiliais] = useState(true);

  useEffect(() => {
    if (authError) {
      toast.error('❌ Erro de autenticação. Recarregando...');
      setTimeout(() => window.location.reload(), 2000);
      return;
    }
    
    if (user) {
      checkProfile();
      loadFiliais();
    }
  }, [user, authError]);

  const loadFiliais = async () => {
    try {
      setLoadingFiliais(true);
      const { data, error } = await supabase.rpc('get_filiais_for_registration');
      
      if (error) {
        console.error('Erro ao carregar filiais:', error);
        // Fallback to direct query
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('filiais')
          .select('id, nome')
          .order('nome');
        
        if (fallbackError) throw fallbackError;
        setFiliais(fallbackData || []);
      } else {
        setFiliais(data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar filiais:', error);
      toast.error('Erro ao carregar filiais');
    } finally {
      setLoadingFiliais(false);
    }
  };

  const checkProfile = async () => {
    if (!user) return;

    try {
      setStatus('checking');
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, approval_status')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && !error.message.includes('No rows')) {
        console.error('❌ Erro ao verificar perfil:', error);
        setStatus('missing');
        return;
      }

      if (!profile) {
        setStatus('missing');
      } else if (profile.approval_status === 'approved') {
        setStatus('done');
        setTimeout(onProfileCreated, 500);
      } else {
        setStatus('missing');
      }
    } catch (error) {
      console.error('❌ Erro na verificação do perfil:', error);
      setStatus('missing');
    }
  };

  const createProfile = async () => {
    if (authError || !user) {
      toast.error('❌ Erro de autenticação. Recarregue a página.');
      return;
    }

    if (!selectedFilial) {
      toast.error('❌ Selecione uma filial para continuar.');
      return;
    }

    try {
      setIsCreating(true);
      setStatus('creating');

      const { error } = await supabase.rpc('create_secure_profile', {
        user_id_param: user.id,
        name_param: user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário',
        email_param: user.email || '',
        role_param: 'consultant',
        filial_id_param: selectedFilial
      });

      if (error) {
        throw error;
      }

      setStatus('done');
      toast.success('✅ Perfil criado! Aguardando aprovação do administrador.');
      
      setTimeout(() => {
        onProfileCreated();
      }, 1000);

    } catch (error: any) {
      console.error('❌ Erro ao criar perfil:', error);
      toast.error(`❌ Erro ao criar perfil: ${error.message || 'Erro desconhecido'}`);
      setStatus('missing');
    } finally {
      setIsCreating(false);
    }
  };

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-4" />
            <CardTitle>Erro de Autenticação</CardTitle>
            <CardDescription>
              Não foi possível acessar o contexto de autenticação. Recarregando...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (status === 'checking' || loadingFiliais) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <CardTitle>Verificando Perfil</CardTitle>
            <CardDescription>
              Aguarde enquanto verificamos suas informações...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-4" />
            <CardTitle>Perfil Pronto!</CardTitle>
            <CardDescription>
              Redirecionando para o dashboard...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-4" />
          <CardTitle>Configuração Necessária</CardTitle>
          <CardDescription>
            Precisamos criar seu perfil para continuar
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-muted-foreground">
            <p><strong>Email:</strong> {user?.email}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="filial">Selecione sua Filial *</Label>
            <Select value={selectedFilial} onValueChange={setSelectedFilial}>
              <SelectTrigger id="filial">
                <SelectValue placeholder="Escolha uma filial" />
              </SelectTrigger>
              <SelectContent>
                {filiais.map((filial) => (
                  <SelectItem key={filial.id} value={filial.id}>
                    {filial.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Button 
            onClick={createProfile} 
            disabled={isCreating || !selectedFilial}
            className="w-full"
            size="lg"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Criando Perfil...
              </>
            ) : (
              <>
                <User className="mr-2 h-4 w-4" />
                Criar Perfil Agora
              </>
            )}
          </Button>

          <div className="text-xs text-center text-muted-foreground">
            <p>• Role: Consultor (padrão)</p>
            <p>• Status: Aguardando aprovação</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};