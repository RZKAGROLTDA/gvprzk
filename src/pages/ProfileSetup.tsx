import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { User, Building2, Copy, Check, Mail, Link as LinkIcon } from 'lucide-react';

interface Filial {
  id: string;
  nome: string;
}

const ProfileSetup: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin } = useProfile();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: '',
    filial_id: ''
  });

  useEffect(() => {
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
        toast({
          title: "Erro",
          description: "Erro ao carregar filiais",
          variant: "destructive",
        });
      }
    };

    loadFiliais();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          name: formData.name,
          email: formData.email,
          role: formData.role,
          filial_id: formData.filial_id === 'none' ? null : formData.filial_id || null
        });

      if (error) throw error;

      toast({
        title: "Sucesso!",
        description: "Perfil configurado com sucesso!",
      });

      // Recarregar a página para que o usuário seja redirecionado
      window.location.reload();
    } catch (error) {
      console.error('Erro ao salvar perfil:', error);
      toast({
        title: "Erro",
        description: "Erro ao salvar perfil. Tente novamente.",
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

  const generateInviteLink = async () => {
    setInviteLoading(true);
    try {
      const { data: tokenData, error: tokenError } = await supabase
        .rpc('generate_invitation_token');

      if (tokenError) throw tokenError;

      const token = tokenData;

      const { error: inviteError } = await supabase
        .from('user_invitations')
        .insert({
          email: 'convite@sistema.com', // Email genérico para convites
          token,
          created_by: user?.id
        });

      if (inviteError) throw inviteError;

      const baseUrl = window.location.origin;
      const link = `${baseUrl}/invite?token=${token}`;
      setInviteLink(link);

      toast({
        title: "Sucesso!",
        description: "Link de convite gerado com sucesso",
      });
    } catch (error) {
      console.error('Erro ao gerar convite:', error);
      toast({
        title: "Erro",
        description: "Erro ao gerar link de convite. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setInviteLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast({
        title: "Copiado!",
        description: "Link copiado para a área de transferência",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível copiar o link",
        variant: "destructive",
      });
    }
  };

  const sendByEmail = () => {
    const subject = encodeURIComponent('Convite para acessar o Sistema de Gestão de Visitas');
    const body = encodeURIComponent(`Olá!

Você foi convidado(a) para acessar o Sistema de Gestão de Visitas.

Clique no link abaixo para criar sua conta:
${inviteLink}

Este link é válido por 7 dias.

Atenciosamente,
Equipe de Gestão`);
    
    window.open(`mailto:${inviteEmail}?subject=${subject}&body=${body}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/10 p-4">
      <div className="w-full max-w-lg">
        <Card className="shadow-2xl border-0 bg-card/95 backdrop-blur-sm">
          <CardHeader className="text-center pb-8 pt-10">
            <div className="mx-auto mb-6 p-4 bg-gradient-to-br from-primary to-primary/80 rounded-full w-fit shadow-lg">
              <User className="h-10 w-10 text-primary-foreground" />
            </div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Complete seu Perfil
            </CardTitle>
            <p className="text-muted-foreground mt-3 text-lg">
              Para acessar o sistema, precisamos de algumas informações sobre você
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
                  placeholder="Digite seu email"
                  required
                  className="h-12 border-2 focus:border-primary transition-colors"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role" className="text-sm font-semibold">Cargo *</Label>
                <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value)}>
                  <SelectTrigger className="h-12 border-2 focus:border-primary transition-colors">
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
                  <SelectTrigger className="h-12 border-2 focus:border-primary transition-colors">
                    <SelectValue placeholder="Selecione sua filial" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma filial específica</SelectItem>
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

              <div className="pt-4">
                <Button 
                  type="submit" 
                  className="w-full h-12 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]" 
                  variant="gradient"
                  disabled={loading || !formData.name || !formData.email || !formData.role}
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground"></div>
                      Salvando...
                    </div>
                  ) : (
                    'Confirmar e Continuar'
                  )}
                </Button>
              </div>
            </form>

            {/* Seção para Administradores gerarem links de convite */}
            {isAdmin && (
              <>
                <Separator className="my-8" />
                <div className="space-y-6">
                  <div className="text-center">
                    <h3 className="text-xl font-semibold mb-2">Convidar Novo Usuário</h3>
                    <p className="text-muted-foreground">
                      Gere um link de convite para que novos usuários possam se cadastrar
                    </p>
                  </div>

                <div className="space-y-4">
                  <Button 
                    onClick={() => {
                      const baseUrl = window.location.origin;
                      const signupLink = `${baseUrl}/profile-setup`;
                      navigator.clipboard.writeText(signupLink);
                      setCopied(true);
                      toast({
                        title: "Link copiado!",
                        description: "Link de cadastro copiado para a área de transferência",
                      });
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="w-full h-12"
                    variant="outline"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Link Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copiar Link de Cadastro
                      </>
                    )}
                  </Button>

                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProfileSetup;