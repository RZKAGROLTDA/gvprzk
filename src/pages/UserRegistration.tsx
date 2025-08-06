import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { User, Building2, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '@/components/AuthLayout';

interface Filial {
  id: string;
  nome: string;
}

const UserRegistration: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: '',
    filial_id: ''
  });

  const [passwordValidation, setPasswordValidation] = useState({
    hasUppercase: false,
    hasNumber: false,
    minLength: false
  });

  React.useEffect(() => {
    const loadFiliais = async () => {
      try {
        const { data, error } = await supabase
          .from('filiais')
          .select('id, nome')
          .order('nome');
        
        if (error) throw error;
        setFiliais(data || []);
      } catch (error) {
        console.error('Erro ao carregar filiais:', error);
      }
    };

    // Check if coming from invite link
    const token = searchParams.get('token');
    const email = searchParams.get('email');
    
    if (token && email) {
      setInviteToken(token);
      setFormData(prev => ({ ...prev, email }));
    }

    loadFiliais();
  }, [searchParams]);

  const validatePassword = (password: string) => {
    const validation = {
      hasUppercase: /[A-Z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      minLength: password.length >= 8
    };
    setPasswordValidation(validation);
    return validation.hasUppercase && validation.hasNumber && validation.minLength;
  };

  const handlePasswordChange = (password: string) => {
    setFormData(prev => ({ ...prev, password }));
    validatePassword(password);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validatePassword(formData.password)) {
      toast({
        title: "Senha inválida",
        description: "A senha deve conter pelo menos 8 caracteres, um número e uma letra maiúscula",
        variant: "destructive",
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Senhas não coincidem",
        description: "Por favor, confirme sua senha corretamente",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Create user account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            name: formData.name,
            role: formData.role
          }
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        // Create profile with pending status
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            user_id: authData.user.id,
            name: formData.name,
            email: formData.email,
            role: formData.role,
            filial_id: formData.filial_id || null,
            approval_status: 'pending'
          });

        if (profileError) throw profileError;

        // If this was from an invite, mark it as used
        if (inviteToken) {
          await supabase
            .from('user_invitations')
            .update({ 
              status: 'used',
              used_at: new Date().toISOString()
            })
            .eq('token', inviteToken);
        }

        toast({
          title: "Cadastro realizado com sucesso!",
          description: "Seu cadastro foi enviado para aprovação. Você receberá um email quando for aprovado.",
        });

        // Sign out the user immediately since they need approval
        await supabase.auth.signOut();
        
        // Redirect to a success page or login
        navigate('/registration-success');
      }
    } catch (error: any) {
      console.error('Erro no cadastro:', error);
      toast({
        title: "Erro no cadastro",
        description: error.message || "Erro ao criar conta. Tente novamente.",
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
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)] p-4">
        <div className="w-full max-w-lg">
          <Card className="shadow-2xl border-0 bg-card/95 backdrop-blur-sm">
            <CardHeader className="text-center pb-6">
              <div className="mx-auto mb-4 p-4 bg-gradient-to-br from-primary to-primary/80 rounded-full w-fit shadow-lg">
                <User className="h-8 w-8 text-primary-foreground" />
              </div>
              <CardTitle className="text-2xl font-bold">
                {inviteToken ? 'Complete seu Cadastro' : 'Criar Nova Conta'}
              </CardTitle>
              <p className="text-muted-foreground">
                {inviteToken 
                  ? 'Você foi convidado! Complete seus dados para acessar o sistema' 
                  : 'Preencha seus dados para solicitar acesso ao sistema'
                }
              </p>
            </CardHeader>
          <CardContent className="px-6 pb-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-semibold">Nome Completo *</Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Digite seu nome completo"
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="Digite seu email"
                  required
                  disabled={!!inviteToken}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold">Senha *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    placeholder="Digite sua senha"
                    required
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                
                {formData.password && (
                  <div className="space-y-1 text-sm">
                    <div className={`flex items-center gap-2 ${passwordValidation.minLength ? 'text-green-600' : 'text-red-600'}`}>
                      {passwordValidation.minLength ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      Mínimo 8 caracteres
                    </div>
                    <div className={`flex items-center gap-2 ${passwordValidation.hasUppercase ? 'text-green-600' : 'text-red-600'}`}>
                      {passwordValidation.hasUppercase ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      Uma letra maiúscula
                    </div>
                    <div className={`flex items-center gap-2 ${passwordValidation.hasNumber ? 'text-green-600' : 'text-red-600'}`}>
                      {passwordValidation.hasNumber ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      Um número
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-semibold">Confirmar Senha *</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    placeholder="Confirme sua senha"
                    required
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role" className="text-sm font-semibold">Cargo *</Label>
                <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Selecione seu cargo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Gerente</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="sales_consultant">Consultor de Vendas</SelectItem>
                    <SelectItem value="rac">RAC</SelectItem>
                    <SelectItem value="technical_consultant">Consultor Técnico</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="filial" className="text-sm font-semibold">Filial</Label>
                <Select value={formData.filial_id} onValueChange={(value) => handleInputChange('filial_id', value)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Selecione sua filial" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhuma filial específica</SelectItem>
                    {filiais.map(filial => (
                      <SelectItem key={filial.id} value={filial.id}>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          {filial.nome}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Alert>
                <AlertDescription>
                  Após o cadastro, sua solicitação será enviada para aprovação. Você receberá um email quando for aprovado pelo gestor.
                </AlertDescription>
              </Alert>

              <Button 
                type="submit" 
                className="w-full h-12 text-lg font-semibold" 
                variant="gradient"
                disabled={loading || !formData.name || !formData.email || !formData.password || !formData.role || !validatePassword(formData.password)}
              >
                {loading ? 'Criando conta...' : 'Criar Conta'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
    </AuthLayout>
  );
};

export default UserRegistration;