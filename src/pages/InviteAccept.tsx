import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UserPlus, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const InviteAccept: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  useEffect(() => {
    const validateInvitation = async () => {
      if (!token || !email) {
        setError('Link de convite inválido. Token ou email ausente.');
        setLoading(false);
        return;
      }

      try {
        // Check if invitation exists and is valid
        const { data, error } = await supabase
          .from('user_invitations')
          .select('*')
          .eq('token', token)
          .eq('email', email)
          .single();

        if (error) {
          setError('Convite não encontrado ou inválido.');
          setLoading(false);
          return;
        }

        // Check if invitation is still valid
        const now = new Date();
        const expiresAt = new Date(data.expires_at);
        
        if (now > expiresAt) {
          setError('Este convite expirou. Solicite um novo convite.');
          setLoading(false);
          return;
        }

        if (data.status !== 'pending') {
          setError('Este convite já foi utilizado.');
          setLoading(false);
          return;
        }

        setInvitation(data);
      } catch (error) {
        console.error('Erro ao validar convite:', error);
        setError('Erro ao validar convite. Tente novamente.');
      } finally {
        setLoading(false);
      }
    };

    validateInvitation();
  }, [token, email]);

  const handleSignUp = async () => {
    if (!invitation) return;

    try {
      // For now, we'll redirect to a simplified sign up flow
      toast({
        title: "Redirecionando...",
        description: "Você será redirecionado para criar sua conta",
      });

      // Since we can't access supabaseUrl directly, we'll use the auth signUp method
      // and handle the redirect in the ProfileSetup component
      const baseUrl = window.location.origin;
      const redirectUrl = `${baseUrl}/profile-setup?token=${token}`;
      
      // For now, redirect to the sign up page with instructions
      navigate('/auth/signup', { 
        state: { 
          email, 
          token,
          redirectUrl 
        } 
      });
      
    } catch (error) {
      console.error('Erro ao processar convite:', error);
      toast({
        title: "Erro",
        description: "Erro ao processar convite. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/10 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-16">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground">Validando convite...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/10 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 bg-destructive/10 rounded-full w-fit">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Convite Inválido</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button 
              onClick={() => navigate('/')} 
              className="w-full mt-4"
              variant="outline"
            >
              Voltar ao Início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center pb-8">
          <div className="mx-auto mb-4 p-4 bg-gradient-to-br from-success to-success/80 rounded-full w-fit shadow-lg">
            <UserPlus className="h-8 w-8 text-success-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Convite Aceito!</CardTitle>
          <p className="text-muted-foreground">
            Você foi convidado para acessar o Sistema de Gestão de Visitas
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">Email:</p>
            <p className="font-medium">{invitation?.email}</p>
          </div>

          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Clique no botão abaixo para criar sua conta e começar a usar o sistema.
            </AlertDescription>
          </Alert>

          <Button 
            onClick={handleSignUp}
            className="w-full h-12 text-lg font-semibold"
            variant="gradient"
          >
            <UserPlus className="h-5 w-5 mr-2" />
            Criar Minha Conta
          </Button>

          <div className="text-xs text-muted-foreground text-center">
            Após criar sua conta, você precisará completar seu perfil
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InviteAccept;