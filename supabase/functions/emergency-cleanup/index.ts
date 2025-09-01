import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action } = await req.json()
    console.log('Emergency cleanup started:', action)

    if (action === 'cleanup') {
      const results = []

      // 1. Remove problematic SECURITY DEFINER functions
      const problemFunctions = [
        'get_current_user_role',
        'check_user_permission', 
        'get_user_data',
        'validate_user_access',
        'audit_log_function'
      ]

      for (const funcName of problemFunctions) {
        try {
          const { error } = await supabaseClient.rpc('execute_raw_sql', {
            sql: `DROP FUNCTION IF EXISTS public.${funcName}() CASCADE;`
          })
          
          if (!error) {
            results.push(`✅ Removed problematic function: ${funcName}`)
            console.log(`Removed function: ${funcName}`)
          }
        } catch (err) {
          results.push(`⚠️ Error removing ${funcName}: ${err}`)
          console.error(`Error removing ${funcName}:`, err)
        }
      }

      // 2. Remove problematic triggers
      try {
        const { error: triggerError } = await supabaseClient.rpc('execute_raw_sql', {
          sql: `
            DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles CASCADE;
            DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks CASCADE;
            DROP TRIGGER IF EXISTS audit_log_trigger ON public.profiles CASCADE;
            DROP TRIGGER IF EXISTS security_audit_trigger ON public.profiles CASCADE;
          `
        })
        
        if (!triggerError) {
          results.push('✅ Problematic triggers removed')
          console.log('Triggers removed successfully')
        }
      } catch (err) {
        results.push(`⚠️ Error removing triggers: ${err}`)
        console.error('Error removing triggers:', err)
      }

      // 3. Clean old audit logs
      try {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const { error: auditError } = await supabaseClient
          .from('audit_logs')
          .delete()
          .lt('created_at', weekAgo)
        
        if (!auditError) {
          results.push('✅ Old audit logs cleaned')
          console.log('Audit logs cleaned')
        }
      } catch (err) {
        results.push(`⚠️ Error cleaning audit logs: ${err}`)
        console.error('Error cleaning audit logs:', err)
      }

      // 4. Recreate simple RLS policies
      try {
        const { error: policyError } = await supabaseClient.rpc('execute_raw_sql', {
          sql: `
            -- Remove all existing policies
            DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
            DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
            DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
            DROP POLICY IF EXISTS "Enable read access for users based on user_id" ON public.profiles;
            DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.profiles;
            
            -- Create simple, safe policies
            CREATE POLICY "profiles_select_policy" 
            ON public.profiles FOR SELECT 
            USING (auth.uid() = user_id);
            
            CREATE POLICY "profiles_update_policy" 
            ON public.profiles FOR UPDATE 
            USING (auth.uid() = user_id);
          `
        })
        
        if (!policyError) {
          results.push('✅ RLS policies recreated safely')
          console.log('RLS policies recreated')
        }
      } catch (err) {
        results.push(`⚠️ Error recreating policies: ${err}`)
        console.error('Error recreating policies:', err)
      }

      console.log('Emergency cleanup completed:', results)

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Emergency cleanup completed',
          results 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )

  } catch (error) {
    console.error('Emergency cleanup error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Emergency cleanup failed', 
        details: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})