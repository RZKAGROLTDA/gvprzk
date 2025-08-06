import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { User, Building2 } from 'lucide-react';

interface Filial {
  id: string;
  nome: string;
}

const ProfileSetup: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [filiais, setFiliais] = useState<Filial[]>([]);
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 bg-primary/10 rounded-full w-fit">
            <User className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Complete seu Perfil</CardTitle>
          <p className="text-muted-foreground">
            Para acessar o sistema, precisamos de algumas informações sobre você
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Completo *</Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Digite seu nome completo"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="Digite seu email"
                required
                disabled
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Cargo *</Label>
              <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione seu cargo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultant">Consultor</SelectItem>
                  <SelectItem value="manager">Gerente</SelectItem>
                  <SelectItem value="coordinator">Coordenador</SelectItem>
                  <SelectItem value="analyst">Analista</SelectItem>
                  <SelectItem value="rac">RAC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filial">Filial</Label>
              <Select value={formData.filial_id} onValueChange={(value) => handleInputChange('filial_id', value)}>
                <SelectTrigger>
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

            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading || !formData.name || !formData.role}
            >
              {loading ? 'Salvando...' : 'Confirmar e Continuar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfileSetup;