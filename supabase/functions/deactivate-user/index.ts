import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization header required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ error: 'Invalid authorization token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authorization: admin/manager only, via user_roles
    const { data: userRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    const isManager = userRoles?.some((r) => r.role === 'admin' || r.role === 'manager') ?? false;

    if (!isManager) {
      await supabaseAdmin.rpc('secure_log_security_event', {
        event_type_param: 'unauthorized_deactivate_attempt',
        metadata_param: { attempted_by: user.id },
        risk_score_param: 8,
      });
      return new Response(JSON.stringify({ error: 'Access denied: managers only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const profileId = body?.profileId as string | undefined;
    if (!profileId) {
      return new Response(JSON.stringify({ error: 'profileId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: targetProfile, error: targetErr } = await supabaseAdmin
      .from('profiles')
      .select('id, user_id, name, employment_status')
      .eq('id', profileId)
      .single();

    if (targetErr || !targetProfile) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (targetProfile.user_id === user.id) {
      return new Response(JSON.stringify({ error: 'Cannot deactivate your own account' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update profile: employment_status=inactive triggers approval_status=rejected + deactivated_at via trigger.
    // We still set deactivated_by explicitly.
    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({
        employment_status: 'inactive',
        deactivated_by: user.id,
        deactivated_at: new Date().toISOString(),
      })
      .eq('id', profileId);

    if (updateErr) {
      console.error('Error deactivating profile:', updateErr);
      return new Response(JSON.stringify({ error: 'Failed to deactivate profile' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Remove roles/admin entries to revoke all access
    await supabaseAdmin.from('user_roles').delete().eq('user_id', targetProfile.user_id);
    await supabaseAdmin.from('admin_users').delete().eq('user_id', targetProfile.user_id);

    // Block login: ban the auth user (does not delete)
    try {
      await supabaseAdmin.auth.admin.updateUserById(targetProfile.user_id, {
        ban_duration: '876000h', // ~100 years
      } as any);
    } catch (e) {
      console.error('Ban user failed (non-fatal):', e);
    }

    await supabaseAdmin.rpc('secure_log_security_event', {
      event_type_param: 'user_deactivation',
      user_id_param: user.id,
      metadata_param: {
        deactivated_user_name: targetProfile.name,
        deactivated_user_id: targetProfile.user_id,
        timestamp: new Date().toISOString(),
      },
      risk_score_param: 3,
    });

    return new Response(
      JSON.stringify({ success: true, message: `Usuário "${targetProfile.name}" desativado com sucesso` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in deactivate-user function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
