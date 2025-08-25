import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Building, Plus, Pencil, Trash2, Users } from 'lucide-react';

interface Filial {
  id: string;
  nome: string;
  created_at: string;
  user_count?: number;
}

export const Filiais: React.FC = () => {
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFilial, setEditingFilial] = useState<Filial | null>(null);
  const [nomeFilial, setNomeFilial] = useState('');

  useEffect(() => {
    loadFiliais();
  }, []);

  const loadFiliais = async () => {
    try {
      // Load filiais with user count
      const { data: filiaisData, error: filiaisError } = await supabase
        .from('filiais')
        .select('*')
        .order('nome');

      if (filiaisError) throw filiaisError;

      // Load user counts for each filial
      if (filiaisData) {
        const filiaisWithCounts = await Promise.all(
          filiaisData.map(async (filial) => {
            const { count, error: countError } = await supabase
              .from('profiles')
              .select('*', { count: 'exact', head: true })
              .eq('filial_id', filial.id)
              .eq('approval_status', 'approved');

            if (countError) {
              console.error('Erro ao contar usuários da filial:', countError);
              return { ...filial, user_count: 0 };
            }

            return { ...filial, user_count: count || 0 };
          })
        );

        setFiliais(filiaisWithCounts);
      }
    } catch (error) {
      console.error('Erro ao carregar filiais:', error);
      toast.error('Erro ao carregar filiais');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nomeFilial.trim()) {
      toast.error('Nome da filial é obrigatório');
      return;
    }

    try {
      if (editingFilial) {
        const { error } = await supabase
          .from('filiais')
          .update({ nome: nomeFilial.trim() })
          .eq('id', editingFilial.id);

        if (error) throw error;
        toast.success('Filial atualizada com sucesso');
      } else {
        const { error } = await supabase
          .from('filiais')
          .insert({ nome: nomeFilial.trim() });

        if (error) throw error;
        toast.success('Filial criada com sucesso');
      }

      setIsDialogOpen(false);
      setEditingFilial(null);
      setNomeFilial('');
      loadFiliais();
    } catch (error) {
      console.error('Erro ao salvar filial:', error);
      toast.error('Erro ao salvar filial');
    }
  };

  const handleEdit = (filial: Filial) => {
    setEditingFilial(filial);
    setNomeFilial(filial.nome);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta filial?')) return;

    try {
      const { error } = await supabase
        .from('filiais')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Filial excluída com sucesso');
      loadFiliais();
    } catch (error) {
      console.error('Erro ao excluir filial:', error);
      toast.error('Erro ao excluir filial');
    }
  };

  const openCreateDialog = () => {
    setEditingFilial(null);
    setNomeFilial('');
    setIsDialogOpen(true);
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Building className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Gerenciar Filiais</h1>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Nova Filial
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingFilial ? 'Editar Filial' : 'Nova Filial'}
              </DialogTitle>
              <DialogDescription>
                {editingFilial ? 'Edite os dados da filial' : 'Adicione uma nova filial ao sistema'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="nome">Nome da Filial</Label>
                <Input
                  id="nome"
                  value={nomeFilial}
                  onChange={(e) => setNomeFilial(e.target.value)}
                  placeholder="Digite o nome da filial"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingFilial ? 'Atualizar' : 'Criar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filiais Cadastradas</CardTitle>
          <CardDescription>
            Gerencie as filiais do sistema e veja a quantidade de usuários cadastrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filiais.length === 0 ? (
            <div className="text-center py-8">
              <Building className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma filial cadastrada</p>
              <p className="text-sm text-muted-foreground">
                Clique em "Nova Filial" para adicionar a primeira filial
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Usuários Cadastrados</TableHead>
                  <TableHead>Data de Criação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filiais.map((filial) => (
                  <TableRow key={filial.id}>
                    <TableCell className="font-medium">{filial.nome}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{filial.user_count || 0}</span>
                        <span className="text-sm text-muted-foreground">usuários</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(filial.created_at).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(filial)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(filial.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
