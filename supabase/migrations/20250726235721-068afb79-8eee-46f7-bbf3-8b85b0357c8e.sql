-- Criar tabela de filiais
CREATE TABLE public.filiais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS para filiais
ALTER TABLE public.filiais ENABLE ROW LEVEL SECURITY;

-- Adicionar coluna filial_id na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN filial_id UUID REFERENCES public.filiais(id);

-- Criar função para verificar se usuário é admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Criar função para obter filial do usuário atual
CREATE OR REPLACE FUNCTION public.get_user_filial_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT filial_id FROM public.profiles 
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Políticas RLS para filiais
CREATE POLICY "Admins podem gerenciar todas as filiais" 
ON public.filiais 
FOR ALL 
USING (public.is_admin());

CREATE POLICY "Usuários podem ver sua própria filial" 
ON public.filiais 
FOR SELECT 
USING (id = public.get_user_filial_id());

-- Atualizar políticas da tabela profiles para admins poderem gerenciar
CREATE POLICY "Admins podem gerenciar todos os perfis" 
ON public.profiles 
FOR ALL 
USING (public.is_admin());

-- Atualizar políticas da tabela tasks para filtrar por filial
DROP POLICY IF EXISTS "Users can view all tasks" ON public.tasks;
CREATE POLICY "Users can view tasks from their filial" 
ON public.tasks 
FOR SELECT 
USING (
  public.is_admin() OR 
  EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2 
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = tasks.created_by 
    AND p1.filial_id = p2.filial_id
  )
);

-- Trigger para updated_at nas filiais
CREATE TRIGGER update_filiais_updated_at
  BEFORE UPDATE ON public.filiais
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();