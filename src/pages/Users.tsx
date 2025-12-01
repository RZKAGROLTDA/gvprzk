import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Users as UsersIcon, Shield, Building, Trash2, AlertTriangle } from 'lucide-react';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { useSecureUserDirectory } from '@/hooks/useSecureTaskData';
import { useUserRole } from '@/hooks/useUserRole';

interface Profile {
  id: string;
  user_id: string;
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
  const queryClient = useQueryClient();
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [loading, setLoading] = useState(true);
  
  // SECURITY FIX: Use user_roles table as single source of truth for authorization
  const { isManager, isLoading: isLoadingRole } = useUserRole();
  
  // Use secure user directory with data masking
  const { data: secureUserData, isLoading: isLoadingUsers, error: userError } = useSecureUserDirectory();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Note: User data is now loaded via useSecureUserDirectory hook
      // SECURITY FIX: User role is now loaded via useUserRole hook (user_roles table)

      // Carregar filiais
      const { data: filiaisData, error: filiaisError } = await supabase
        .from('filiais')
        .select('*')
        .order('nome');

      if (filiaisError) throw filiaisError;

      // User profiles are now handled by the secure hook
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
      // Use RPC function for secure role updates with server-side authorization
      const { data, error } = await supabase.rpc('update_user_role_secure', {
        target_user_id: userId,
        new_role: newRole
      });

      if (error) {
        console.error('Erro RPC:', error);
        toast.error('Erro ao atualizar permissão: ' + error.message);
        return;
      }

      // A função retorna JSON, então verificamos o resultado
      if (data && data.error) {
        toast.error(data.error);
        return;
      }

      if (data && data.success) {
        toast.success(data.message || 'Permissão atualizada com sucesso');
        // Invalidate cache to trigger fresh data fetch
        await queryClient.invalidateQueries({ queryKey: ['secure-user-directory'] });
      } else {
        toast.error('Erro inesperado ao atualizar permissão');
      }
    } catch (error: any) {
      console.error('Erro ao atualizar permissão:', error);
      toast.error(error?.message || 'Erro ao atualizar permissão');
    }
  };

  const updateUserFilial = async (userId: string, filialId: string) => {
    try {
      const filialToUpdate = filialId === 'none' ? null : filialId;
      
      // Use RPC function for secure filial updates with server-side authorization
      const { data, error } = await supabase.rpc('update_user_filial_secure', {
        target_user_id: userId,
        new_filial_id: filialToUpdate
      });

      if (error) {
        console.error('Erro na função RPC:', error);
        toast.error('Erro ao atualizar filial');
        return;
      }

      if (data && !data.success) {
        console.error('Erro da função:', data.error);
        toast.error(data.error || 'Erro ao atualizar filial');
        return;
      }

      toast.success('Filial atualizada com sucesso!');
      // Invalidate cache to trigger fresh data fetch
      await queryClient.invalidateQueries({ queryKey: ['secure-user-directory'] });
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
        .eq('user_id', userId);

      if (error) throw error;

      toast.success(`Usuário ${status === 'approved' ? 'aprovado' : 'rejeitado'} com sucesso`);
      // Invalidate cache to trigger fresh data fetch
      await queryClient.invalidateQueries({ queryKey: ['secure-user-directory'] });
    } catch (error) {
      console.error('Erro ao atualizar aprovação:', error);
      toast.error('Erro ao atualizar aprovação');
    }
  };

  const deleteUser = async (userId: string, userName: string) => {
    // Confirmação antes de deletar
    if (!confirm(`Tem certeza que deseja deletar permanentemente o usuário "${userName}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      // Chamar a Edge Function segura para deletar usuário
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { profileId: userId }
      });

      if (error) {
        console.error('Erro ao deletar usuário:', error);
        toast.error(error.message || 'Erro ao deletar usuário');
        return;
      }

      if (data?.error) {
        console.error('Erro na resposta:', data.error);
        toast.error(data.error);
        return;
      }

      toast.success(data?.message || `Usuário "${userName}" deletado com sucesso`);
      // Invalidate cache to trigger fresh data fetch
      await queryClient.invalidateQueries({ queryKey: ['secure-user-directory'] });
    } catch (error) {
      console.error('Erro ao deletar usuário:', error);
      toast.error('Erro ao deletar usuário');
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'manager':
        return 'default';
      case 'supervisor':
        return 'secondary';
      case 'rac':
        return 'secondary';
      case 'consultant':
        return 'outline';
      case 'sales_consultant':
        return 'outline';
      case 'technical_consultant':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'manager':
        return 'Administrador';
      case 'supervisor':
        return 'Supervisor';
      case 'rac':
        return 'RAC';
      case 'consultant':
        return 'Consultor';
      case 'sales_consultant':
        return 'Consultor de Vendas';
      case 'technical_consultant':
        return 'Consultor Técnico';
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

  if (loading || isLoadingUsers) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (userError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Erro de Acesso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>Não foi possível carregar os dados dos usuários. Verifique suas permissões.</p>
          </CardContent>
        </Card>
      </div>
    );
  }


  const profiles = secureUserData || [];
  const pendingUsers = profiles.filter(p => p.approval_status === 'pending');
  const approvedUsers = profiles.filter(p => p.approval_status === 'approved');
  const rejectedUsers = profiles.filter(p => p.approval_status === 'rejected');
  
  // SECURITY FIX: Use isManager from useUserRole hook (user_roles table) instead of profiles.role
  const isAdmin = isManager;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <UsersIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          <h1 className="text-xl sm:text-2xl font-bold">Gerenciar Usuários</h1>
        </div>
        <div className="w-full sm:w-80">
          <OfflineIndicator />
        </div>
      </div>

      {!isAdmin && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-amber-800">Acesso Restrito</h3>
                <p className="text-sm text-amber-700">
                  Você precisa ser manager para gerenciar usuários.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usuários Pendentes de Aprovação */}
      {pendingUsers.length > 0 && isAdmin && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-amber-800 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Usuários Aguardando Aprovação ({pendingUsers.length})
            </CardTitle>
            <CardDescription>
              Novos usuários que se cadastraram no sistema e precisam de aprovação
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUsers.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell className="font-medium">{profile.name}</TableCell>
                    <TableCell>{profile.email}</TableCell>
                    <TableCell>
                      <Badge variant={getApprovalBadgeVariant(profile.approval_status)}>
                        {getApprovalLabel(profile.approval_status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => updateUserApproval(profile.user_id, 'approved')}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => updateUserApproval(profile.user_id, 'rejected')}
                        >
                          Rejeitar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Todos os Usuários Aprovados */}
      {approvedUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-gray-900">
              Usuários Aprovados ({approvedUsers.length})
            </CardTitle>
          </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Permissão</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead>Cargo</TableHead>
                {isManager && <TableHead>Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedUsers.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell className="font-medium">{profile.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={profile.email === '***@***.***' ? 'italic text-muted-foreground' : ''}>
                        {profile.email}
                      </span>
                      {profile.email === '***@***.***' && (
                        <Badge variant="secondary" className="text-xs">
                          Protegido
                        </Badge>
                      )}
                    </div>
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
                       {/* Só permitir alteração de permissão se o usuário atual for administrador */}
                       {isManager ? (
                         <Select
                           value={profile.role}
                           onValueChange={(value) => updateUserRole(profile.user_id, value)}
                         >
                           <SelectTrigger className="w-32">
                             <SelectValue />
                           </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="manager">Gerente</SelectItem>
                              <SelectItem value="supervisor">Supervisor</SelectItem>
                              <SelectItem value="sales_consultant">Consultor de Vendas</SelectItem>
                              <SelectItem value="consultant">Consultor</SelectItem>
                              <SelectItem value="rac">RAC</SelectItem>
                              <SelectItem value="technical_consultant">Consultor Técnico</SelectItem>
                            </SelectContent>
                         </Select>
                       ) : (
                         <Badge variant={getRoleBadgeVariant(profile.role)} className="w-32 justify-center">
                           {getRoleLabel(profile.role)}
                         </Badge>
                       )}

                       {/* Só permitir alteração de filial se o usuário atual for administrador */}
                       {isManager ? (
                         <Select
                           value={profile.filial_id || "none"}
                           onValueChange={(value) => updateUserFilial(profile.user_id, value)}
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
                       ) : (
                         <div className="w-40 flex items-center">
                           {profile.filial_nome ? (
                             <div className="flex items-center gap-1">
                               <Building className="h-4 w-4" />
                               {profile.filial_nome}
                             </div>
                           ) : (
                             <span className="text-muted-foreground">Sem filial</span>
                           )}
                         </div>
                       )}
                      </div>
                   </TableCell>
                   {isManager && (
                     <TableCell>
                       <Button
                         size="sm"
                         variant="outline"
                         onClick={() => deleteUser(profile.id, profile.name)}
                         className="text-red-600 hover:text-red-700 hover:border-red-300"
                       >
                         <Trash2 className="h-4 w-4" />
                       </Button>
                     </TableCell>
                   )}
                 </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}
    </div>
  );
};