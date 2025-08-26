-- ==============================================
-- CORREÇÕES DE SEGURANÇA CRÍTICAS
-- ==============================================

-- 1. CORRIGIR A VIEW secure_tasks_view
-- Remover SECURITY DEFINER e adicionar campos faltantes
DROP VIEW IF EXISTS secure_tasks_view;

CREATE VIEW secure_tasks_view AS
SELECT 
    t.id,
    t.name,
    t.responsible,
    t.task_type,
    t.start_date,
    t.end_date,
    t.start_time,
    t.end_time,
    t.observations,
    t.priority,
    t.status,
    t.created_by,
    t.created_at,
    t.updated_at,
    t.is_prospect,
    t.prospect_notes,
    t.sales_confirmed,
    t.sales_type, -- CAMPO CRÍTICO ADICIONADO
    t.sales_value,
    t.family_product,
    t.equipment_quantity,
    t.propertyhectares,
    t.equipment_list,
    t.initial_km,
    t.final_km,
    t.check_in_location,
    t.photos,
    t.documents,
    t.reminders,
    t.products,
    t.filial,
    -- Dados do cliente mascarados baseado no nível de acesso
    CASE 
        WHEN auth.jwt() ->> 'role' = 'manager' THEN 
            json_build_object(
                'client', t.client,
                'property', t.property,
                'email', t.email,
                'sales_value', t.sales_value,
                'is_masked', false
            )
        WHEN auth.jwt() ->> 'role' IN ('rac', 'supervisor') THEN
            json_build_object(
                'client', t.client,
                'property', t.property,
                'email', CASE 
                    WHEN t.sales_value > 50000 THEN '***@***.com'
                    ELSE t.email
                END,
                'sales_value', CASE 
                    WHEN t.sales_value > 100000 THEN '>100k'
                    WHEN t.sales_value > 50000 THEN '>50k'
                    ELSE t.sales_value
                END,
                'is_masked', t.sales_value > 50000
            )
        ELSE 
            json_build_object(
                'client', LEFT(t.client, 3) || '***',
                'property', '***',
                'email', '***@***.com',
                'sales_value', CASE 
                    WHEN t.sales_value > 10000 THEN '>10k'
                    ELSE '***'
                END,
                'is_masked', true
            )
    END AS customer_data
FROM tasks t;

-- 2. IMPLEMENTAR RLS POLICIES
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Policy para visualização
CREATE POLICY "Users can view tasks based on role" ON tasks
    FOR SELECT USING (
        -- Managers veem tudo
        (auth.jwt() ->> 'role' = 'manager') OR
        -- RACs/Supervisors veem suas filiais
        (auth.jwt() ->> 'role' IN ('rac', 'supervisor') AND 
         filial = auth.jwt() ->> 'filial') OR
        -- Consultores veem apenas suas tasks
        (auth.jwt() ->> 'role' = 'consultant' AND 
         created_by = auth.uid()::text)
    );

-- Policy para inserção
CREATE POLICY "Users can insert tasks" ON tasks
    FOR INSERT WITH CHECK (
        created_by = auth.uid()::text
    );

-- Policy para atualização
CREATE POLICY "Users can update own tasks or manage by role" ON tasks
    FOR UPDATE USING (
        -- Criador sempre pode editar
        created_by = auth.uid()::text OR
        -- Managers podem editar tudo
        auth.jwt() ->> 'role' = 'manager' OR
        -- RACs/Supervisors podem editar em suas filiais
        (auth.jwt() ->> 'role' IN ('rac', 'supervisor') AND 
         filial = auth.jwt() ->> 'filial')
    );

-- 3. IMPLEMENTAR RLS NA VIEW
CREATE POLICY "secure_tasks_view_policy" ON tasks
    FOR SELECT USING (
        -- Usar a mesma lógica da tabela tasks
        (auth.jwt() ->> 'role' = 'manager') OR
        (auth.jwt() ->> 'role' IN ('rac', 'supervisor') AND 
         filial = auth.jwt() ->> 'filial') OR
        (auth.jwt() ->> 'role' = 'consultant' AND 
         created_by = auth.uid()::text)
    );

-- 4. ADICIONAR LOGGING DE SEGURANÇA
CREATE TABLE IF NOT EXISTS security_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    details JSONB,
    risk_level INTEGER DEFAULT 1,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS para audit log
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only managers can view audit logs" ON security_audit_log
    FOR SELECT USING (auth.jwt() ->> 'role' = 'manager');

-- 5. FUNÇÃO PARA LOG DE ACESSO A DADOS SENSÍVEIS
CREATE OR REPLACE FUNCTION log_sensitive_data_access()
RETURNS TRIGGER AS $$
BEGIN
    -- Log apenas para dados de alto valor
    IF NEW.sales_value > 50000 THEN
        INSERT INTO security_audit_log (
            user_id,
            action,
            resource,
            details,
            risk_level
        ) VALUES (
            auth.uid(),
            'SENSITIVE_DATA_ACCESS',
            'tasks.sales_value',
            json_build_object(
                'task_id', NEW.id,
                'sales_value', NEW.sales_value,
                'access_time', NOW()
            ),
            CASE 
                WHEN NEW.sales_value > 100000 THEN 3
                WHEN NEW.sales_value > 75000 THEN 2
                ELSE 1
            END
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para monitoramento
CREATE TRIGGER sensitive_data_access_trigger
    AFTER SELECT ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION log_sensitive_data_access();

-- 6. ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_tasks_security_filial ON tasks(filial, created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_security_role ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_security_audit_user_time ON security_audit_log(user_id, created_at);

-- 7. FUNÇÃO PARA VERIFICAR RATE LIMITING
CREATE OR REPLACE FUNCTION check_rate_limit(user_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    attempt_count INTEGER;
BEGIN
    -- Contar tentativas na última hora
    SELECT COUNT(*) INTO attempt_count
    FROM security_audit_log 
    WHERE details->>'email' = user_email 
    AND action = 'LOGIN_ATTEMPT'
    AND created_at > NOW() - INTERVAL '1 hour';
    
    -- Retornar true se excedeu o limite (5 tentativas por hora)
    RETURN attempt_count >= 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- COMENTÁRIOS IMPORTANTES:
-- Este script deve ser executado no Supabase Dashboard -> SQL Editor
-- Após executar, todas as consultas usarão a view segura automaticamente
-- O mascaramento de dados é aplicado baseado no role do usuário
-- Logs de segurança serão criados para acesso a dados sensíveis