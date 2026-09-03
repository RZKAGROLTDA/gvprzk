
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type LinkState = 'checking' | 'valid' | 'invalid';

export const ResetPassword: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [linkState, setLinkState] = useState<LinkState>('checking');
  const [linkError, setLinkError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const finish = (ok: boolean, message?: string) => {
      if (!active) return;
      setLinkState(ok ? 'valid' : 'invalid');
      setLinkError(message ?? null);
    };

    (async () => {
      try {
        const url = new URL(window.location.href);
        const query = url.searchParams;
        const hash = new URLSearchParams(url.hash.replace(/^#/, ''));

        const errorDescription =
          hash.get('error_description') || query.get('error_description');
        if (errorDescription) {
          finish(false, decodeURIComponent(errorDescription));
          return;
        }

        // 1) Fluxo implícito: tokens vêm no hash (#access_token=...&refresh_token=...)
        const access_token = hash.get('access_token') || query.get('access_token');
        const refresh_token = hash.get('refresh_token') || query.get('refresh_token');
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          finish(!error, error?.message);
          return;
        }

        // 2) Fluxo PKCE: ?code=...
        const code = query.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          finish(!error, error?.message);
          return;
        }

        // 3) Link com token_hash (verificação server-side no cliente)
        const token_hash = query.get('token_hash') || hash.get('token_hash');
        if (token_hash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'recovery' });
          finish(!error, error?.message);
          return;
        }

        // 4) Sessão de recuperação já estabelecida pelo listener do supabase-js
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          finish(true);
          return;
        }

        finish(
          false,
          'Link de recuperação inválido ou expirado. Solicite um novo e-mail de recuperação.'
        );
      } catch (error) {
        finish(false, error instanceof Error ? error.message : 'Falha ao validar o link.');
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Erro",
        description: "A senha deve ter pelo menos 6 caracteres",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: password
    });

    if (error) {
      toast({
        title: "Erro ao alterar senha",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Senha alterada com sucesso!",
        description: "Você será redirecionado para o login",
      });

      setTimeout(() => {
        navigate('/');
      }, 2000);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Nova Senha</CardTitle>
        </CardHeader>
        <CardContent>
          {linkState === 'checking' && (
            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validando link de recuperação...
            </div>
          )}

          {linkState === 'invalid' && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-destructive">
                {linkError || 'Link de recuperação inválido ou expirado.'}
              </p>
              <p className="text-sm text-muted-foreground">
                Volte para a tela de login e solicite um novo e-mail em "Esqueci minha senha".
                O link é válido por tempo limitado e só pode ser usado uma vez.
              </p>
              <Button className="w-full" onClick={() => navigate('/')}>
                Voltar para o login
              </Button>
            </div>
          )}

          {linkState === 'valid' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nova Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua nova senha"
                  required
                  minLength={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirme sua nova senha"
                  required
                  minLength={6}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Alterar Senha
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
