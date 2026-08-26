import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const expected = Deno.env.get('CLIENTS_MASTER_IMPORT_KEY');
  if (!expected || req.headers.get('x-import-key') !== expected) {
    return json({ error: 'unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const action = String(body?.action ?? '');

  try {
    if (action === 'create_batch') {
      const { data, error } = await supabase
        .from('pops_import_batches')
        .insert({
          program_id: body.program_id,
          file_name: String(body.file_name ?? 'import.txt'),
          column_map: body.column_map ?? {},
          created_by: body.created_by ?? null,
          notes: body.notes ?? null,
        })
        .select('id')
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ batch_id: data.id });
    }

    if (action === 'load_rows') {
      const batchId = String(body.batch_id ?? '');
      const startNumber = Number(body.start_number ?? 1);
      const rows: any[] = Array.isArray(body.rows) ? body.rows : [];
      if (!batchId || rows.length === 0) return json({ error: 'batch_id e rows obrigatorios' }, 400);

      const payload = rows.map((r, i) => ({
        batch_id: batchId,
        row_number: startNumber + i,
        raw: r,
        serial_number: r.serial_number ?? null,
        pops_client_code: r.pops_client_code ?? null,
        dealer_location: r.dealer_location ?? null,
        product_series: r.product_series ?? null,
        manufacture_year: r.manufacture_year ?? null,
        model: r.model ?? null,
        client_name: r.client_name ?? null,
        platform: r.platform ?? null,
      }));

      const { error } = await supabase.from('pops_import_rows').insert(payload);
      if (error) return json({ error: error.message }, 400);
      return json({ inserted: payload.length });
    }

    if (action === 'finalize') {
      const batchId = String(body.batch_id ?? '');
      const { count, error: cErr } = await supabase
        .from('pops_import_rows')
        .select('id', { count: 'exact', head: true })
        .eq('batch_id', batchId);
      if (cErr) return json({ error: cErr.message }, 400);
      const { error } = await supabase
        .from('pops_import_batches')
        .update({ total_rows: count ?? 0 })
        .eq('id', batchId);
      if (error) return json({ error: error.message }, 400);
      return json({ total_rows: count ?? 0 });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
