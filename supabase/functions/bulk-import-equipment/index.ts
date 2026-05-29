// =============================================================================
// bulk-import-equipment
// =============================================================================
// Importação em massa de registros para `client_equipment`.
//
// USO RESTRITO: somente service_role OU usuários autenticados com role 'admin'.
// NÃO expor esta função em UI pública. Uso planejado: scripts internos e,
// futuramente, uma tela administrativa dedicada de importação.
//
// -----------------------------------------------------------------------------
// FORMATO DO PAYLOAD (JSON)
// -----------------------------------------------------------------------------
// {
//   "batch_id": "uuid-do-lote",          // obrigatório, mesmo valor para todos
//                                        // os chunks do mesmo arquivo/carga
//   "source":   "excel|erp|manual|...",  // opcional, identificador da origem
//   "notes":    "string livre",          // opcional
//   "rows": [                            // obrigatório, lote (recomendado 500)
//     {
//       "client_code":    "string|null",
//       "client_name":    "string",       // OBRIGATÓRIO
//       "model":          "string|null",
//       "serial_chassis": "string|null",
//       "year":           1900..2100|null,// 1900 deve vir como null
//       "machine_type":   "TRATOR|COLHEITADEIRA|PLATAFORMA|PLANTADEIRA|
//                          PULVERIZADOR|JARDIM|COTTON|UTILITARIO|FORRAGEIRA|
//                          ENFARDADEIRA|SEGADEIRA|OUTROS",
//       "product_raw":    "string|null", // produto original (ERP/Excel)
//       "puk_status":     "yes|no|unknown",
//       "machine_status": "ativa|inativa|sucateada|vendida", // default 'ativa'
//       "filial_id":      "uuid|null",
//       "hours":          "number|null",
//       "observation":    "string|null"
//     }
//   ]
// }
//
// -----------------------------------------------------------------------------
// NORMALIZAÇÃO DE machine_type
// -----------------------------------------------------------------------------
// Deve ser feita ANTES de enviar (no script de preparação do CSV/Excel).
// Tipos canônicos aceitos hoje:
//   TRATOR, COLHEITADEIRA, PLATAFORMA, PLANTADEIRA, PULVERIZADOR,
//   JARDIM, COTTON, UTILITARIO, FORRAGEIRA, ENFARDADEIRA, SEGADEIRA, OUTROS
// `product_raw` deve preservar o valor original para auditoria.
//
// -----------------------------------------------------------------------------
// REGRAS DE import_batch_id
// -----------------------------------------------------------------------------
// - Todo registro é marcado com o `batch_id` recebido (campo
//   `client_equipment.import_batch_id`), permitindo rollback simples:
//     DELETE FROM public.client_equipment WHERE import_batch_id = '<batch_id>';
// - Cada arquivo/importação deve usar um batch_id NOVO (uuid v4).
// - Reusar o mesmo batch_id em chunks da mesma carga é OK e esperado.
//
// -----------------------------------------------------------------------------
// AUDITORIA
// -----------------------------------------------------------------------------
// Cada chamada bem-sucedida grava uma linha em `equipment_import_log` com:
//   batch_id, executed_by (auth.uid ou null se service_role), executed_by_email,
//   rows_inserted, source, notes, created_at.
// =============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  // -----------------------------------------------------------------
  // Autorização: service_role OU usuário autenticado com role 'admin'
  // -----------------------------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return json(401, { error: 'missing_authorization' });

  let executedBy: string | null = null;
  let executedByEmail: string | null = null;
  let isServiceRole = false;

  if (token === SERVICE_ROLE) {
    isServiceRole = true;
  } else {
    // Verifica JWT do usuário e checa role 'admin'
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return json(401, { error: 'invalid_token' });
    }
    executedBy = claims.claims.sub as string;
    executedByEmail = (claims.claims.email as string) ?? null;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isAdmin, error: roleErr } = await admin.rpc('has_role', {
      _user_id: executedBy,
      _role: 'admin',
    });
    if (roleErr || !isAdmin) {
      return json(403, { error: 'forbidden_admin_only' });
    }
  }

  // -----------------------------------------------------------------
  // Validação do payload
  // -----------------------------------------------------------------
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const batchId: string | undefined = payload?.batch_id;
  const rows: any[] = Array.isArray(payload?.rows) ? payload.rows : [];
  const source: string | null = payload?.source ?? null;
  const notes: string | null = payload?.notes ?? null;

  if (!batchId || typeof batchId !== 'string') {
    return json(400, { error: 'batch_id_required' });
  }
  if (rows.length === 0) {
    return json(400, { error: 'rows_required' });
  }
  if (rows.length > 1000) {
    return json(400, { error: 'too_many_rows', max: 1000 });
  }

  // Normaliza e força import_batch_id em todas as linhas
  const prepared = rows.map((r) => ({
    client_code: r.client_code ?? null,
    client_name: r.client_name,
    model: r.model ?? null,
    serial_chassis: r.serial_chassis ?? null,
    year: r.year ?? null,
    machine_type: r.machine_type ?? null,
    product_raw: r.product_raw ?? null,
    puk_status: r.puk_status ?? null,
    machine_status: r.machine_status ?? 'ativa',
    filial_id: r.filial_id ?? null,
    hours: r.hours ?? null,
    observation: r.observation ?? null,
    import_batch_id: batchId,
  }));

  // -----------------------------------------------------------------
  // Insert via service_role (bypass RLS)
  // -----------------------------------------------------------------
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { error: insertErr, count } = await admin
    .from('client_equipment')
    .insert(prepared, { count: 'exact' });

  if (insertErr) {
    return json(500, { error: 'insert_failed', details: insertErr.message });
  }

  const rowsInserted = count ?? prepared.length;

  // -----------------------------------------------------------------
  // Log de auditoria
  // -----------------------------------------------------------------
  await admin.from('equipment_import_log').insert({
    batch_id: batchId,
    executed_by: executedBy,
    executed_by_email: isServiceRole ? 'service_role' : executedByEmail,
    rows_inserted: rowsInserted,
    source,
    notes,
  });

  return json(200, {
    ok: true,
    batch_id: batchId,
    rows_inserted: rowsInserted,
    executed_by: isServiceRole ? 'service_role' : executedByEmail,
  });
});
