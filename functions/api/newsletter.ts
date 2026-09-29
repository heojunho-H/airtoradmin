// Cloudflare Pages Function — /api/newsletter (스티비 주소록 동기화 브로커)
// 프론트엔드 → 같은 도메인(/api/newsletter) → https://api.stibee.com/v2 로 전달 (API 키 보호).
//
// 경로명에 "stibee"를 쓰지 않은 이유: Cloudflare 무료 플랜 WAF가 새 POST 경로를 403으로
// 차단한 전례가 있어(/api/claude → /api/staffing, 2026-05-28) 중립적인 단어를 택했다.
// 배포 후 이 경로의 POST가 403을 받는지 반드시 확인할 것.
//
// 환경변수 (Cloudflare Pages 대시보드):
//   STIBEE_API_KEY            스티비 워크스페이스 설정 > API 키 (2025-01-21 이후 생성분)
//   STIBEE_LIST_ID            대상 주소록 ID (스티비 URL의 /lists/{id})
//   NEWSLETTER_WEBHOOK_SECRET 웹훅 수신 토큰 — functions/api/newsletter/webhook.ts 참조
//   ALLOWED_ORIGIN            CORS 허용 오리진 (기본 https://airtoradmin.pages.dev)
//
// 요청 (POST, JSON):
//   { action: 'sync', subscribers: [{ email, status, marketingAllowed, fields }] }
//     → 1,000명 단위로 POST /lists/{id}/subscribers/batch (updateEnabled: true)
//     → { ok, sent, result: StibeeBatchResult }
//   { action: 'unsubscribe', email }
//     → POST /lists/{id}/subscribers/{email}/unsubscribe
// 요청 (GET):
//   ?action=status  → /auth-check + /lists/{id}/subscribers/count 로 연결 상태 확인
//
// 수신동의(marketingAllowed)는 우리 DB에서 관리하지 않는다 (사용자 결정 2026-09-29).
// 프론트가 항상 false로 보내고, 동의 관리는 스티비 UI에서 한다.

import {
  BATCH_MAX,
  STIBEE_BASE_URL,
  chunk,
  jsonResponse,
  mergeBatchResults,
  parseStibeeResponse,
  stibeeHeaders,
  type StibeeBatchResult,
  type StibeeEnv,
  type StibeeSubscriberInput,
} from '../_lib/stibee';

type Env = StibeeEnv;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getOrigin(env: Env): string {
  return env.ALLOWED_ORIGIN || 'https://airtoradmin.pages.dev';
}

function missingConfig(env: Env): string | null {
  if (!env.STIBEE_API_KEY) return 'STIBEE_API_KEY not configured';
  if (!env.STIBEE_LIST_ID) return 'STIBEE_LIST_ID not configured';
  return null;
}

// 프론트에서 온 구독자 배열을 스티비 스키마로 정제. 이메일 형식이 틀리거나 status가
// 허용값이 아니면 제외한다 (스티비가 400으로 전체 요청을 거부하는 것을 예방).
function sanitizeSubscribers(raw: unknown): { valid: StibeeSubscriberInput[]; dropped: string[] } {
  const valid: StibeeSubscriberInput[] = [];
  const dropped: string[] = [];
  if (!Array.isArray(raw)) return { valid, dropped };
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const email = String((item as { email?: unknown }).email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 64) {
      dropped.push(email || '(empty)');
      continue;
    }
    if (seen.has(email)) continue; // 요청 내 중복은 failDuplicatedEmails로 튕기므로 미리 제거
    seen.add(email);
    const status = (item as { status?: unknown }).status === 'unsubscribed' ? 'unsubscribed' : 'subscribed';
    const fieldsRaw = (item as { fields?: unknown }).fields;
    const fields: Record<string, string | number> = {};
    if (fieldsRaw && typeof fieldsRaw === 'object') {
      for (const [k, v] of Object.entries(fieldsRaw as Record<string, unknown>)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue; // 스티비 필드 키는 영문
        if (typeof v === 'number') fields[k] = v;
        else if (v !== null && v !== undefined) fields[k] = String(v);
      }
    }
    valid.push({
      email,
      status,
      marketingAllowed: (item as { marketingAllowed?: unknown }).marketingAllowed === true,
      fields,
    });
  }
  return { valid, dropped };
}

async function handleSync(env: Env, subscribersRaw: unknown): Promise<Response> {
  const origin = getOrigin(env);
  const { valid, dropped } = sanitizeSubscribers(subscribersRaw);
  if (valid.length === 0) {
    return jsonResponse({ ok: false, error: '전송할 유효한 구독자가 없습니다', dropped }, 400, origin);
  }

  let merged: StibeeBatchResult = {};
  const errors: { chunk: number; status: number; body: unknown }[] = [];
  const chunks = chunk(valid, BATCH_MAX);

  for (let i = 0; i < chunks.length; i++) {
    const res = await fetch(`${STIBEE_BASE_URL}/lists/${encodeURIComponent(env.STIBEE_LIST_ID)}/subscribers/batch`, {
      method: 'POST',
      headers: stibeeHeaders(env.STIBEE_API_KEY),
      body: JSON.stringify({ subscribers: chunks[i], updateEnabled: true }),
    });
    const body = await parseStibeeResponse(res);
    if (!res.ok) {
      errors.push({ chunk: i, status: res.status, body });
      continue;
    }
    merged = mergeBatchResults(merged, (body || {}) as StibeeBatchResult);
  }

  const ok = errors.length === 0;
  return jsonResponse(
    { ok, sent: valid.length, dropped, result: merged, errors: ok ? undefined : errors },
    ok ? 200 : 502,
    origin,
  );
}

async function handleUnsubscribe(env: Env, emailRaw: unknown): Promise<Response> {
  const origin = getOrigin(env);
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return jsonResponse({ ok: false, error: '이메일 형식이 올바르지 않습니다' }, 400, origin);
  }
  const res = await fetch(
    `${STIBEE_BASE_URL}/lists/${encodeURIComponent(env.STIBEE_LIST_ID)}/subscribers/${encodeURIComponent(email)}/unsubscribe`,
    { method: 'POST', headers: stibeeHeaders(env.STIBEE_API_KEY) },
  );
  const body = await parseStibeeResponse(res);
  return jsonResponse({ ok: res.ok, email, result: body }, res.ok ? 200 : 502, origin);
}

async function handleStatus(env: Env): Promise<Response> {
  const origin = getOrigin(env);
  const headers = stibeeHeaders(env.STIBEE_API_KEY);
  const listId = encodeURIComponent(env.STIBEE_LIST_ID);

  const [authRes, countRes] = await Promise.all([
    fetch(`${STIBEE_BASE_URL}/auth-check`, { headers }),
    fetch(`${STIBEE_BASE_URL}/lists/${listId}/subscribers/count`, { headers }),
  ]);
  const count = await parseStibeeResponse(countRes);
  return jsonResponse(
    {
      ok: authRes.ok && countRes.ok,
      auth: authRes.ok,
      listId: env.STIBEE_LIST_ID,
      count: countRes.ok ? count : null,
      error: !authRes.ok ? 'auth-check failed' : !countRes.ok ? count : undefined,
    },
    authRes.ok && countRes.ok ? 200 : 502,
    origin,
  );
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const env = context.env;
  const origin = getOrigin(env);
  const cfgError = missingConfig(env);
  if (cfgError) return jsonResponse({ ok: false, error: cfgError }, 500, origin);

  let payload: { action?: string; subscribers?: unknown; email?: unknown };
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
  }

  try {
    switch (payload.action) {
      case 'sync':
        return await handleSync(env, payload.subscribers);
      case 'unsubscribe':
        return await handleUnsubscribe(env, payload.email);
      default:
        return jsonResponse({ ok: false, error: `Unknown action: ${String(payload.action)}` }, 400, origin);
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }, 502, origin);
  }
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env;
  const origin = getOrigin(env);
  const cfgError = missingConfig(env);
  if (cfgError) return jsonResponse({ ok: false, error: cfgError }, 500, origin);

  const action = new URL(context.request.url).searchParams.get('action');
  if (action !== 'status') {
    return jsonResponse({ ok: false, error: 'Unsupported GET action' }, 400, origin);
  }
  try {
    return await handleStatus(env);
  } catch (err) {
    return jsonResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }, 502, origin);
  }
};

export const onRequestOptions: PagesFunction<Env> = async (context) => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': getOrigin(context.env),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
