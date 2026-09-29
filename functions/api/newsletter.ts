// Cloudflare Pages Function — /api/newsletter (스티비 주소록 동기화 + 팔로업 자동 발송 브로커)
// 프론트엔드/GitHub Actions → 같은 도메인(/api/newsletter) → 스티비 API 로 전달 (API 키 보호).
//
// 경로명에 "stibee"를 쓰지 않은 이유: Cloudflare 무료 플랜 WAF가 새 POST 경로를 403으로
// 차단한 전례가 있어(/api/claude → /api/staffing, 2026-05-28) 중립적인 단어를 택했다.
// 같은 이유로 새 기능도 새 경로 대신 이 엔드포인트의 action 으로 추가한다.
//
// 환경변수 (Cloudflare Pages 대시보드):
//   STIBEE_API_KEY            스티비 워크스페이스 설정 > API 키 (2025-01-21 이후 생성분)
//   STIBEE_LIST_ID            대상 주소록 ID (스티비 URL의 /lists/{id})
//   NEWSLETTER_WEBHOOK_SECRET 웹훅 수신 토큰 — functions/api/newsletter/webhook.ts 참조
//   NEWSLETTER_FOLLOWUPS      팔로업 단계 설정 JSON — functions/_lib/followups.ts 참조
//   NEWSLETTER_CRON_SECRET    run-followups 실제 실행 토큰 (GitHub Secrets와 동일 값)
//   ALLOWED_ORIGIN            CORS 허용 오리진 (기본 https://airtoradmin.pages.dev)
//
// 요청 (POST, JSON):
//   { action: 'sync', subscribers: [{ email, status, marketingAllowed, fields }] }
//     → 1,000명 단위로 POST /lists/{id}/subscribers/batch (updateEnabled: true)
//   { action: 'unsubscribe', email }
//     → POST /lists/{id}/subscribers/{email}/unsubscribe
//   { action: 'run-followups', dryRun?: boolean, limit?: number }
//     → 최근 작업일 기준 단계별 팔로업 발송 (스티비 자동 이메일 "API 직접 요청" 트리거)
//     → dryRun:true 는 토큰 없이 허용(읽기 전용). 실제 실행은 헤더 X-Newsletter-Cron-Token 필수.
// 요청 (GET):
//   ?action=status  → /auth-check + /lists/{id}/subscribers/count 로 연결 상태 확인
//   ?action=config  → 팔로업 단계 설정(autoEmailId 제외) — 프론트 예정일 표시용
//
// 수신동의(marketingAllowed)는 우리 DB에서 관리하지 않는다 (사용자 결정 2026-09-29).
// 프론트가 항상 false로 보내고, 동의 관리는 스티비 UI에서 한다.

import {
  BATCH_MAX,
  CUSTOMERS_API,
  STIBEE_AUTO_URL,
  STIBEE_BASE_URL,
  chunk,
  jsonResponse,
  mergeBatchResults,
  parseStibeeResponse,
  sleep,
  stibeeHeaders,
  type StibeeBatchResult,
  type StibeeEnv,
  type StibeeSubscriberInput,
} from '../_lib/stibee';
import {
  applyResult,
  computeDue,
  parseFollowupConfig,
  todayKst,
  type CustomerRow,
  type DueItem,
  type RecipientResult,
  type SkipItem,
} from '../_lib/followups';

type Env = StibeeEnv;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 한 번의 실행에서 보낼 최대 트리거 수(담당자 단위). Cloudflare 무료 플랜의 요청당 서브리퀘스트 한도(50)를
// 고객 조회 1 + upsert 1 + 트리거 N + 고객별 (재조회 + PUT) 2 이내로 맞추기 위한 값.
// 넘치는 대상은 deferred 로 보고되고 다음 날(유예 기간 내) 처리된다.
const MAX_TRIGGERS_PER_RUN = 15;
const TRIGGER_INTERVAL_MS = 350; // 스티비 자동 이메일 API 3회/초 제한

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

// 구독자 대량 추가/갱신 — 수동 동기화(sync)와 팔로업 러너가 공용으로 사용
async function batchUpsert(
  env: Env,
  subscribers: StibeeSubscriberInput[],
): Promise<{ result: StibeeBatchResult; errors: { chunk: number; status: number; body: unknown }[] }> {
  let merged: StibeeBatchResult = {};
  const errors: { chunk: number; status: number; body: unknown }[] = [];
  const chunks = chunk(subscribers, BATCH_MAX);
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
  return { result: merged, errors };
}

async function handleSync(env: Env, subscribersRaw: unknown): Promise<Response> {
  const origin = getOrigin(env);
  const { valid, dropped } = sanitizeSubscribers(subscribersRaw);
  if (valid.length === 0) {
    return jsonResponse({ ok: false, error: '전송할 유효한 구독자가 없습니다', dropped }, 400, origin);
  }
  const { result, errors } = await batchUpsert(env, valid);
  const ok = errors.length === 0;
  return jsonResponse(
    { ok, sent: valid.length, dropped, result, errors: ok ? undefined : errors },
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

// 팔로업 단계 설정 공개 (autoEmailId 제외) — 프론트가 리마인드 예정일 표시에 사용
function handleConfig(env: Env): Response {
  const origin = getOrigin(env);
  const parsed = parseFollowupConfig(env.NEWSLETTER_FOLLOWUPS);
  if (!parsed.ok) {
    if ('disabled' in parsed) return jsonResponse({ ok: false, disabled: true }, 200, origin);
    return jsonResponse({ ok: false, error: parsed.error }, 500, origin);
  }
  return jsonResponse(
    {
      ok: true,
      stages: parsed.config.stages.map((s) => ({ stage: s.stage, days: s.days, label: s.label })),
      grace: parsed.config.grace,
    },
    200,
    origin,
  );
}

async function fetchCustomers(): Promise<CustomerRow[]> {
  const res = await fetch(CUSTOMERS_API, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let json: { data?: CustomerRow[] };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`customers_api 응답이 JSON이 아닙니다 (HTTP ${res.status})`);
  }
  if (!res.ok || !Array.isArray(json.data)) throw new Error(`customers_api 조회 실패 (HTTP ${res.status})`);
  return json.data;
}

// 트리거 API 호출 1건. 200 OK가 실제 발송을 보장하지는 않는다 (수신거부·주소록 미포함이면 조용히 무시됨).
async function triggerAutoEmail(env: Env, item: DueItem, email: string, name: string): Promise<RecipientResult> {
  try {
    const res = await fetch(`${STIBEE_AUTO_URL}/${encodeURIComponent(item.autoEmailId)}`, {
      method: 'POST',
      headers: stibeeHeaders(env.STIBEE_API_KEY),
      body: JSON.stringify({
        subscriber: email,
        name,
        company: item.company,
        project_name: item.projectName,
        last_work_date: item.workDate,
        total_quantity: String(item.totalQuantity),
        quotation_amount: String(item.quotationAmount),
      }),
    });
    if (res.ok) return { email, ok: true };
    const body = await parseStibeeResponse(res);
    return { email, ok: false, error: `HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}` };
  } catch (err) {
    return { email, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

interface RunOptions {
  dryRun: boolean;
  limit?: number;
}

async function handleRunFollowups(env: Env, opts: RunOptions): Promise<Response> {
  const origin = getOrigin(env);
  const parsed = parseFollowupConfig(env.NEWSLETTER_FOLLOWUPS);
  if (!parsed.ok) {
    if ('disabled' in parsed) return jsonResponse({ ok: true, disabled: true, note: 'NEWSLETTER_FOLLOWUPS 미설정 — 아무 것도 하지 않음' }, 200, origin);
    return jsonResponse({ ok: false, error: parsed.error }, 500, origin);
  }
  const cfg = parsed.config;
  const today = todayKst();
  const configOut = { stages: cfg.stages.map((s) => ({ stage: s.stage, days: s.days, label: s.label })), grace: cfg.grace };

  const customers = await fetchCustomers();
  const { due, skipped } = computeDue(customers, cfg, today);

  // 트리거 수(담당자 단위) 기준으로 절단
  const cap = Math.max(1, Math.min(opts.limit ?? MAX_TRIGGERS_PER_RUN, MAX_TRIGGERS_PER_RUN));
  const selected: DueItem[] = [];
  let triggerCount = 0;
  for (const item of due) {
    if (triggerCount + item.recipients.length > cap && selected.length > 0) break;
    selected.push(item);
    triggerCount += item.recipients.length;
    if (triggerCount >= cap) break;
  }
  const deferred = due.slice(selected.length).map((d) => ({ customerId: d.customerId, company: d.company, stage: d.stage, dueDate: d.dueDate, recipients: d.recipients.length }));

  const skippedSummary: Record<string, number> = {};
  for (const s of skipped) skippedSummary[s.reason] = (skippedSummary[s.reason] || 0) + 1;

  const dueOut = selected.map((d) => ({
    customerId: d.customerId, company: d.company, stage: d.stage, label: d.label, workDate: d.workDate, dueDate: d.dueDate,
    projectName: d.projectName, recipients: d.recipients.map((r) => r.email), supersededStages: d.supersededStages,
  }));

  if (opts.dryRun) {
    return jsonResponse(
      { ok: true, dryRun: true, today, config: configOut, evaluated: customers.length, due: dueOut, deferred, skippedSummary, skipped: skipped as SkipItem[] },
      200,
      origin,
    );
  }

  const sent: { customerId: number; company: string; stage: number; recipient: string }[] = [];
  const failed: { customerId: number; company: string; stage: number; recipient: string; error: string }[] = [];
  const errors: string[] = [];

  if (selected.length > 0) {
    // 1) 대상 담당자를 주소록에 upsert — 주소록에 없으면 트리거가 조용히 무시되므로 필수
    const byCustomer = new Map<number, CustomerRow>();
    for (const c of customers) byCustomer.set(c.id, c);
    const upsertPayload: StibeeSubscriberInput[] = [];
    const seen = new Set<string>();
    for (const item of selected) {
      const c = byCustomer.get(item.customerId);
      for (const r of item.recipients) {
        if (seen.has(r.email)) continue;
        seen.add(r.email);
        upsertPayload.push({
          email: r.email,
          status: 'subscribed',
          marketingAllowed: false,
          fields: {
            name: r.name, position: r.position, company: item.company,
            grade: c?.grade || '', customer_status: c?.customerStatus || '',
            account_manager: c?.accountManager || '', last_work_date: c?.lastWorkDate || item.workDate,
          },
        });
      }
    }
    const upsert = await batchUpsert(env, upsertPayload);
    if (upsert.errors.length > 0) errors.push(`주소록 upsert 실패: ${JSON.stringify(upsert.errors).slice(0, 300)}`);
    const rejected = new Set<string>();
    const r = upsert.result;
    for (const list of [r.failNoEmails, r.failInvalidEmails, r.failDuplicatedEmails, r.failInvalidFields, r.failInvalidSubscriberStatus]) {
      for (const e of list || []) rejected.add(e.toLowerCase());
    }

    // 2) 고객별 트리거 → 즉시 재조회 → PUT (장부 기록). 고객 단위로 바로 기록해 발송/기록 간 창을 최소화.
    for (const item of selected) {
      const results: RecipientResult[] = [];
      for (const rcpt of item.recipients) {
        if (rejected.has(rcpt.email)) {
          results.push({ email: rcpt.email, ok: false, error: '주소록 upsert 거부' });
          continue;
        }
        results.push(await triggerAutoEmail(env, item, rcpt.email, rcpt.name));
        await sleep(TRIGGER_INTERVAL_MS);
      }
      for (const res of results) {
        if (res.ok) sent.push({ customerId: item.customerId, company: item.company, stage: item.stage, recipient: res.email });
        else failed.push({ customerId: item.customerId, company: item.company, stage: item.stage, recipient: res.email, error: res.error || '' });
      }

      try {
        const fresh = (await fetchCustomers()).find((c) => c.id === item.customerId);
        if (!fresh) {
          errors.push(`고객 ${item.customerId}(${item.company}) 재조회 실패 — 장부 미기록 (다음 실행에서 재발송될 수 있음)`);
          continue;
        }
        const applied = applyResult(fresh, item, results, today);
        const body: Record<string, unknown> = { id: item.customerId, emailHistory: applied.emailHistory };
        if (applied.workHistory) body.workHistory = applied.workHistory;
        else errors.push(`고객 ${item.customerId}(${item.company}) 작업 항목 ${item.jobKey} 을 찾지 못함 — 장부만 기록`);
        const putRes = await fetch(CUSTOMERS_API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!putRes.ok) errors.push(`고객 ${item.customerId}(${item.company}) PUT 실패 HTTP ${putRes.status} — 장부 미기록`);
      } catch (err) {
        errors.push(`고객 ${item.customerId}(${item.company}) 기록 중 예외: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return jsonResponse(
    { ok: errors.length === 0, dryRun: false, today, config: configOut, evaluated: customers.length, sent, failed, deferred, skippedSummary, errors },
    200,
    origin,
  );
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const env = context.env;
  const origin = getOrigin(env);
  const cfgError = missingConfig(env);
  if (cfgError) return jsonResponse({ ok: false, error: cfgError }, 500, origin);

  let payload: { action?: string; subscribers?: unknown; email?: unknown; dryRun?: unknown; limit?: unknown; token?: unknown };
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
      case 'run-followups': {
        const dryRun = payload.dryRun === true;
        if (!dryRun) {
          const token = context.request.headers.get('X-Newsletter-Cron-Token') || (typeof payload.token === 'string' ? payload.token : '');
          if (!env.NEWSLETTER_CRON_SECRET) return jsonResponse({ ok: false, error: 'NEWSLETTER_CRON_SECRET not configured' }, 500, origin);
          if (!token || token !== env.NEWSLETTER_CRON_SECRET) return jsonResponse({ ok: false, error: 'unauthorized' }, 401, origin);
        }
        const limit = typeof payload.limit === 'number' && Number.isInteger(payload.limit) && payload.limit > 0 ? payload.limit : undefined;
        return await handleRunFollowups(env, { dryRun, limit });
      }
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
  const action = new URL(context.request.url).searchParams.get('action');

  if (action === 'config') return handleConfig(env); // 스티비 키 없이도 조회 가능

  const cfgError = missingConfig(env);
  if (cfgError) return jsonResponse({ ok: false, error: cfgError }, 500, origin);
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
      'Access-Control-Allow-Headers': 'Content-Type, X-Newsletter-Cron-Token',
    },
  });
};
