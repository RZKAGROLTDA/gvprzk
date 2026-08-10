// ============================================================================
// CARREGADOR ÚNICO E VALIDADO DE IMAGEM PARA PDF
// ----------------------------------------------------------------------------
// Regra central: uma imagem só pode ser considerada utilizável no PDF quando
// TODAS as etapas abaixo passarem. Nenhuma etapa pode falhar silenciosamente.
//
//   1) classificação do valor (base64 legado x path do Storage x URL absoluta)
//   2) signed URL válida (para paths do Storage)
//   3) download com HTTP 200 obrigatório (resposta opaca/status 0 é inválida)
//   4) blob.size > 0
//   5) Content-Type image/jpeg | image/png | image/webp
//   6) magic bytes conferem com um formato suportado
//   7) Base64 gerado não vazio
//   8) imagem realmente decodificada pelo browser (dimensões > 0)
//
// Se qualquer etapa falhar: a signed URL é invalidada, uma nova é solicitada e
// o download é repetido UMA ÚNICA VEZ. Só após a segunda falha a imagem é
// considerada indisponível.
//
// Este módulo não altera banco, Storage, buckets, RLS, layout do PDF nem
// regras de negócio.
// ============================================================================

import {
  resolveMediaUrl,
  invalidateSignedUrl,
  isBase64Image,
  isAbsoluteUrl,
  TASK_PHOTOS_BUCKET,
  type MediaBucket,
} from '@/lib/mediaStorage';
import { maskUrl, type PdfMediaDiagnostics, type PhotoDiagRecord, type PhotoStage } from '@/lib/pdfMediaDiagnostics';

export type PdfImageFormat = 'JPEG' | 'PNG' | 'WEBP';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export interface LoadedPdfImage {
  ok: true;
  dataUrl: string;
  format: PdfImageFormat;
  width: number;
  height: number;
  attempts: number;
}

export interface FailedPdfImage {
  ok: false;
  stage: PhotoStage | 'validacao' | 'decode';
  detail: string;
  attempts: number;
}

export type PdfImageResult = LoadedPdfImage | FailedPdfImage;

interface Diag {
  collector: PdfMediaDiagnostics;
  rec: PhotoDiagRecord;
}

// ---------------------------------------------------------------------------
// Magic bytes
// ---------------------------------------------------------------------------

/** Detecta o formato real a partir dos bytes iniciais. `null` = não suportado. */
export function detectImageFormat(bytes: Uint8Array): PdfImageFormat | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'JPEG';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'PNG';
  // WEBP: "RIFF"...."WEBP"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'WEBP';
  return null;
}

function base64HeadToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return new Uint8Array();
  const body = dataUrl.slice(comma + 1, comma + 1 + 64).replace(/\s/g, '');
  // atob exige múltiplo de 4
  const usable = body.slice(0, body.length - (body.length % 4));
  if (!usable) return new Uint8Array();
  try {
    const bin = atob(usable);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array();
  }
}

// ---------------------------------------------------------------------------
// Decodificação obrigatória (sem fallback de dimensões)
// ---------------------------------------------------------------------------

/**
 * Decodifica a imagem no browser. Se `onerror` disparar ou as dimensões forem
 * zero, a imagem é INVÁLIDA (não existe mais fallback 100x100).
 */
export function decodeImage(dataUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (v: { width: number; height: number } | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      finish(w > 0 && h > 0 ? { width: w, height: h } : null);
    };
    img.onerror = () => finish(null);
    // Guarda contra decode travado (imagem corrompida em alguns engines).
    setTimeout(() => finish(null), 15000);
    img.src = dataUrl;
  });
}

function blobToDataUrl(blob: Blob, mime: string): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (!result || !result.startsWith('data:') || result.indexOf(',') === result.length - 1) {
        resolve(null);
        return;
      }
      // Garante um mime coerente com os magic bytes detectados.
      if (!result.startsWith(`data:${mime}`)) {
        const comma = result.indexOf(',');
        resolve(`data:${mime};base64,${result.slice(comma + 1)}`);
        return;
      }
      resolve(result);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

async function attemptFromStorage(
  value: string,
  bucket: MediaBucket,
  force: boolean,
  diag?: Diag,
): Promise<PdfImageResult> {
  const rec = diag?.rec;
  const t0 = performance.now();
  const url = await resolveMediaUrl(value, bucket, { force });
  if (rec) {
    rec.signedUrlMs = Math.round(performance.now() - t0);
    rec.signedUrlGerada = !!url;
    if (url) rec.signedUrlMasked = maskUrl(url);
  }
  if (!url) {
    const detail = 'createSignedUrl retornou null/erro';
    if (rec) rec.signedUrlErro = detail;
    return { ok: false, stage: 'signed_url', detail, attempts: 1 };
  }

  let response: Response;
  const tFetch = performance.now();
  try {
    // `cache: 'reload'` evita reuso de resposta opaca/vazia do Service Worker.
    response = await fetch(url, { cache: 'reload', mode: 'cors', credentials: 'omit' });
  } catch (e: any) {
    return { ok: false, stage: 'fetch', detail: `fetch lançou: ${String(e?.message || e)}`, attempts: 1 };
  }
  if (rec) {
    rec.fetchMs = Math.round(performance.now() - tFetch);
    rec.fetchStatus = response.status;
    rec.fetchOk = response.status === 200;
    rec.contentType = response.headers.get('content-type') || undefined;
    rec.fromCacheOuSW =
      response.type === 'opaque' || response.status === 0
        ? 'sim'
        : response.headers.get('age') || response.headers.get('x-sw-cache')
          ? 'sim'
          : 'indeterminado';
  }

  // HTTP 200 obrigatório — respostas opacas (type opaque / status 0) são inválidas.
  if (response.status !== 200 || response.type === 'opaque') {
    return {
      ok: false,
      stage: 'fetch',
      detail: `resposta inválida (status ${response.status}, type ${response.type})`,
      attempts: 1,
    };
  }

  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return { ok: false, stage: 'validacao', detail: `content-type não suportado: ${contentType}`, attempts: 1 };
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch (e: any) {
    return { ok: false, stage: 'fetch', detail: `arrayBuffer falhou: ${String(e?.message || e)}`, attempts: 1 };
  }
  if (rec) rec.blobBytes = buffer.byteLength;
  if (buffer.byteLength === 0) {
    return { ok: false, stage: 'validacao', detail: 'blob.size = 0 (corpo vazio)', attempts: 1 };
  }

  const bytes = new Uint8Array(buffer);
  const format = detectImageFormat(bytes);
  if (!format) {
    return {
      ok: false,
      stage: 'validacao',
      detail: `magic bytes não correspondem a JPEG/PNG/WEBP (${Array.from(bytes.slice(0, 4))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')})`,
      attempts: 1,
    };
  }

  const mime = format === 'JPEG' ? 'image/jpeg' : format === 'PNG' ? 'image/png' : 'image/webp';
  const tConv = performance.now();
  const dataUrl = await blobToDataUrl(new Blob([buffer], { type: mime }), mime);
  if (rec) {
    rec.conversaoMs = Math.round(performance.now() - tConv);
    rec.conversaoOk = !!dataUrl;
    rec.dataUrlBytesAprox = dataUrl ? dataUrl.length : 0;
  }
  if (!dataUrl) {
    return { ok: false, stage: 'conversao', detail: 'FileReader retornou Base64 vazio/inválido', attempts: 1 };
  }

  const dim = await decodeImage(dataUrl);
  if (!dim) {
    return { ok: false, stage: 'decode', detail: 'imagem não pôde ser decodificada pelo browser', attempts: 1 };
  }
  if (rec) rec.dimensoes = { ...(rec.dimensoes || {}), origem: { w: dim.width, h: dim.height } };

  return { ok: true, dataUrl, format, width: dim.width, height: dim.height, attempts: 1 };
}

async function loadInlineBase64(value: string, diag?: Diag): Promise<PdfImageResult> {
  const rec = diag?.rec;
  const bytes = base64HeadToBytes(value);
  if (rec) {
    rec.signedUrlGerada = undefined;
    rec.dataUrlBytesAprox = value.length;
  }
  if (bytes.length === 0) {
    if (rec) rec.conversaoOk = false;
    return { ok: false, stage: 'validacao', detail: 'Base64 vazio/ilegível', attempts: 1 };
  }
  const format = detectImageFormat(bytes);
  if (!format) {
    if (rec) rec.conversaoOk = false;
    return { ok: false, stage: 'validacao', detail: 'magic bytes do Base64 não são JPEG/PNG/WEBP', attempts: 1 };
  }
  if (rec) rec.conversaoOk = true;
  const dim = await decodeImage(value);
  if (!dim) {
    return { ok: false, stage: 'decode', detail: 'Base64 não pôde ser decodificado pelo browser', attempts: 1 };
  }
  if (rec) rec.dimensoes = { ...(rec.dimensoes || {}), origem: { w: dim.width, h: dim.height } };
  return { ok: true, dataUrl: value, format, width: dim.width, height: dim.height, attempts: 1 };
}

/**
 * Carrega e valida rigorosamente uma foto para inserção no PDF.
 * Base64 legado, path do Storage e URL absoluta passam pelas mesmas validações
 * de formato e decodificação. Em falha, tenta novamente UMA vez com uma nova
 * signed URL.
 */
export async function loadPdfImage(
  value: string,
  bucket: MediaBucket = TASK_PHOTOS_BUCKET,
  diag?: Diag,
): Promise<PdfImageResult> {
  if (!value) {
    return { ok: false, stage: 'classificacao', detail: 'valor vazio', attempts: 0 };
  }

  if (isBase64Image(value)) {
    const r = await loadInlineBase64(value, diag);
    if (r.ok === false && diag) diag.collector.fail(diag.rec, mapStage(r.stage), r.detail);
    return r;
  }


  const isRemotePath = !isAbsoluteUrl(value);
  let result = await attemptFromStorage(value, bucket, false, diag);
  if (result.ok) return result;

  // ---- Recuperação automática: nova signed URL + um único novo download ----
  if (isRemotePath) {
    invalidateSignedUrl(value, bucket);
  }
  const retry = await attemptFromStorage(value, bucket, true, diag);
  if (retry.ok) return { ...retry, attempts: 2 };

  const failure: FailedPdfImage = { ...(retry as FailedPdfImage), attempts: 2 };
  if (diag) diag.collector.fail(diag.rec, mapStage(failure.stage), `${failure.detail} (após 2 tentativas)`);
  return failure;
}

function mapStage(stage: FailedPdfImage['stage']): PhotoStage {
  if (stage === 'validacao' || stage === 'decode') return 'conversao';
  return stage;
}
