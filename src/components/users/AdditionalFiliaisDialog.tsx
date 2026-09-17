import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Building } from 'lucide-react';
import { toast } from 'sonner';
import { useUserAdditionalFiliais } from '@/hooks/useUserAdditionalFiliais';

interface Filial {
  id: string;
  nome: string;
}

interface AdditionalFiliaisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  /** Filial principal do cadastro (somente leitura aqui). */
  primaryFilialId: string | null;
  primaryFilialNome: string | null;
  filiais: Filial[];
}

/**
 * M3 — Janela de gestão das Filiais Adicionais de um usuário.
 *
 * - A filial principal é exibida somente leitura e NUNCA aparece como
 *   opção marcável.
 * - Salva exclusivamente via `set_user_filiais` (banco valida autorização,
 *   descarta a principal da lista efetiva, desativa vínculos retirados e
 *   registra auditoria).
 * - 0, 1 ou mais adicionais; nada é concedido automaticamente.
 */
export const AdditionalFiliaisDialog: React.FC<AdditionalFiliaisDialogProps> = ({
  open,
  onOpenChange,
  userId,
  userName,
  primaryFilialId,
  primaryFilialNome,
  filiais,
}) => {
  const { additionalFilialIds, isLoading, isSaving, save, error } =
    useUserAdditionalFiliais(open ? userId : null);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setSelected(new Set(additionalFilialIds));
  }, [open, additionalFilialIds]);

  // A principal nunca é oferecida como adicional selecionável.
  const selectable = useMemo(
    () => filiais.filter((f) => f.id !== primaryFilialId),
    [filiais, primaryFilialId],
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    try {
      // Segunda camada: garante que a principal não seja enviada.
      const ids = [...selected].filter((id) => id !== primaryFilialId);
      await save(ids);
      toast.success('Filiais adicionais atualizadas com sucesso!');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar filiais adicionais');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Filiais Adicionais — {userName}</DialogTitle>
          <DialogDescription>
            Selecione manualmente as filiais adicionais deste usuário. Nenhum acesso é
            concedido automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md border border-border p-3">
            <Building className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {primaryFilialNome || 'Sem filial principal'}
              </p>
              <p className="text-xs text-muted-foreground">Filial Principal (cadastro)</p>
            </div>
            <Badge variant="secondary">Principal</Badge>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando filiais adicionais…</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-border p-3">
              {selectable.map((f) => {
                const checked = selected.has(f.id);
                return (
                  <label
                    key={f.id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(f.id)}
                      aria-label={f.nome}
                    />
                    <span className="flex-1">{f.nome}</span>
                    {checked && <Badge variant="outline">Ativa</Badge>}
                  </label>
                );
              })}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">
            {selected.size === 0
              ? 'Nenhuma filial adicional selecionada — o usuário permanece somente com a filial principal.'
              : `${selected.size} filial(is) adicional(is) selecionada(s).`}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
