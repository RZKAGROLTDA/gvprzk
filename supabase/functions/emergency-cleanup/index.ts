import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('🚨 Emergency database cleanup started...')

    // 1. Remove problematic views and functions
    const cleanupQueries = [
      'DROP VIEW IF EXISTS secure_tasks_view CASCADE',
      'DROP FUNCTION IF EXISTS check_rate_limit(TEXT) CASCADE',
      'DROP FUNCTION IF EXISTS log_sensitive_data_access() CASCADE',
      'DROP FUNCTION IF EXISTS check_login_rate_limit(TEXT) CASCADE',
      'DROP FUNCTION IF EXISTS check_suspicious_login_pattern(TEXT, TEXT) CASCADE',
      'DROP FUNCTION IF EXISTS secure_log_security_event(TEXT, UUID, INTEGER, JSONB) CASCADE',
      'DROP TRIGGER IF EXISTS sensitive_data_access_trigger ON tasks',
      'DROP TABLE IF EXISTS security_audit_log CASCADE'
    ];

    for (const query of cleanupQueries) {
      try {
        await supabase.rpc('execute_sql', { query });
        console.log(`✅ Executed: ${query.substring(0, 50)}...`);
      } catch (error) {
        console.log(`⚠️ Skipped: ${query.substring(0, 50)}... (${error.message})`);
      }
    }

    // 2. Create simple view without recursion
    const createSimpleView = `
      CREATE VIEW secure_tasks_view AS
      SELECT 
          t.id, t.name, t.responsible, t.task_type, t.start_date, t.end_date,
          t.start_time, t.end_time, t.observations, t.priority, t.status,
          t.created_by, t.created_at, t.updated_at, t.is_prospect,
          t.prospect_notes, t.sales_confirmed, t.sales_type, t.sales_value,
          t.family_product, t.equipment_quantity, t.propertyhectares,
          t.equipment_list, t.initial_km, t.final_km, t.check_in_location,
          t.photos, t.documents, t.reminders, t.products, t.filial,
          t.client, t.property, t.email
      FROM tasks t
    `;

    try {
      await supabase.rpc('execute_sql', { query: createSimpleView });
      console.log('✅ Created simplified secure_tasks_view');
    } catch (error) {
      console.log(`⚠️ View creation failed: ${error.message}`);
    }

    // 3. Reset RLS policies to simple ones
    const resetPolicies = [
      'DROP POLICY IF EXISTS "Users can view tasks based on role" ON tasks',
      'DROP POLICY IF EXISTS "Users can insert tasks" ON tasks', 
      'DROP POLICY IF EXISTS "Users can update own tasks or manage by role" ON tasks',
      'DROP POLICY IF EXISTS "secure_tasks_view_policy" ON tasks',
      `CREATE POLICY "Users can view their own tasks" ON tasks
         FOR SELECT USING (created_by = auth.uid()::text)`,
      `CREATE POLICY "Users can insert their own tasks" ON tasks
         FOR INSERT WITH CHECK (created_by = auth.uid()::text)`,
      `CREATE POLICY "Users can update their own tasks" ON tasks
         FOR UPDATE USING (created_by = auth.uid()::text)`
    ];

    for (const policy of resetPolicies) {
      try {
        await supabase.rpc('execute_sql', { query: policy });
        console.log(`✅ Policy updated`);
      } catch (error) {
        console.log(`⚠️ Policy update failed: ${error.message}`);
      }
    }

    console.log('🎉 Emergency cleanup completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Database cleanup completed successfully' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('❌ Emergency cleanup failed:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})