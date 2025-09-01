import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CleanupResult {
  step: string;
  status: 'success' | 'error';
  message: string;
  details?: any;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const results: CleanupResult[] = [];
    
    console.log('🔧 Emergency cleanup started');
    
    // Step 1: Remove problematic SECURITY DEFINER functions
    const problematicFunctions = [
      'audit_table_changes',
      'log_profile_changes',
      'validate_user_permissions', 
      'check_user_role_recursive',
      'get_user_with_profile_recursive',
      'get_current_user_role',
      'audit_changes'
    ];
    
    for (const funcName of problematicFunctions) {
      try {
        const { error } = await supabase.rpc('exec_sql', {
          sql: `DROP FUNCTION IF EXISTS public.${funcName}() CASCADE;`
        });
        
        if (error) {
          console.warn(`Failed to drop ${funcName}:`, error);
          results.push({
            step: `drop_function_${funcName}`,
            status: 'error',
            message: `Failed to drop function ${funcName}`,
            details: error
          });
        } else {
          console.log(`✅ Dropped function: ${funcName}`);
          results.push({
            step: `drop_function_${funcName}`,
            status: 'success',
            message: `Successfully dropped function ${funcName}`
          });
        }
      } catch (error) {
        console.error(`Error dropping ${funcName}:`, error);
        results.push({
          step: `drop_function_${funcName}`,
          status: 'error',
          message: `Exception while dropping ${funcName}`,
          details: error
        });
      }
    }
    
    // Step 2: Clean audit log tables that might be causing issues
    const auditTables = ['audit_log', 'security_events', 'system_logs'];
    
    for (const tableName of auditTables) {
      try {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
        
        if (error) {
          console.warn(`Failed to clean ${tableName}:`, error);
          results.push({
            step: `clean_table_${tableName}`,
            status: 'error', 
            message: `Failed to clean table ${tableName}`,
            details: error
          });
        } else {
          console.log(`✅ Cleaned table: ${tableName}`);
          results.push({
            step: `clean_table_${tableName}`,
            status: 'success',
            message: `Successfully cleaned table ${tableName}`
          });
        }
      } catch (error) {
        // Table might not exist, which is fine
        console.log(`Table ${tableName} doesn't exist or error:`, error);
        results.push({
          step: `clean_table_${tableName}`,
          status: 'success',
          message: `Table ${tableName} doesn't exist (OK)`
        });
      }
    }
    
    // Step 3: Remove problematic triggers
    const problematicTriggers = [
      'audit_profiles_trigger',
      'audit_changes_trigger',
      'validate_permissions_trigger'
    ];
    
    for (const triggerName of problematicTriggers) {
      try {
        const { error } = await supabase.rpc('exec_sql', {
          sql: `DROP TRIGGER IF EXISTS ${triggerName} ON public.profiles CASCADE;`
        });
        
        if (error) {
          console.warn(`Failed to drop trigger ${triggerName}:`, error);
          results.push({
            step: `drop_trigger_${triggerName}`,
            status: 'error',
            message: `Failed to drop trigger ${triggerName}`,
            details: error
          });
        } else {
          console.log(`✅ Dropped trigger: ${triggerName}`);
          results.push({
            step: `drop_trigger_${triggerName}`,
            status: 'success',
            message: `Successfully dropped trigger ${triggerName}`
          });
        }
      } catch (error) {
        console.error(`Error dropping trigger ${triggerName}:`, error);
        results.push({
          step: `drop_trigger_${triggerName}`,
          status: 'error',
          message: `Exception while dropping trigger ${triggerName}`,
          details: error
        });
      }
    }
    
    console.log('🎉 Emergency cleanup completed');
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Emergency cleanup completed',
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
    
  } catch (error) {
    console.error('Emergency cleanup failed:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        details: error
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});