import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return json({ error: 'Authorization header required' }, 401);

    let actorId: string | null = null;
    let authorized = false;

    if (token === serviceKey) {
      authorized = true; // service_role invocation (admin tooling)
    } else {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? ''
      );
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
      if (userError || !user) return json({ error: 'Invalid authorization token' }, 401);
      actorId = user.id;
      const { data: roles } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      authorized = roles?.some((r) => r.role === 'admin' || r.role === 'manager') ?? false;
    }

    if (!authorized) return json({ error: 'Access denied: managers only' }, 403);

    const body = await req.json().catch(() => ({}));
    const userId = body?.userId as string | undefined;
    const role = (body?.role as string | undefined) ?? 'rac';
    if (!userId) return json({ error: 'userId is required' }, 400);

    const { data: targetProfile, error: targetErr } = await supabaseAdmin
      .from('profiles')
      .select('id, user_id, name, email, filial_id, employment_status, approval_status')
      .eq('user_id', userId)
      .maybeSingle();

    if (targetErr || !targetProfile) return json({ error: 'User profile not found' }, 404);

    // 1) Remove ban/block in auth (no password/email change, no recreation)
    const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
    } as any);
    if (banErr) {
      console.error('Unban failed:', banErr);
      return json({ error: `Failed to unban user: ${banErr.message}` }, 500);
    }

    // 2) Restore profile flags (filial untouched)
    const { error: profErr } = await supabaseAdmin
      .from('profiles')
      .update({
        approval_status: 'approved',
        employment_status: 'active',
        deactivated_at: null,
        deactivated_by: null,
      })
      .eq('user_id', userId);
    if (profErr) {
      console.error('Profile update failed:', profErr);
      return json({ error: `Failed to update profile: ${profErr.message}` }, 500);
    }

    // 3) Ensure role exists (no duplicates)
    const { data: existingRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    if (!existingRoles?.some((r) => r.role === role)) {
      const { error: roleErr } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: userId, role });
      if (roleErr) {
        console.error('Role insert failed:', roleErr);
        return json({ error: `Failed to grant role: ${roleErr.message}` }, 500);
      }
    }

    // Validation snapshot
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const { data: finalProfile } = await supabaseAdmin
      .from('profiles')
      .select('approval_status, employment_status, deactivated_at, deactivated_by, filial_id, email, name')
      .eq('user_id', userId)
      .maybeSingle();
    const { data: finalRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    let filialNome: string | null = null;
    if (finalProfile?.filial_id) {
      const { data: filial } = await supabaseAdmin
        .from('filiais')
        .select('nome')
        .eq('id', finalProfile.filial_id)
        .maybeSingle();
      filialNome = filial?.nome ?? null;
    }

    await supabaseAdmin.rpc('secure_log_security_event', {
      event_type_param: 'user_reactivation',
      user_id_param: actorId ?? userId,
      metadata_param: {
        reactivated_user_id: userId,
        reactivated_user_email: finalProfile?.email ?? null,
        via: actorId ? 'manager_jwt' : 'service_role',
        timestamp: new Date().toISOString(),
      },
      risk_score_param: 3,
    }).catch?.(() => {});

    const bannedUntil = (authUser?.user as any)?.banned_until ?? null;
    return json({
      success: true,
      user_id: userId,
      banned_until: bannedUntil,
      email_confirmed_at: (authUser?.user as any)?.email_confirmed_at ?? null,
      approval_status: finalProfile?.approval_status ?? null,
      employment_status: finalProfile?.employment_status ?? null,
      deactivated_at: finalProfile?.deactivated_at ?? null,
      deactivated_by: finalProfile?.deactivated_by ?? null,
      roles: finalRoles?.map((r) => r.role) ?? [],
      filial: { id: finalProfile?.filial_id ?? null, nome: filialNome },
      can_authenticate: !bannedUntil
        && finalProfile?.approval_status === 'approved'
        && finalProfile?.employment_status === 'active',
    });
  } catch (error) {
    console.error('Error in reactivate-user function:', error);
    return json({ error: 'Internal server error' }, 500);
  }
});
