import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase clients
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Verify the user token and get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if current user is a manager
    const { data: currentUserProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (profileError || currentUserProfile?.role !== 'manager') {
      return new Response(
        JSON.stringify({ error: 'Access denied: Only managers can delete users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the target user ID from request body
    const { profileId } = await req.json();

    if (!profileId) {
      return new Response(
        JSON.stringify({ error: 'Profile ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the target user's profile to find their user_id
    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, name')
      .eq('id', profileId)
      .single();

    if (targetProfileError || !targetProfile) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prevent self-deletion
    if (targetProfile.user_id === user.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot delete your own account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the deletion attempt for audit
    await supabaseAdmin.rpc('secure_log_security_event', {
      event_type: 'user_deletion',
      target_user_id: targetProfile.user_id,
      metadata: {
        deleted_user_name: targetProfile.name,
        deleted_by: user.id,
        timestamp: new Date().toISOString()
      },
      risk_score: 4
    });

    // Step 1: Delete user_roles first
    const { error: rolesDeleteError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', targetProfile.user_id);

    if (rolesDeleteError) {
      console.error('Error deleting user roles:', rolesDeleteError);
      // Continue anyway, roles might not exist
    }

    // Step 2: Delete or reassign tasks created by this user
    // For now, we'll transfer ownership to the manager performing the deletion
    const { error: tasksUpdateError } = await supabaseAdmin
      .from('tasks')
      .update({ created_by: user.id })
      .eq('created_by', targetProfile.user_id);

    if (tasksUpdateError) {
      console.error('Error updating tasks ownership:', tasksUpdateError);
      return new Response(
        JSON.stringify({ error: 'Failed to transfer task ownership' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Delete or reassign clients created by this user
    const { error: clientsUpdateError } = await supabaseAdmin
      .from('clients')
      .update({ created_by: user.id })
      .eq('created_by', targetProfile.user_id);

    if (clientsUpdateError) {
      console.error('Error updating clients ownership:', clientsUpdateError);
      return new Response(
        JSON.stringify({ error: 'Failed to transfer client ownership' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 4: Delete audit logs for this user
    const { error: auditDeleteError } = await supabaseAdmin
      .from('security_audit_log')
      .delete()
      .eq('user_id', targetProfile.user_id);

    if (auditDeleteError) {
      console.error('Error deleting audit logs:', auditDeleteError);
      // Continue anyway, logs are not critical
    }

    // Step 5: Delete the profile (must be before auth.users deletion)
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', profileId);

    if (profileDeleteError) {
      console.error('Error deleting profile:', profileDeleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 6: Delete the user from auth.users (must be last)
    const { error: userDeleteError } = await supabaseAdmin.auth.admin.deleteUser(
      targetProfile.user_id
    );

    if (userDeleteError) {
      console.error('Error deleting auth user:', userDeleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete user from authentication system' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `User "${targetProfile.name}" deleted successfully` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in delete-user function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});