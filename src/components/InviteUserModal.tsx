import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Copy, Mail, UserPlus, Check, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface InviteUserModalProps {
  children: React.ReactNode;
}

export const InviteUserModal: React.FC<InviteUserModalProps> = ({ children }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const generateInviteLink = async () => {
    if (!email) {
      toast({
        title: "Erro",
        description: "Por favor, digite um email válido",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Generate token
      const { data: tokenData, error: tokenError } = await supabase
        .rpc('generate_invitation_token');

      if (tokenError) throw tokenError;

      const token = tokenData;

      // Save invitation to database
      const { error: inviteError } = await supabase
        .from('user_invitations')
        .insert({
          email,
          token,
          created_by: (await supabase.auth.getUser()).data.user?.id
        });

      if (inviteError) throw inviteError;

      // Generate the full invitation link
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/invite?token=${token}&email=${encodeURIComponent(email)}`;
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
      setLoading(false);
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
    
    window.open(`mailto:${email}?subject=${subject}&body=${body}`);
  };

  const resetForm = () => {
    setEmail('');
    setInviteLink('');
    setCopied(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetForm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Convidar Novo Usuário
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email do usuário</Label>
            <Input
              id="email"
              type="email"
              placeholder="Digite o email do novo usuário"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
            />
          </div>

          {!inviteLink ? (
            <Button 
              onClick={generateInviteLink} 
              disabled={loading || !email}
              className="w-full h-11"
              variant="gradient"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                  Gerando link...
                </div>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Gerar Link de Convite
                </>
              )}
            </Button>
          ) : (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">
                    Link de convite gerado:
                  </Label>
                  <div className="mt-2 p-3 bg-muted rounded-md border-2 border-dashed border-muted-foreground/20">
                    <p className="text-sm font-mono break-all">{inviteLink}</p>
                  </div>
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
                        Copiar
                      </>
                    )}
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={sendByEmail}
                    className="flex-1"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Enviar por Email
                  </Button>
                </div>

                <Button 
                  variant="secondary" 
                  onClick={resetForm}
                  className="w-full"
                >
                  Gerar Novo Convite
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="text-xs text-muted-foreground">
            * O link de convite será válido por 7 dias
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};