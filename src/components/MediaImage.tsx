import React, { useEffect, useState } from 'react';
import { resolveMediaUrl, TASK_PHOTOS_BUCKET, type MediaBucket } from '@/lib/mediaStorage';

interface MediaImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Valor salvo no banco: Base64 legado OU path do Storage */
  value: string;
  bucket?: MediaBucket;
  fallbackClassName?: string;
}

/**
 * Imagem retrocompatível: aceita Base64 histórico e paths do Storage,
 * gerando signed URL apenas no momento da exibição.
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

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSrc(null);
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

  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} {...rest} />;
};
