import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action } = await req.json()
    console.log(`🚨 Executando ação de emergência: ${action}`)

    let results: any[] = []

    if (action === 'full_cleanup' || action === 'force_reset') {
      // 1. Remover funções SECURITY DEFINER problemáticas
      try {
        const dropFunctionQuery = `
          DO $$
          DECLARE
            func_name text;
          BEGIN
            FOR func_name IN
              SELECT routine_name 
              FROM information_schema.routines 
              WHERE routine_schema = 'public' 
              AND security_type = 'DEFINER'
              AND routine_name LIKE '%security%'
            LOOP
              EXECUTE 'DROP FUNCTION IF EXISTS public.' || func_name || ' CASCADE';
              RAISE NOTICE 'Removed function: %', func_name;
            END LOOP;
          END $$;
        `
        
        const { error: dropError } = await supabaseClient.rpc('exec_sql', { 
          sql: dropFunctionQuery 
        })
        
        results.push({
          operation: 'Remove Security Definer Functions',
          success: !dropError,
          message: dropError ? dropError.message : 'Funções problemáticas removidas'
        })
      } catch (error: any) {
        results.push({
          operation: 'Remove Security Definer Functions',
          success: false,
          message: `Erro: ${error.message}`
        })
      }

      // 2. Limpar logs antigos
      try {
        const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        
        // Limpar diferentes tipos de logs
        const logTables = ['postgres_logs', 'auth_logs', 'function_edge_logs']
        
        for (const table of logTables) {
          try {
            const { error } = await supabaseClient
              .from(table)
              .delete()
              .lt('timestamp', cutoffDate)
            
            if (!error) {
              results.push({
                operation: `Clear ${table}`,
                success: true,
                message: `Logs antigos removidos de ${table}`
              })
            }
          } catch (tableError: any) {
            // Tabela pode não existir, não é erro crítico
            console.log(`Tabela ${table} não encontrada ou não acessível`)
          }
        }
      } catch (error: any) {
        results.push({
          operation: 'Clear Old Logs',
          success: false,
          message: `Erro na limpeza de logs: ${error.message}`
        })
      }

      // 3. Recriar políticas RLS básicas
      try {
        const recreateRLSQuery = `
          -- Recriar políticas básicas para tasks
          DROP POLICY IF EXISTS "Users can view their own tasks" ON public.tasks;
          DROP POLICY IF EXISTS "Users can create their own tasks" ON public.tasks;
          DROP POLICY IF EXISTS "Users can update their own tasks" ON public.tasks;
          DROP POLICY IF EXISTS "Users can delete their own tasks" ON public.tasks;
          
          CREATE POLICY "Users can view their own tasks" 
          ON public.tasks FOR SELECT 
          USING (auth.uid() = user_id);
          
          CREATE POLICY "Users can create their own tasks" 
          ON public.tasks FOR INSERT 
          WITH CHECK (auth.uid() = user_id);
          
          CREATE POLICY "Users can update their own tasks" 
          ON public.tasks FOR UPDATE 
          USING (auth.uid() = user_id);
          
          CREATE POLICY "Users can delete their own tasks" 
          ON public.tasks FOR DELETE 
          USING (auth.uid() = user_id);
          
          -- Recriar políticas básicas para profiles
          DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
          DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
          
          CREATE POLICY "Users can view their own profile" 
          ON public.profiles FOR SELECT 
          USING (auth.uid() = user_id);
          
          CREATE POLICY "Users can update their own profile" 
          ON public.profiles FOR UPDATE 
          USING (auth.uid() = user_id);
        `
        
        const { error: rlsError } = await supabaseClient.rpc('exec_sql', { 
          sql: recreateRLSQuery 
        })
        
        results.push({
          operation: 'Recreate RLS Policies',
          success: !rlsError,
          message: rlsError ? rlsError.message : 'Políticas RLS recriadas'
        })
      } catch (error: any) {
        results.push({
          operation: 'Recreate RLS Policies',
          success: false,
          message: `Erro: ${error.message}`
        })
      }

      // 4. Reset específico para força total
      if (action === 'force_reset') {
        try {
          // Limpar cache e conexões
          const { error: resetError } = await supabaseClient.rpc('exec_sql', { 
            sql: 'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();'
          })
          
          results.push({
            operation: 'Force Connection Reset',
            success: !resetError,
            message: resetError ? resetError.message : 'Conexões resetadas'
          })
        } catch (error: any) {
          results.push({
            operation: 'Force Connection Reset',
            success: false,
            message: `Erro: ${error.message}`
          })
        }
      }
    }

    // 5. Verificação final
    try {
      const { error: testError } = await supabaseClient
        .from('profiles')
        .select('count')
        .limit(1)
      
      results.push({
        operation: 'Final System Check',
        success: !testError,
        message: testError ? 'Sistema ainda instável' : 'Sistema funcionando normalmente'
      })
    } catch (error: any) {
      results.push({
        operation: 'Final System Check',
        success: false,
        message: `Erro na verificação: ${error.message}`
      })
    }

    console.log('✅ Limpeza de emergência concluída:', results)

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error: any) {
    console.error('❌ Erro na função de emergência:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})