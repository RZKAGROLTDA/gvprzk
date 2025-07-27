import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Users as UsersIcon, Shield, Building } from 'lucide-react';

interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  filial_id: string | null;
  filial_nome?: string;
}

interface Filial {
  id: string;
  nome: string;
}

export const Users: React.FC = () => {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Carregar usuários
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id,
          name,
          email,
          role,
          filial_id,
          filiais:filial_id (
            nome
          )
        `);

      if (profilesError) throw profilesError;

      // Carregar filiais
      const { data: filiaisData, error: filiaisError } = await supabase
        .from('filiais')
        .select('*')
        .order('nome');

      if (filiaisError) throw filiaisError;

      setProfiles(profilesData?.map(p => ({
        ...p,
        filial_nome: (p.filiais as any)?.nome
      })) || []);
      setFiliais(filiaisData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      toast.success('Permissão atualizada com sucesso');
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar permissão:', error);
      toast.error('Erro ao atualizar permissão');
    }
  };

  const updateUserFilial = async (userId: string, filialId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ filial_id: filialId })
        .eq('id', userId);

      if (error) throw error;

      toast.success('Filial atualizada com sucesso');
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar filial:', error);
      toast.error('Erro ao atualizar filial');
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'manager':
        return 'default';
      case 'rac':
        return 'secondary';
      case 'consultant':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'manager':
        return 'Administrador';
      case 'rac':
        return 'RAC';
      case 'consultant':
        return 'Consultor';
      default:
        return role;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <UsersIcon className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Gerenciar Usuários</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Controle de Permissões e Filiais
          </CardTitle>
          <CardDescription>
            Gerencie as permissões e filiais dos usuários do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Permissão</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell className="font-medium">{profile.name}</TableCell>
                  <TableCell>{profile.email}</TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(profile.role)}>
                      {getRoleLabel(profile.role)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {profile.filial_nome ? (
                      <div className="flex items-center gap-1">
                        <Building className="h-4 w-4" />
                        {profile.filial_nome}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Sem filial</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Select
                        value={profile.role}
                        onValueChange={(value) => updateUserRole(profile.id, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manager">Admin</SelectItem>
                          <SelectItem value="rac">RAC</SelectItem>
                          <SelectItem value="consultant">Consultor</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={profile.filial_id || ""}
                        onValueChange={(value) => updateUserFilial(profile.id, value)}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Selecionar filial" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Sem filial</SelectItem>
                          {filiais.map((filial) => (
                            <SelectItem key={filial.id} value={filial.id}>
                              {filial.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};