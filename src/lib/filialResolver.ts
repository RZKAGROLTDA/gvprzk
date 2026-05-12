import { supabase } from '@/integrations/supabase/client';

// In-memory cache to avoid repeated round-trips
const nameToId = new Map<string, string>();
let loaded: Promise<void> | null = null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ensureLoaded = async (): Promise<void> => {
  if (loaded) return loaded;
  loaded = (async () => {
    const { data, error } = await supabase.from('filiais').select('id, nome');
    if (error) {
      loaded = null;
      throw error;
    }
    nameToId.clear();
    (data ?? []).forEach((f) => {
      if (f?.nome) nameToId.set(f.nome.trim().toLowerCase(), f.id);
    });
  })();
  return loaded;
};

/**
 * Resolve a filial value (name OR uuid OR 'all'/'') into a UUID.
 * Returns null when the value should be treated as "no filter".
 */
export const resolveFilialIdForFilter = async (
  value?: string | null,
): Promise<string | null> => {
  if (!value || value === 'all' || value === 'Todos' || value.trim() === '') return null;
  if (UUID_RE.test(value)) return value;
  await ensureLoaded();
  return nameToId.get(value.trim().toLowerCase()) ?? null;
};
