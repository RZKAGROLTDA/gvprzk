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
  approval_status: 'pending' | 'approved' | 'rejected';
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
          approval_status,
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
      const filialToUpdate = filialId === 'none' ? null : filialId;
      const { error } = await supabase
        .from('profiles')
        .update({ filial_id: filialToUpdate })
        .eq('id', userId);

      if (error) throw error;

      toast.success('Filial atualizada com sucesso');
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar filial:', error);
      toast.error('Erro ao atualizar filial');
    }
  };

  const updateUserApproval = async (userId: string, status: 'approved' | 'rejected') => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ approval_status: status })
        .eq('id', userId);

      if (error) throw error;

      toast.success(`Usuário ${status === 'approved' ? 'aprovado' : 'rejeitado'} com sucesso`);
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar aprovação:', error);
      toast.error('Erro ao atualizar aprovação');
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

  const getApprovalBadgeVariant = (status: string) => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'pending':
        return 'secondary';
      case 'rejected':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getApprovalLabel = (status: string) => {
    switch (status) {
      case 'approved':
        return 'Aprovado';
      case 'pending':
        return 'Pendente';
      case 'rejected':
        return 'Rejeitado';
      default:
        return status;
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
                <TableHead>Status</TableHead>
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
                    <Badge variant={getApprovalBadgeVariant(profile.approval_status) as any}>
                      {getApprovalLabel(profile.approval_status)}
                    </Badge>
                  </TableCell>
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
                      {profile.approval_status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateUserApproval(profile.id, 'approved')}
                            className="text-green-600 hover:text-green-700"
                          >
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateUserApproval(profile.id, 'rejected')}
                            className="text-red-600 hover:text-red-700"
                          >
                            Rejeitar
                          </Button>
                        </>
                      )}
                      
                      {profile.approval_status === 'approved' && (
                        <>
                          <Select
                            value={profile.role}
                            onValueChange={(value) => updateUserRole(profile.id, value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="manager">Admin</SelectItem>
                              <SelectItem value="supervisor">Supervisor</SelectItem>
                              <SelectItem value="sales_consultant">Consultor de Vendas</SelectItem>
                              <SelectItem value="rac">RAC</SelectItem>
                              <SelectItem value="technical_consultant">Consultor Técnico</SelectItem>
                            </SelectContent>
                          </Select>

                          <Select
                            value={profile.filial_id || "none"}
                            onValueChange={(value) => updateUserFilial(profile.id, value)}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue placeholder="Selecionar filial" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem filial</SelectItem>
                              {filiais.map((filial) => (
                                <SelectItem key={filial.id} value={filial.id}>
                                  {filial.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      )}
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