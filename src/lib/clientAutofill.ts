import { supabase } from '@/integrations/supabase/client';

export interface PreviousClientData {
  responsible?: string | null;
  function?: string | null;
  contact_name?: string | null;
  contact_function?: string | null;
  phone?: string | null;
  email?: string | null;
  property?: string | null;
  filial_atendida?: string | null;
  propertyhectares?: number | null;
}

/**
 * Busca os últimos dados de contato/propriedade usados em tarefas anteriores
 * para um cliente. Tenta primeiro pelo clientCode; se vazio, cai pra nome.
 *
 * Retorna null se nada for encontrado.
 */
export async function fetchPreviousClientData(
  clientCode?: string | null,
  clientName?: string | null,
): Promise<PreviousClientData | null> {
  const code = (clientCode || '').trim();
  const name = (clientName || '').trim();

  const baseSelect =
    'responsible, phone, email, property, filial_atendida, propertyhectares, observations';

  try {
    let query = (supabase as any)
      .from('tasks')
      .select(baseSelect)
      .order('created_at', { ascending: false })
      .limit(1);

    if (code) {
      query = query.eq('clientcode', code);
    } else if (name) {
      query = query.ilike('client', name);
    } else {
      return null;
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return data as PreviousClientData;
  } catch {
    return null;
  }
}
