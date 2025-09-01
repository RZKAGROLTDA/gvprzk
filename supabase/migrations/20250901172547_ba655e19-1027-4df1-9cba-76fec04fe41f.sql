-- Corrigir questões de segurança restantes identificadas pelo linter

-- Adicionar políticas faltantes para tables sem RLS
CREATE POLICY "Directory cache read access" ON user_directory_cache
FOR SELECT USING (simple_is_admin());

CREATE POLICY "Invitations read access" ON user_invitations
FOR SELECT USING (simple_is_admin());

-- Corrigir funções com search_path mutable
CREATE OR REPLACE FUNCTION public.log_task_creation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $$
BEGIN
  -- Insert into a log table
  INSERT INTO public.task_creation_log (
    task_id,
    client,
    property,
    responsible,
    start_date,
    created_at,
    created_by
  ) VALUES (
    NEW.id,
    NEW.client,
    NEW.property,
    NEW.responsible,
    NEW.start_date,
    NEW.created_at,
    NEW.created_by
  );
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_opportunity_closure()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status IN ('Venda Total', 'Venda Parcial', 'Venda Perdida') 
     AND OLD.status = 'Prospect' 
     AND NEW.data_fechamento IS NULL THEN
    NEW.data_fechamento = now();
  END IF;
  
  IF NEW.status = 'Prospect' AND OLD.status != 'Prospect' THEN
    NEW.data_fechamento = NULL;
  END IF;
  
  IF NEW.status != OLD.status THEN
    IF NEW.status = 'Venda Total' THEN
      UPDATE public.opportunity_items 
      SET qtd_vendida = qtd_ofertada 
      WHERE opportunity_id = NEW.id;
    ELSIF NEW.status = 'Venda Perdida' THEN
      UPDATE public.opportunity_items 
      SET qtd_vendida = 0 
      WHERE opportunity_id = NEW.id;
    END IF;
  END IF;
  
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_opportunity_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.opportunities 
  SET 
    valor_total_oportunidade = (
      SELECT COALESCE(SUM(subtotal_ofertado), 0)
      FROM public.opportunity_items 
      WHERE opportunity_id = COALESCE(NEW.opportunity_id, OLD.opportunity_id)
    ),
    valor_venda_fechada = (
      SELECT COALESCE(SUM(subtotal_vendido), 0)
      FROM public.opportunity_items 
      WHERE opportunity_id = COALESCE(NEW.opportunity_id, OLD.opportunity_id)
    ),
    updated_at = now()
  WHERE id = COALESCE(NEW.opportunity_id, OLD.opportunity_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_partial_sales_value_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $$
DECLARE
  calculated_value DECIMAL(10,2);
BEGIN
  -- Only update for partial sales
  IF NEW.sales_type = 'parcial' AND NEW.sales_confirmed = true THEN
    calculated_value := calculate_task_partial_sales_value(NEW.id);
    NEW.partial_sales_value := calculated_value;
  ELSIF NEW.sales_type != 'parcial' THEN
    NEW.partial_sales_value := NULL;
  END IF;
  
  RETURN NEW;
END;
$$;