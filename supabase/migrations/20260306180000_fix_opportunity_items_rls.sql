-- Fix: política RLS de opportunity_items referenciava tasks_new (tabela legada inexistente).
-- O JOIN falhava silenciosamente, bloqueando TODO acesso à tabela para authenticated users:
-- INSERT retornava erro RLS sem log visível, UPDATE/SELECT retornavam 0 rows.
-- Resultado: opportunity_items sempre vazio, qtd_vendida nunca persistida.

-- Remover política quebrada
DROP POLICY IF EXISTS "Opportunity Items: Access control" ON opportunity_items;

-- Remover outras políticas legadas que possam existir
DROP POLICY IF EXISTS "Users can view opportunity items for accessible tasks" ON opportunity_items;
DROP POLICY IF EXISTS "Users can insert opportunity items for accessible tasks" ON opportunity_items;
DROP POLICY IF EXISTS "Users can update opportunity items for accessible tasks" ON opportunity_items;
DROP POLICY IF EXISTS "Users can delete opportunity items for accessible tasks" ON opportunity_items;

-- Garantir que RLS está habilitado
ALTER TABLE public.opportunity_items ENABLE ROW LEVEL SECURITY;

-- Nova política usando a tabela correta (tasks, não tasks_new)
CREATE POLICY "opportunity_items_access"
ON public.opportunity_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.opportunities o
    JOIN public.tasks t ON t.id = o.task_id
    WHERE o.id = opportunity_items.opportunity_id
      AND (
        t.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.user_id = auth.uid()
            AND p.role IN ('manager', 'admin', 'supervisor')
            AND p.approval_status = 'approved'
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.opportunities o
    JOIN public.tasks t ON t.id = o.task_id
    WHERE o.id = opportunity_items.opportunity_id
      AND (
        t.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.user_id = auth.uid()
            AND p.role IN ('manager', 'admin', 'supervisor')
            AND p.approval_status = 'approved'
        )
      )
  )
);
