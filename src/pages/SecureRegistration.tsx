import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AuthLayout } from '@/components/AuthLayout';
import { User, Eye, EyeOff } from 'lucide-react';
import { useInputSecurity } from '@/hooks/useInputSecurity';
import { usePasswordValidation } from '@/hooks/usePasswordValidation';

const SecureRegistration: React.FC = () => {
  const { toast } = useToast();
  const { sanitizeText, validateEmail } = useInputSecurity();
  const { validatePassword: validatePasswordSecurity, getPasswordErrorMessage } = usePasswordValidation();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Enhanced validation
      if (!sanitizeText(formData.name).trim()) {
        throw new Error('Nome é obrigatório');
      }
      
      if (!validateEmail(formData.email)) {
        throw new Error('Por favor, insira um email válido');
      }
      
      const passwordValidation = validatePasswordSecurity(formData.password);
      if (!passwordValidation.isValid) {
        throw new Error(getPasswordErrorMessage(passwordValidation) || 'Senha inválida');
      }

      // Criar usuário no Supabase Auth (perfil será criado no segundo passo com filial)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            name: formData.name
          }
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        toast({
          title: "Conta criada com sucesso!",
          description: "Agora selecione sua filial para completar o cadastro.",
        });

        // Redirecionar para home onde o ProfileAutoCreator irá solicitar a filial
        window.location.href = '/';
      }
    } catch (error: any) {
      console.error('Erro no cadastro:', error);
      toast({
        title: "Erro no cadastro",
        description: error.message || "Erro interno. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <AuthLayout>
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
        <div className="w-full max-w-lg">
          <Card className="shadow-2xl border-0 bg-card/95 backdrop-blur-sm">
            <CardHeader className="text-center pb-8 pt-10">
              <div className="mx-auto mb-6 p-4 bg-gradient-to-br from-primary to-primary/80 rounded-full w-fit shadow-lg">
                <User className="h-10 w-10 text-primary-foreground" />
              </div>
              <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Cadastro de Novo Usuário
              </CardTitle>
              <p className="text-muted-foreground mt-3 text-lg">
                Preencha os dados para solicitar acesso ao sistema
              </p>
            </CardHeader>
            
            <CardContent className="px-8 pb-10">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-semibold">Nome Completo *</Label>
                  <Input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="Digite seu nome completo"
                    required
                    className="h-12 border-2 focus:border-primary transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-semibold">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="Digite seu email profissional"
                    required
                    className="h-12 border-2 focus:border-primary transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-semibold">Senha *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      placeholder="Mínimo 6 caracteres, 1 maiúscula e 1 número"
                      required
                      className="h-12 border-2 focus:border-primary transition-colors pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                   <div className="text-xs text-muted-foreground mt-1">
                    {formData.password && (
                      <div className="flex gap-2 flex-wrap">
                        <span className={validatePasswordSecurity(formData.password).isValid ? 'text-green-600' : 'text-red-500'}>
                          {validatePasswordSecurity(formData.password).isValid ? '✓ Senha válida' : '✗ Senha inválida'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4">
                  <Button 
                    type="submit" 
                    className="w-full h-12 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]" 
                    disabled={loading || !formData.name || !formData.email || !formData.password}
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground"></div>
                        Cadastrando...
                      </div>
                    ) : (
                      'Continuar'
                    )}
                  </Button>
                </div>
              </form>

              <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground text-center">
                  Na próxima etapa você selecionará sua filial. 
                  Após o cadastro, aguarde a aprovação do administrador.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthLayout>
  );
};

export default SecureRegistration;