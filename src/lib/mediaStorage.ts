// ============================================================================
// CAMADA ÚNICA DE MÍDIA (Supabase Storage) — Fase 1
// ----------------------------------------------------------------------------
// Regras:
//  - NENHUM novo Base64 deve ser gravado em `tasks.photos` ou `products.photos`.
//  - Toda foto nova é comprimida no navegador e enviada para um bucket PRIVADO.
//  - No banco gravamos SOMENTE o path do objeto: `{task_id}/{arquivo}`.
//  - Signed URLs são geradas apenas na visualização/PDF (nunca persistidas).
//  - Leitura é retrocompatível: valores Base64 antigos continuam funcionando.
//  - Uploads sempre usam a sessão autenticada (RLS). Nunca service_role.
// ============================================================================

import { supabase } from '@/integrations/supabase/client';

export const TASK_PHOTOS_BUCKET = 'task-photos';
export const PRODUCT_PHOTOS_BUCKET = 'product-photos';

export type MediaBucket = typeof TASK_PHOTOS_BUCKET | typeof PRODUCT_PHOTOS_BUCKET;

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.75;
const MIN_QUALITY = 0.5;
const MAX_BYTES = 500 * 1024; // 500KB
const SIGNED_URL_TTL = 60 * 60; // 1 hora

// ---------------------------------------------------------------------------
// Identificação do formato do valor salvo
// ---------------------------------------------------------------------------

/** Base64 legado (data:image/...;base64,....) */
export function isBase64Image(value: string | null | undefined): boolean {
  return !!value && value.startsWith('data:');
}

/** URL absoluta (http/https/blob) — não é path de bucket */
export function isAbsoluteUrl(value: string | null | undefined): boolean {
  return !!value && /^(https?:|blob:)/i.test(value);
}

/** Path de objeto no Storage no padrão `{task_id}/{arquivo}` */
export function isStoragePath(value: string | null | undefined): boolean {
  if (!value) return false;
  if (isBase64Image(value) || isAbsoluteUrl(value)) return false;
  return value.includes('/');
}

// ---------------------------------------------------------------------------
// Compressão
// ---------------------------------------------------------------------------

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem'));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao decodificar imagem'));
    img.src = src;
  });
}

/**
 * Lê a orientação EXIF (1..8) de um JPEG. Retorna 1 quando desconhecida.
 */
async function readExifOrientation(blob: Blob): Promise<number> {
  try {
    const buffer = await blob.slice(0, 128 * 1024).arrayBuffer();
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return 1;
    let offset = 2;
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset, false);
      offset += 2;
      if (marker === 0xffe1) {
        if (view.getUint32(offset + 2, false) !== 0x45786966) return 1;
        const little = view.getUint16(offset + 8, false) === 0x4949;
        const tiff = offset + 8;
        const dirOffset = tiff + view.getUint32(tiff + 4, little);
        const tags = view.getUint16(dirOffset, little);
        for (let i = 0; i < tags; i++) {
          const entry = dirOffset + 2 + i * 12;
          if (view.getUint16(entry, little) === 0x0112) {
            return view.getUint16(entry + 8, little) || 1;
          }
        }
        return 1;
      }
      if ((marker & 0xff00) !== 0xff00) break;
      offset += view.getUint16(offset, false);
    }
  } catch {
    /* ignore */
  }
  return 1;
}

function applyOrientation(
  ctx: CanvasRenderingContext2D,
  orientation: number,
  w: number,
  h: number,
) {
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, h, w); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
    default: break;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao comprimir imagem'))),
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Comprime uma imagem: máx. 1600px no maior lado, JPEG q≈0.75,
 * corrige orientação EXIF e reduz a qualidade até ficar abaixo de 500KB.
 */
export async function compressImage(input: Blob): Promise<Blob> {
  const orientation = input.type === 'image/jpeg' ? await readExifOrientation(input) : 1;
  const dataUrl = await readAsDataUrl(input);
  const img = await loadImage(dataUrl);

  const swap = orientation >= 5 && orientation <= 8;
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;
  const largest = Math.max(width, height);
  if (largest > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / largest;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = swap ? height : width;
  canvas.height = swap ? width : height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível para compressão');
  applyOrientation(ctx, orientation, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let quality = JPEG_QUALITY;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > MAX_BYTES && quality > MIN_QUALITY) {
    quality = Math.max(MIN_QUALITY, quality - 0.1);
    blob = await canvasToBlob(canvas, quality);
  }
  return blob;
}

/** Comprime e devolve um data URL (usado no rascunho local / offline). */
export async function compressToDataUrl(input: Blob): Promise<string> {
  const blob = await compressImage(input);
  return readAsDataUrl(blob);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, body] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(header)?.[1] || 'image/jpeg';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

function buildObjectPath(taskId: string, prefix?: string): string {
  const unique =
    globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const name = prefix ? `${prefix}-${unique}.jpg` : `${unique}.jpg`;
  // Primeiro nível SEMPRE o UUID da tarefa (inclusive para fotos de produto).
  return `${taskId}/${name}`;
}

/**
 * Envia uma foto (File, Blob ou data URL) para o bucket informado.
 * Retorna o path `{task_id}/{arquivo}` que deve ser gravado no banco.
 */
export async function uploadPhoto(
  bucket: MediaBucket,
  taskId: string,
  source: Blob | string,
  options?: { prefix?: string },
): Promise<string> {
  if (!taskId) throw new Error('taskId obrigatório para upload de foto');

  const raw = typeof source === 'string' ? dataUrlToBlob(source) : source;
  const compressed = await compressImage(raw);
  const path = buildObjectPath(taskId, options?.prefix);

  const { error } = await supabase.storage.from(bucket).upload(path, compressed, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw new Error(`Falha no upload da foto: ${error.message}`);
  return path;
}

/**
 * Recebe uma lista mista (data URLs novas + paths já salvos) e garante que
 * ao final todos os itens sejam paths do Storage.
 * - Paths e URLs já existentes são preservados (sem reenvio → sem duplicidade).
 * - Se o upload de uma foto falhar, o valor original é preservado para
 *   nova tentativa e o erro é reportado em `failed`.
 */
export async function uploadPendingPhotos(
  bucket: MediaBucket,
  taskId: string,
  photos: string[] | null | undefined,
  options?: { prefix?: string },
): Promise<{ photos: string[]; uploaded: number; failed: number }> {
  const list = (photos || []).filter(Boolean);
  if (!taskId || list.length === 0) return { photos: list, uploaded: 0, failed: 0 };

  let uploaded = 0;
  let failed = 0;

  const result = await Promise.all(
    list.map(async (value) => {
      if (!isBase64Image(value)) return value; // já é path/URL — nada a fazer
      try {
        const path = await uploadPhoto(bucket, taskId, value, options);
        uploaded++;
        return path;
      } catch (err) {
        failed++;
        console.error('[mediaStorage] Falha ao enviar foto ao Storage:', err);
        return value; // preserva local para nova tentativa
      }
    }),
  );

  return { photos: result, uploaded, failed };
}

// ---------------------------------------------------------------------------
// Leitura (signed URLs com cache em memória)
// ---------------------------------------------------------------------------

interface CacheEntry {
  url: string;
  expiresAt: number;
}

const signedUrlCache = new Map<string, CacheEntry>();

function cacheKey(bucket: MediaBucket, path: string) {
  return `${bucket}:${path}`;
}

/** Invalida a signed URL em cache (usada quando o browser rejeita a URL). */
export function invalidateSignedUrl(value: string, bucket: MediaBucket = TASK_PHOTOS_BUCKET) {
  signedUrlCache.delete(cacheKey(bucket, value));
}

/** Gera (ou reaproveita) uma signed URL. NUNCA persistir esse valor. */
export async function getSignedUrl(
  bucket: MediaBucket,
  path: string,
  force = false,
): Promise<string | null> {
  const key = cacheKey(bucket, path);
  const cached = signedUrlCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL);

  if (error || !data?.signedUrl) {
    console.error('[mediaStorage] Falha ao gerar signed URL:', { bucket, path, error });
    return null;
  }

  signedUrlCache.set(key, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_TTL * 1000,
  });
  return data.signedUrl;
}

/**
 * Resolve um valor salvo para algo exibível:
 *  - Base64 legado → devolve como está;
 *  - URL absoluta → devolve como está;
 *  - path do Storage → signed URL (null se falhar).
 */
export async function resolveMediaUrl(
  value: string,
  bucket: MediaBucket = TASK_PHOTOS_BUCKET,
): Promise<string | null> {
  if (!value) return null;
  if (isBase64Image(value) || isAbsoluteUrl(value)) return value;
  return getSignedUrl(bucket, value);
}

/** Resolve uma lista mista. Falhas individuais viram `null` (não quebram o todo). */
export async function resolveMediaUrls(
  values: string[] | null | undefined,
  bucket: MediaBucket = TASK_PHOTOS_BUCKET,
): Promise<(string | null)[]> {
  const list = (values || []).filter(Boolean);
  return Promise.all(list.map((v) => resolveMediaUrl(v, bucket).catch(() => null)));
}

// ---------------------------------------------------------------------------
// Exclusão
// ---------------------------------------------------------------------------

/**
 * Remove uma foto.
 * - Base64 legado: apenas remove a referência (retorna true).
 * - Path do Storage: remove o objeto; só retorna true se o Storage confirmar.
 *   Em caso de falha, retorna false → o caller NÃO deve remover a referência.
 */
export async function deletePhoto(
  value: string,
  bucket: MediaBucket = TASK_PHOTOS_BUCKET,
): Promise<boolean> {
  if (!value) return true;
  if (!isStoragePath(value)) return true; // Base64 / URL externa

  const { error } = await supabase.storage.from(bucket).remove([value]);
  if (error) {
    console.error('[mediaStorage] Falha ao excluir objeto do Storage:', { value, error });
    return false;
  }
  signedUrlCache.delete(cacheKey(bucket, value));
  return true;
}
