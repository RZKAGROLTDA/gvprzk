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

// Temporary admin tooling: reactivates ONE specific corporate user.
const ALLOWED_USER_ID = '262e0028-5e9e-4124-bc40-7df1a7cd7801';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return json({ error: 'Authorization header required' }, 401);

    // 1) Validate the JWT
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !user) return json({ error: 'Invalid authorization token' }, 401);

    // 2) Confirm in DB that the caller is an approved admin/manager
    const { data: callerRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('approval_status, employment_status')
      .eq('user_id', user.id)
      .maybeSingle();

    const hasAdminRole = callerRoles?.some((r) => r.role === 'admin' || r.role === 'manager') ?? false;
    const approved = callerProfile?.approval_status === 'approved';
    if (!hasAdminRole || !approved) {
      return json({ error: 'Access denied: approved admin/manager required' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const userId = body?.userId as string | undefined;
    const role = ((body?.role as string | undefined) ?? 'rac').toLowerCase();
    if (userId !== ALLOWED_USER_ID) return json({ error: 'Access denied: target not allowed' }, 403);

    // 3) Perform the profile update in the caller's authenticated context (auth.uid() preserved,
    //    so all profiles security triggers stay enabled and are satisfied legitimately).
    const supabaseAsCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: updated, error: profErr } = await supabaseAsCaller
      .from('profiles')
      .update({
        approval_status: 'approved',
        employment_status: 'active',
        deactivated_at: null,
        deactivated_by: null,
      })
      .eq('user_id', ALLOWED_USER_ID)
      .select('id');

    if (profErr) {
      console.error('Profile update failed:', profErr);
      return json({ error: `Failed to update profile: ${profErr.message}` }, 500);
    }
    if (!updated || updated.length === 0) {
      return json({ error: 'Profile update returned no rows (RLS blocked or profile missing)' }, 500);
    }

    // 4) Ensure role without duplicating
    const { data: existingRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', ALLOWED_USER_ID);
    if (!existingRoles?.some((r) => r.role === role)) {
      const { error: roleErr } = await supabaseAsCaller
        .from('user_roles')
        .insert({ user_id: ALLOWED_USER_ID, role });
      if (roleErr) {
        console.error('Role insert failed:', roleErr);
        return json({ error: `Failed to grant role: ${roleErr.message}` }, 500);
      }
    }

    // Validation snapshot
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(ALLOWED_USER_ID);
    const { data: finalProfile } = await supabaseAdmin
      .from('profiles')
      .select('approval_status, employment_status, deactivated_at, deactivated_by, filial_id, email, name')
      .eq('user_id', ALLOWED_USER_ID)
      .maybeSingle();
    const { data: finalRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', ALLOWED_USER_ID);
    let filialNome: string | null = null;
    if (finalProfile?.filial_id) {
      const { data: filial } = await supabaseAdmin
        .from('filiais')
        .select('nome')
        .eq('id', finalProfile.filial_id)
        .maybeSingle();
      filialNome = filial?.nome ?? null;
    }

    const bannedUntil = (authUser?.user as any)?.banned_until ?? null;
    return json({
      success: true,
      user_id: ALLOWED_USER_ID,
      email: finalProfile?.email ?? null,
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
