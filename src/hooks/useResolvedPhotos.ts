import { useEffect, useState } from 'react';
import {
  resolveMediaUrl,
  TASK_PHOTOS_BUCKET,
  type MediaBucket,
} from '@/lib/mediaStorage';

/**
 * Resolve uma lista MISTA de fotos (Base64 legado + paths do Storage)
 * para URLs exibíveis. Falha individual não quebra as demais.
 */
export function useResolvedPhotos(
  photos: string[] | null | undefined,
  bucket: MediaBucket = TASK_PHOTOS_BUCKET,
) {
  const list = (photos || []).filter(Boolean);
  const key = list.join('|');
  const [resolved, setResolved] = useState<(string | null)[]>(list);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (list.length === 0) {
      setResolved([]);
      return;
    }
    setLoading(true);
    Promise.all(list.map((v) => resolveMediaUrl(v, bucket).catch(() => null)))
      .then((urls) => {
        if (!cancelled) setResolved(urls);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, bucket]);

  return { resolved, loading };
}
