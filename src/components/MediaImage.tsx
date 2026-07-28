import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  resolveMediaUrl,
  invalidateSignedUrl,
  isBase64Image,
  isAbsoluteUrl,
  TASK_PHOTOS_BUCKET,
  type MediaBucket,
} from '@/lib/mediaStorage';

interface MediaImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Valor salvo no banco: Base64 legado OU path do Storage */
  value: string;
  bucket?: MediaBucket;
  fallbackClassName?: string;
}

/**
 * Imagem retrocompatível: aceita Base64 histórico e paths do Storage,
 * gerando signed URL apenas no momento da exibição.
 * Se a signed URL expirar, uma nova é gerada automaticamente (1 retry).
 */
export const MediaImage: React.FC<MediaImageProps> = ({
  value,
  bucket = TASK_PHOTOS_BUCKET,
  fallbackClassName,
  className,
  alt,
  ...rest
}) => {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const retriedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSrc(null);
    retriedRef.current = false;
    resolveMediaUrl(value, bucket)
      .then((url) => {
        if (cancelled) return;
        if (url) setSrc(url);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [value, bucket]);

  // Signed URL expirada → invalida cache e gera outra uma única vez.
  const handleError = useCallback(() => {
    const isStorage = !isBase64Image(value) && !isAbsoluteUrl(value);
    if (!isStorage || retriedRef.current) {
      setFailed(true);
      return;
    }
    retriedRef.current = true;
    invalidateSignedUrl(value, bucket);
    resolveMediaUrl(value, bucket, { force: true })
      .then((url) => (url ? setSrc(url) : setFailed(true)))
      .catch(() => setFailed(true));
  }, [value, bucket]);

  if (failed) {
    return (
      <div
        className={
          fallbackClassName ||
          'w-full h-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground text-center px-1'
        }
      >
        Foto indisponível
      </div>
    );
  }

  if (!src) {
    return <div className={fallbackClassName || 'w-full h-full bg-muted animate-pulse'} />;
  }

  return <img {...rest} src={src} alt={alt} className={className} onError={handleError} />;
};

