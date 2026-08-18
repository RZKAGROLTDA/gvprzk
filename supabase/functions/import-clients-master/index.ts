import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Lista EXPLÍCITA de pseudo-clientes (formas de pagamento) identificados na auditoria.
// Correspondência é por nome normalizado EXATO — nunca por palavra contida no nome,
// para não excluir empresas legítimas (ex.: AGRO MASTER MAQUINAS, COOPERATIVA DE CREDITO...).
const NON_CLIENT_NAMES = new Set([
  'AMEX CREDITO',
  'AMEX CREDITO PARCELADO 03 PARC',
  'AMEX CREDITO PARCELADO 04 PARC',
  'AMEX CREDITO PARCELADO 05 PARC',
  'AMEX CREDITO PARCELADO 06 PARC',
  'AMEX DEBITO',
  'BANCO DO BRASIL CARTAO VISA',
  'CLIENTE PADRAO',
  'CREDITO PARCELADO 05 PARC',
  'ELO CREDITO A VISTA',
  'ELO CREDITO PARCELADO 03 PARC',
  'ELO CREDITO PARCELADO 06 PARC',
  'ELO CREDITO PARCELADO 2 PARC',
  'ELO CREDITO PARCELADO 4 PARC',
  'MASTER CARD',
  'MASTER CREDITO 02 PARCELAS',
  'VISA CREDITO 02 PARCELAS',
  'VISA CREDITO 03 PARCELAS',
  'VISA CREDITO 04 PARCELAS',
  'VISA CREDITO 05 PARCELAS',
  'VISA CREDITO 06 PARCELAS',
  'VISA CREDITO A VISTA',
]);

function normName(s: string) {
  return (s ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

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

  // ---- Step: seed legacy client codes that are NOT present in the ERP file ----
  if (action === 'seed_legacy') {
    const { data, error } = await supabase.rpc('seed_clients_master_legacy', {
      p_batch_id: body?.batch_id ?? null,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, inserted: data });
  }

  // ---- Step: import a batch of rows from the ERP file ----
  if (action === 'import_batch') {
    const rows = Array.isArray(body?.rows) ? body.rows : null;
    if (!rows || rows.length === 0 || rows.length > 5000) {
      return json({ error: 'rows must be an array of 1..5000 items' }, 400);
    }

    const payload: any[] = [];
    let skipped = 0;
    for (const r of rows) {
      const code = String(r?.client_code ?? '').trim();
      const name = String(r?.client_name ?? '').trim();
      const norm = code.replace(/^0+/, '') || '0';
      if (!/^\d+$/.test(code) || !name) { skipped++; continue; }
      const nn = normName(name);
      if (NON_CLIENT_NAMES.has(nn)) { skipped++; continue; }
      payload.push({
        client_code: code,
        client_code_norm: norm,
        client_name: name,
        client_name_norm: nn,
        // Identidade é somente client_code_norm. Os 4 últimos dígitos NÃO representam
        // estabelecimento neste arquivo, portanto não são derivados automaticamente.
        client_code_root: null,
        establishment_code: null,
        name_variants: Array.isArray(r?.name_variants) ? r.name_variants : [name],
        name_conflict: Boolean(r?.name_conflict),
        source: 'erp_import',
        import_batch_id: body?.batch_id ?? null,
      });
    }

    if (payload.length === 0) return json({ ok: true, inserted: 0, skipped });

    // Idempotent: existing client_code_norm rows are never duplicated.
    const { data, error } = await supabase
      .from('clients_master')
      .upsert(payload, { onConflict: 'client_code_norm', ignoreDuplicates: true })
      .select('id');
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, inserted: data?.length ?? 0, skipped });
  }

  return json({ error: 'unknown action' }, 400);
});
