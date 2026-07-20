import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * cleanup-orphan-auth-user
 *
 * Remove exclusivamente registros ÓRFÃOS de auth.users.
 * Critérios obrigatórios (todos devem ser verdadeiros):
 *  - existe em auth.users
 *  - NÃO existe profile associado
 *  - NÃO existe vínculo operacional (user_roles, admin_users, etc.)
 *  - NÃO existe histórico (tasks, clients, followups, audit, etc.)
 *
 * Esta função NUNCA deve ser usada para desligamento de colaborador.
 * Para desligamento use a Edge Function `deactivate-user`.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only admin/manager can run this cleanup
    const { data: userRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    const isManager = userRoles?.some((r) => r.role === 'admin' || r.role === 'manager') ?? false;

    if (!isManager) {
      await supabaseAdmin.rpc('secure_log_security_event', {
        event_type_param: 'unauthorized_orphan_cleanup_attempt',
        metadata_param: { attempted_by: user.id },
        risk_score_param: 8,
      });
      return new Response(
        JSON.stringify({ error: 'Access denied: managers only' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const authUserId = body?.authUserId as string | undefined;
    const email = body?.email as string | undefined;

    if (!authUserId || !email) {
      return new Response(
        JSON.stringify({ error: 'authUserId and email are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (authUserId === user.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot cleanup your own auth account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: authUserData, error: authLookupError } =
      await supabaseAdmin.auth.admin.getUserById(authUserId);
    const authUser = authUserData?.user;

    if (authLookupError || !authUser) {
      return new Response(
        JSON.stringify({ error: 'Auth user not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if ((authUser.email || '').toLowerCase() !== String(email).toLowerCase()) {
      return new Response(
        JSON.stringify({ error: 'Auth user email does not match cleanup request' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Full dependency scan — orphan means ZERO references anywhere
    const countRows = async (table: string, column: string) => {
      const { count, error } = await supabaseAdmin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq(column, authUserId);
      if (error) throw new Error(`${table}.${column}: ${error.message}`);
      return count || 0;
    };

    const dependencyChecks: ReadonlyArray<readonly [string, string]> = [
      ['profiles', 'user_id'],
      ['user_roles', 'user_id'],
      ['admin_users', 'user_id'],
      ['tasks', 'created_by'],
      ['clients', 'created_by'],
      ['client_equipment', 'created_by'],
      ['task_followups', 'responsible_user_id'],
      ['task_followups', 'created_by'],
      ['task_equipment', 'created_by'],
      ['visit_schedules', 'created_by'],
      ['team_vacations', 'employee_user_id'],
      ['team_vacations', 'created_by'],
      ['audit_log', 'user_id'],
      ['security_audit_log', 'user_id'],
      ['security_audit_log', 'target_user_id'],
      ['user_directory_cache', 'user_id'],
      ['user_invitations', 'created_by'],
      ['special_conditions', 'created_by'],
      ['special_conditions', 'approved_by'],
      ['campaign_clients_master', 'created_by'],
      ['campaign_rules', 'created_by'],
      ['task_access_metadata', 'created_by'],
    ];

    const dependencyCounts = await Promise.all(
      dependencyChecks.map(async ([table, column]) => ({
        source: `${table}.${column}`,
        records: await countRows(table, column),
      }))
    );
    const existingDependencies = dependencyCounts.filter((item) => item.records > 0);

    if (existingDependencies.length > 0) {
      return new Response(
        JSON.stringify({
          error: 'Auth user is NOT orphan — has application dependencies. Use deactivate-user instead.',
          dependencies: existingDependencies,
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await supabaseAdmin.rpc('secure_log_security_event', {
      event_type_param: 'orphan_auth_user_cleanup',
      user_id_param: user.id,
      metadata_param: {
        cleaned_auth_user_id: authUserId,
        cleaned_auth_user_email: email,
        timestamp: new Date().toISOString(),
      },
      risk_score_param: 5,
    });

    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
    if (deleteAuthError) {
      console.error('Error deleting orphan auth user:', deleteAuthError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete orphan auth user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Orphan auth user deleted successfully',
        deletedAuthUserId: authUserId,
        email,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in cleanup-orphan-auth-user function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
