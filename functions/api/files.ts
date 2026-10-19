// Cloudflare Pages Function — /api/files (견적서 입력 도우미: 업로드+판독, 파일 목록·내려받기·연결·삭제)
// 파일 본문은 R2(FILES 바인딩), 메타데이터·판독 결과는 D1 ai_files (d1/migrations/0002_ai_files.sql).
// 딜·고객 반영은 브라우저가 사용자의 확인을 받은 뒤 기존 API(/api/deals 등)로 하고, 끝나면 'link' 로 파일을 연결한다.
//
// GET  ?action=list&company=<회사명>  → 그 회사(정규화한 이름)의 파일 목록 — 고객 상세 화면
// GET  ?action=recent&limit=          → 최근 파일 — 도우미 화면
// GET  ?action=download&id=           → 내려받기
// POST multipart/form-data { file, userName }
//      → SSE: status{phase: uploading|duplicate|reading} → done{file, extraction, duplicate, model, costUsd} | error
// POST { action:'link', id, company, customerId?, dealId?, applied, userName }
// POST { action:'delete', id, userName, pin? }      → 올린 사람 또는 관리자 PIN

import { ownerOrPin, requireDb } from '../_lib/ai-auth';
import { mapError } from '../_lib/ai-client';
import {
  companyKey,
  extractQuote,
  findBySha,
  getFile,
  insertFile,
  linkFile,
  listFiles,
  looksLikePdf,
  MAX_FILE_BYTES,
  publicFile,
  r2KeyFor,
  rejectReason,
  saveExtraction,
  sha256Hex,
  softDeleteFile,
  upgradeExtraction,
  type QuoteExtraction,
} from '../_lib/ai-files';
import { AiError, checkOrigin, cleanUserName, errorResponse, ipHash, jsonFor, nowIso, openSse, optionsResponse, readJsonCapped, type AiEnv } from '../_lib/ai-http';
import { audit } from '../_lib/ai-store';

type Ctx = EventContext<AiEnv, string, Record<string, unknown>>;

function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  console.error('[files] unexpected', String(err).slice(0, 300));
  return new AiError(500, 'internal', '처리 중 오류가 발생했습니다.', { retryable: true });
}

// 새 판독(AI 호출) 상한 — 화면은 한 번에 10개까지 올리고, 이것은 그 위의 안전장치다
const INTAKE_WINDOW_MS = 10 * 60_000;
const INTAKE_MAX_PER_WINDOW = 30;

async function checkIntakeRate(db: D1Database, userName: string): Promise<void> {
  const since = new Date(Date.now() - INTAKE_WINDOW_MS).toISOString();
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE feature = 'intake' AND user_name = ? AND created_at > ?")
    .bind(userName, since)
    .first<{ n: number }>();
  if ((row?.n ?? 0) >= INTAKE_MAX_PER_WINDOW) {
    throw new AiError(429, 'rate_limited', `견적서 판독은 10분에 ${INTAKE_MAX_PER_WINDOW}건까지입니다. 잠시 후 다시 시도해 주세요.`, { retryable: true });
  }
}

function requireFiles(env: AiEnv): R2Bucket {
  if (!env.FILES) throw new AiError(503, 'files_not_configured', '파일 저장소(R2)가 연결되지 않았습니다(관리자 확인 필요).');
  return env.FILES;
}

export const onRequestGet: PagesFunction<AiEnv> = async (context) => {
  const { request, env } = context;
  try {
    const originError = checkOrigin(request, env);
    if (originError) throw originError;
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const db = await requireDb(env);

    if (action === 'download') {
      const id = url.searchParams.get('id') || '';
      const f = id ? await getFile(db, id) : null;
      if (!f) throw new AiError(404, 'not_found', '파일을 찾을 수 없습니다.');
      const obj = await requireFiles(env).get(f.r2_key);
      if (!obj) throw new AiError(404, 'not_found', '파일 본문을 찾을 수 없습니다.');
      const ascii = f.file_name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
      return new Response(obj.body, {
        headers: {
          'Content-Type': f.content_type || 'application/pdf',
          'Content-Length': String(obj.size),
          'Content-Disposition': `attachment; filename="${ascii || 'quote.pdf'}"; filename*=UTF-8''${encodeURIComponent(f.file_name)}`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    if (action === 'list') {
      const key = companyKey(url.searchParams.get('company'));
      if (!key) throw new AiError(400, 'bad_request', '회사명이 필요합니다.');
      return jsonFor(request, env, { ok: true, items: (await listFiles(db, { companyKey: key, limit: 50 })).map(publicFile) });
    }
    if (action === 'recent') {
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);
      return jsonFor(request, env, { ok: true, items: (await listFiles(db, { limit })).map(publicFile) });
    }
    throw new AiError(400, 'bad_request', '알 수 없는 요청입니다.');
  } catch (err) {
    return errorResponse(request, env, toAiError(err));
  }
};

export const onRequestPost: PagesFunction<AiEnv> = async (context) => {
  const { request, env } = context;
  try {
    const originError = checkOrigin(request, env);
    if (originError) throw originError;
    if ((request.headers.get('content-type') || '').startsWith('multipart/form-data')) return await handleUpload(context);
    const body = await readJsonCapped<Record<string, unknown>>(request, 20_000);
    if (body.action === 'link') return await handleLink(request, env, body);
    if (body.action === 'delete') return await handleDelete(request, env, body);
    throw new AiError(400, 'bad_request', '알 수 없는 요청입니다.');
  } catch (err) {
    return errorResponse(request, env, toAiError(err));
  }
};

export const onRequestOptions: PagesFunction<AiEnv> = async ({ request, env }) => optionsResponse(request, env, 'GET, POST, OPTIONS');

// ─── 업로드 + 판독 ──────────────────────────────────────────────────────

async function handleUpload(context: Ctx): Promise<Response> {
  const { request, env } = context;
  if (Number(request.headers.get('content-length') || 0) > MAX_FILE_BYTES + 1_000_000) {
    throw new AiError(413, 'too_large', '파일이 너무 큽니다(20MB 이하).');
  }
  const db = await requireDb(env);
  const bucket = requireFiles(env);
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') throw new AiError(400, 'bad_request', 'PDF 파일을 첨부해 주세요.');
  if (file.size > MAX_FILE_BYTES) throw new AiError(413, 'too_large', '파일이 너무 큽니다(20MB 이하).');
  const userName = cleanUserName(form.get('userName'));
  const buf = await file.arrayBuffer();
  if (!looksLikePdf(buf)) throw new AiError(415, 'not_pdf', 'PDF 파일만 올릴 수 있습니다.');
  // macOS 에서 온 파일명은 NFD(자모 분리)일 수 있다 — 저장·차수 판정 모두 NFC 로
  const fileName = (file.name || 'quote.pdf').normalize('NFC').replace(/[\r\n]/g, ' ').slice(0, 200);
  const sha = await sha256Hex(buf);

  const sse = openSse(request, env);
  context.waitUntil(
    (async () => {
      try {
        sse.send('status', { phase: 'uploading' });
        let row = await findBySha(db, sha);
        const duplicate = !!row;
        if (row) {
          sse.send('status', { phase: 'duplicate', file: publicFile(row) });
        } else {
          const id = crypto.randomUUID();
          const at = nowIso();
          const key = r2KeyFor(id, at);
          await bucket.put(key, buf, { httpMetadata: { contentType: 'application/pdf' } });
          await insertFile(db, {
            id,
            kind: 'quote',
            file_name: fileName,
            content_type: 'application/pdf',
            size: buf.byteLength,
            sha256: sha,
            r2_key: key,
            company: null,
            company_key: null,
            customer_id: null,
            deal_id: null,
            status: 'uploaded',
            extraction_json: null,
            applied_json: null,
            uploaded_by: userName,
            created_at: at,
          });
          row = await getFile(db, id);
          if (!row) throw new AiError(500, 'internal', '파일 기록을 저장하지 못했습니다.', { retryable: true });
        }

        let extraction: QuoteExtraction;
        let model: string | null = null;
        let costUsd = 0;
        if (row.extraction_json) {
          // 이전 판독 결과 — 새 필드·플래그와 이번 파일명(차수·라벨)으로 보강
          extraction = upgradeExtraction(JSON.parse(row.extraction_json), fileName);
        } else {
          await checkIntakeRate(db, userName);
          sse.send('status', { phase: 'reading' });
          const r = await extractQuote(env, buf, userName, row.id, fileName);
          extraction = r.extraction;
          model = r.model;
          costUsd = r.costUsd;
          await saveExtraction(db, row.id, extraction);
          row = (await getFile(db, row.id)) ?? row;
        }
        const reject = rejectReason(extraction);
        if (reject) {
          // 견적서가 아니거나 타사 견적서면 보관하지 않는다 (목록·고객 파일에 섞이지 않게)
          if (!duplicate) {
            await softDeleteFile(db, row.id, 'system', nowIso());
            await bucket.delete(row.r2_key).catch(() => {});
          }
          sse.send('error', { code: 'not_quote', message: reject, retryable: false });
          return;
        }
        sse.send('done', { file: publicFile(row), extraction, duplicate, model, costUsd });
      } catch (err) {
        const e = mapError(err);
        if (!sse.closed) sse.send('error', { code: e.code, message: e.message, retryable: e.retryable });
      } finally {
        await sse.close();
      }
    })(),
  );
  return sse.response;
}

// ─── 연결 / 삭제 ────────────────────────────────────────────────────────

async function handleLink(request: Request, env: AiEnv, body: Record<string, unknown>): Promise<Response> {
  const db = await requireDb(env);
  const id = typeof body.id === 'string' ? body.id : '';
  const company = typeof body.company === 'string' ? body.company.trim().slice(0, 100) : '';
  if (!id || !company) throw new AiError(400, 'bad_request', '연결할 파일과 회사명이 필요합니다.');
  const f = await getFile(db, id);
  if (!f) throw new AiError(404, 'not_found', '파일을 찾을 수 없습니다.');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null);
  await linkFile(db, id, {
    company,
    customerId: num(body.customerId),
    dealId: num(body.dealId),
    applied: body.applied ?? null,
    by: cleanUserName(body.userName),
    at: nowIso(),
  });
  const updated = await getFile(db, id);
  return jsonFor(request, env, { ok: true, file: updated ? publicFile(updated) : null });
}

async function handleDelete(request: Request, env: AiEnv, body: Record<string, unknown>): Promise<Response> {
  const db = await requireDb(env);
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) throw new AiError(400, 'bad_request', '삭제할 파일이 없습니다.');
  const f = await getFile(db, id);
  if (!f) throw new AiError(404, 'not_found', '파일을 찾을 수 없습니다.');
  const actor = cleanUserName(body.userName);
  await ownerOrPin(request, env, body, f.uploaded_by, actor, '본인이 올린 파일만 삭제할 수 있습니다(관리자는 PIN).');
  const at = nowIso();
  // 기록만 지운다 — 본문(R2)은 실수로 지운 경우를 위해 남겨 둔다
  await softDeleteFile(db, id, actor, at);
  await audit(db, 'file_delete', actor, { id, fileName: f.file_name, company: f.company }, await ipHash(request), at).catch(() => {});
  return jsonFor(request, env, { ok: true });
}
