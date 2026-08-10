// ============================================================================
// INSTRUMENTAÇÃO DE DIAGNÓSTICO — MÍDIA NO PDF (somente observabilidade)
// ----------------------------------------------------------------------------
// Este módulo NÃO altera comportamento, permissões, retry, cache, Storage nem
// a geração do PDF. Ele apenas coleta e imprime métricas por foto e um resumo
// final no console.
//
// Regras de segurança aplicadas:
//  - nunca imprime conteúdo Base64 (apenas tamanho aproximado);
//  - nunca imprime token de autenticação;
//  - signed URL é sempre mascarada (query string removida).
// ============================================================================

export type PhotoKind = 'base64' | 'storage_path' | 'absolute_url' | 'unknown';

export type PhotoStage =
  | 'classificacao'
  | 'signed_url'
  | 'fetch'
  | 'conversao'
  | 'addimage';

export interface PhotoDiagContext {
  taskId?: string;
  /** Nome do item/serviço do checklist ou "geral" para o registro fotográfico. */
  item?: string;
  productId?: string;
  bucket: string;
  index: number;
}

export interface PhotoDiagRecord {
  taskId?: string;
  item?: string;
  productId?: string;
  bucket: string;
  index: number;
  kind: PhotoKind;
  path?: string;
  signedUrlGerada?: boolean;
  signedUrlMasked?: string;
  signedUrlMs?: number;
  signedUrlErro?: string;
  fetchStatus?: number;
  fetchOk?: boolean;
  contentType?: string;
  blobBytes?: number;
  fetchMs?: number;
  fromCacheOuSW?: 'sim' | 'nao' | 'indeterminado';
  conversaoOk?: boolean;
  dataUrlBytesAprox?: number;
  conversaoMs?: number;
  addImageExecutado?: boolean;
  addImageOk?: boolean;
  addImageFormato?: string;
  dimensoes?: { origem?: { w: number; h: number }; destino?: { w: number; h: number } };
  falha?: { etapa: PhotoStage; detalhe: string };
}

/** Remove querystring (token/assinatura) de uma URL. */
export function maskUrl(url: string): string {
  try {
    const u = new URL(url, 'http://local');
    return `${u.origin === 'http://local' ? '' : u.origin}${u.pathname}?<mascarado>`;
  } catch {
    return String(url).split('?')[0] + '?<mascarado>';
  }
}

export function classifyPhotoValue(value: string): PhotoKind {
  if (!value) return 'unknown';
  if (value.startsWith('data:image')) return 'base64';
  if (/^https?:\/\//i.test(value)) return 'absolute_url';
  return 'storage_path';
}

export class PdfMediaDiagnostics {
  private records: PhotoDiagRecord[] = [];
  constructor(private label: string, private taskId?: string) {}

  start(ctx: PhotoDiagContext, value: string): PhotoDiagRecord {
    const kind = classifyPhotoValue(value);
    const rec: PhotoDiagRecord = {
      taskId: ctx.taskId ?? this.taskId,
      item: ctx.item,
      productId: ctx.productId,
      bucket: ctx.bucket,
      index: ctx.index,
      kind,
      path: kind === 'storage_path' ? value : kind === 'base64' ? '<base64>' : maskUrl(value),
    };
    this.records.push(rec);
    return rec;
  }

  fail(rec: PhotoDiagRecord, etapa: PhotoStage, detalhe: string) {
    if (!rec.falha) rec.falha = { etapa, detalhe };
  }

  /** Log por foto — emitido logo após cada tentativa. */
  logPhoto(rec: PhotoDiagRecord) {
    // eslint-disable-next-line no-console
    console.log(`[pdf-media] ${this.label} foto #${rec.index}`, {
      task_id: rec.taskId,
      item: rec.item,
      product_id: rec.productId,
      bucket_esperado: rec.bucket,
      valor_classificado: rec.kind,
      path: rec.path,
      signed_url_gerada: rec.signedUrlGerada,
      signed_url: rec.signedUrlMasked,
      signed_url_ms: rec.signedUrlMs,
      signed_url_erro: rec.signedUrlErro,
      fetch_status: rec.fetchStatus,
      fetch_ok: rec.fetchOk,
      content_type: rec.contentType,
      blob_bytes: rec.blobBytes,
      fetch_ms: rec.fetchMs,
      cache_ou_service_worker: rec.fromCacheOuSW,
      conversao_ok: rec.conversaoOk,
      dataurl_bytes_aprox: rec.dataUrlBytesAprox,
      conversao_ms: rec.conversaoMs,
      addimage_executado: rec.addImageExecutado,
      addimage_ok: rec.addImageOk,
      addimage_formato: rec.addImageFormato,
      dimensoes: rec.dimensoes,
      falha: rec.falha,
    });
  }

  /** Resumo final — chamado uma única vez ao terminar o PDF. */
  summary() {
    const r = this.records;
    const falhas = r.filter(x => x.addImageOk !== true);
    const inseridas = r.filter(x => x.addImageOk === true).length;
    const resumo = {
      'Fotos esperadas (banco)': r.length,
      'Base64 legado': r.filter(x => x.kind === 'base64').length,
      'Storage paths': r.filter(x => x.kind === 'storage_path').length,
      'Signed URLs resolvidas': r.filter(x => x.signedUrlGerada === true).length,
      'Downloads HTTP 200': r.filter(x => x.fetchOk === true).length,
      'Base64 válido + decodificado': r.filter(x => x.conversaoOk === true).length,
      'Inseridas no PDF': inseridas,
      Falhas: falhas.length,
      'Integridade (banco = PDF)': r.length === inseridas ? 'OK' : 'DIVERGENTE',
    };
    // eslint-disable-next-line no-console
    console.log(`[pdf-media] RESUMO — ${this.label}`, resumo);
    // Evidência objetiva foto a foto (✓/✗ por etapa).
    // eslint-disable-next-line no-console
    console.table(
      r.map(x => ({
        foto: `#${x.index}`,
        item: x.item,
        tipo: x.kind,
        path: x.path,
        signed_url: x.kind === 'base64' ? '—' : x.signedUrlGerada ? '✓' : '✗',
        download: x.kind === 'base64' ? '—' : x.fetchOk ? `✓ ${x.fetchStatus}` : `✗ ${x.fetchStatus ?? '-'}`,
        bytes: x.blobBytes ?? x.dataUrlBytesAprox ?? 0,
        base64: x.conversaoOk ? '✓' : '✗',
        decodificada: x.dimensoes?.origem ? `✓ ${x.dimensoes.origem.w}x${x.dimensoes.origem.h}` : '✗',
        add_image: x.addImageOk ? `✓ ${x.addImageFormato}` : '✗',
        etapa_da_falha: x.falha?.etapa ?? '',
        detalhe: x.falha?.detalhe ?? '',
      })),
    );
    return resumo;
  }
}

