import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AuthLayout } from '@/components/AuthLayout';
import { Building2, User, Eye, EyeOff } from 'lucide-react';

interface Filial {
  id: string;
  nome: string;
}

const SecureRegistration: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    filial_id: ''
  });

  useEffect(() => {
    const loadFiliais = async () => {
      try {
        console.log('🔍 Carregando filiais...');
        const { data, error } = await supabase
          .from('filiais')
          .select('id, nome')
          .order('nome');
        
        if (error) {
          console.error('❌ Erro ao buscar filiais:', error);
          throw error;
        }
        
        console.log('✅ Filiais carregadas:', data?.length || 0, data);
        setFiliais(data || []);
      } catch (error) {
        console.error('❌ Erro ao carregar filiais:', error);
        toast({
          title: "Erro",
          description: "Erro ao carregar filiais. Verifique sua conexão.",
          variant: "destructive",
        });
        
        // Fallback: Set manual list if database fails
        const fallbackFiliais = [
          { id: 'fallback-1', nome: 'Querência' },
          { id: 'fallback-2', nome: 'Canarana' },
          { id: 'fallback-3', nome: 'Barra do Garças' },
          { id: 'fallback-4', nome: 'Porto Alegre do Norte' },
          { id: 'fallback-5', nome: 'Gaúcha do Norte' },
          { id: 'fallback-6', nome: 'Espigão do Leste' },
          { id: 'fallback-7', nome: 'Água Boa' },
          { id: 'fallback-8', nome: 'Vila Rica' },
          { id: 'fallback-9', nome: 'Mineiros' },
          { id: 'fallback-10', nome: 'Alto Taquari' },
          { id: 'fallback-11', nome: 'Planalto Verde' },
          { id: 'fallback-12', nome: 'Caiapônia' },
          { id: 'fallback-13', nome: 'São Jose do Xingu' },
          { id: 'fallback-14', nome: 'Tele Vendas' }
        ];
        setFiliais(fallbackFiliais);
        console.log('⚠️ Usando lista fallback de filiais');
      }
    };

    loadFiliais();
  }, [toast]);

  const validatePassword = (password: string): boolean => {
    return password.length >= 6 && 
           /[A-Z]/.test(password) && 
           /[0-9]/.test(password);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validações
      if (!formData.name.trim()) {
        throw new Error('Nome é obrigatório');
      }
      
      if (!formData.email.trim()) {
        throw new Error('Email é obrigatório');
      }
      
      if (!validatePassword(formData.password)) {
        throw new Error('Senha deve ter ao menos 6 caracteres, 1 letra maiúscula e 1 número');
      }
      
      if (!formData.filial_id) {
        throw new Error('Filial é obrigatória');
      }

      // Criar usuário no Supabase Auth
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
        // Criar perfil com status pendente
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            user_id: authData.user.id,
            name: formData.name,
            email: formData.email,
            role: 'consultant', // Role padrão
            filial_id: formData.filial_id,
            approval_status: 'pending' // Status pendente
          });

        if (profileError) throw profileError;

        toast({
          title: "Cadastro realizado com sucesso!",
          description: "Aguarde a aprovação do administrador para acessar o sistema.",
        });

        // Redirecionar para página de sucesso
        window.location.href = '/registration-success';
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
                        <span className={validatePassword(formData.password) ? 'text-green-600' : 'text-red-500'}>
                          {validatePassword(formData.password) ? '✓ Senha válida' : '✗ Senha inválida'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="filial" className="text-sm font-semibold">Filial *</Label>
                  <Select value={formData.filial_id} onValueChange={(value) => handleInputChange('filial_id', value)}>
                    <SelectTrigger className="h-12 border-2 focus:border-primary transition-colors bg-background">
                      <SelectValue placeholder="Selecione sua filial" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-[100]">
                      {filiais.length === 0 ? (
                        <SelectItem value="loading" disabled>
                          <div className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                            Carregando filiais...
                          </div>
                        </SelectItem>
                      ) : (
                        filiais.map(filial => (
                          <SelectItem key={filial.id} value={filial.id}>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4" />
                              {filial.nome}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {filiais.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {filiais.length} filiais disponíveis
                    </p>
                  )}
                </div>

                <div className="pt-4">
                  <Button 
                    type="submit" 
                    className="w-full h-12 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]" 
                    disabled={loading || !formData.name || !formData.email || !formData.password || !formData.filial_id}
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground"></div>
                        Cadastrando...
                      </div>
                    ) : (
                      'Solicitar Cadastro'
                    )}
                  </Button>
                </div>
              </form>

              <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground text-center">
                  Após o cadastro, sua solicitação será analisada por um administrador. 
                  Você receberá um email quando sua conta for aprovada.
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