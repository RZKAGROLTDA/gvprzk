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
    email: user?.email || '',
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
    if (!inviteEmail) {
      toast({
        title: "Erro",
        description: "Por favor, digite um email válido",
        variant: "destructive",
      });
      return;
    }

    setInviteLoading(true);
    try {
      const { data: tokenData, error: tokenError } = await supabase
        .rpc('generate_invitation_token');

      if (tokenError) throw tokenError;

      const token = tokenData;

      const { error: inviteError } = await supabase
        .from('user_invitations')
        .insert({
          email: inviteEmail,
          token,
          created_by: user?.id
        });

      if (inviteError) throw inviteError;

      const baseUrl = window.location.origin;
      const link = `${baseUrl}/invite?token=${token}&email=${encodeURIComponent(inviteEmail)}`;
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
                    <div className="space-y-2">
                      <Label htmlFor="inviteEmail" className="text-sm font-semibold">
                        Email do novo usuário
                      </Label>
                      <Input
                        id="inviteEmail"
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="Digite o email do novo usuário"
                        className="h-12 border-2 focus:border-primary transition-colors"
                      />
                    </div>

                    {!inviteLink ? (
                      <Button 
                        onClick={generateInviteLink}
                        disabled={inviteLoading || !inviteEmail}
                        className="w-full h-12"
                        variant="outline"
                      >
                        {inviteLoading ? (
                          <div className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                            Gerando link...
                          </div>
                        ) : (
                          <>
                            <LinkIcon className="h-4 w-4 mr-2" />
                            Gerar Link de Convite
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="space-y-4">
                        <div className="p-4 bg-muted rounded-lg border-2 border-dashed border-muted-foreground/20">
                          <Label className="text-sm font-medium text-muted-foreground block mb-2">
                            Link gerado:
                          </Label>
                          <p className="text-sm font-mono break-all bg-background p-2 rounded border">
                            {inviteLink}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={copyToClipboard}
                            className="flex-1"
                          >
                            {copied ? (
                              <>
                                <Check className="h-4 w-4 mr-2" />
                                Copiado!
                              </>
                            ) : (
                              <>
                                <Copy className="h-4 w-4 mr-2" />
                                Copiar Link
                              </>
                            )}
                          </Button>
                          
                          <Button
                            variant="outline"
                            onClick={sendByEmail}
                            className="flex-1"
                          >
                            <Mail className="h-4 w-4 mr-2" />
                            Enviar Email
                          </Button>
                        </div>

                        <Button 
                          variant="ghost" 
                          onClick={() => {
                            setInviteLink('');
                            setInviteEmail('');
                            setCopied(false);
                          }}
                          className="w-full"
                        >
                          Gerar Novo Convite
                        </Button>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground text-center">
                      * O link de convite será válido por 7 dias
                    </div>
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