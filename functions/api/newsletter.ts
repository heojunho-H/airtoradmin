// Cloudflare Pages Function — /api/newsletter (스티비 주소록 동기화 + 리마인드 메일 자동 발송)
// 프론트엔드/GitHub Actions → 같은 도메인(/api/newsletter) → 스티비 API(주소록) · 네이버웍스 메일 API(리마인드).
//
// 경로명에 "stibee"를 쓰지 않은 이유: Cloudflare 무료 플랜 WAF가 새 POST 경로를 403으로
// 차단한 전례가 있어(/api/claude → /api/staffing, 2026-05-28) 중립적인 단어를 택했다.
// 같은 이유로 새 기능도 새 경로 대신 이 엔드포인트의 action 으로 추가한다.
//
// 환경변수 (Cloudflare Pages 대시보드):
//   STIBEE_API_KEY            스티비 워크스페이스 설정 > API 키 (주소록 동기화·수신거부)
//   STIBEE_LIST_ID            대상 주소록 ID (스티비 URL의 /lists/{id})
//   NEWSLETTER_WEBHOOK_SECRET 웹훅 수신 토큰 — functions/api/newsletter/webhook.ts 참조
//   NEWSLETTER_FOLLOWUPS      리마인드 단계 설정 JSON — functions/_lib/followups.ts 참조
//   NEWSLETTER_CRON_SECRET    run-followups 실제 실행 토큰 (GitHub Secrets와 동일 값). 수신거부 링크 서명 키도 겸한다
//   WORKS_CLIENT_ID·WORKS_CLIENT_SECRET  네이버웍스 개발자 콘솔 앱 — functions/_lib/works.ts
//   ALLOWED_ORIGIN            CORS 허용 오리진 (기본 https://airtoradmin.pages.dev)
//   MOU_BASE_URL              협약서·수신거부 링크 앞부분 (기본 https://docs.airtor.co.kr) — docs/mou.md
//
// 요청 (POST, JSON):
//   { action: 'sync', subscribers: [{ email, status, fields }] }
//     → 1,000명 단위로 POST /lists/{id}/subscribers/batch (updateEnabled: true)
//   { action: 'unsubscribe', email }                         ← 크론 토큰 필수 (화면에서 쓰지 않음)
//   { action: 'run-followups', dryRun?: boolean, limit?: number }
//     → 최근 작업일 기준 단계별 리마인드 메일을 고객 담당 매니저의 네이버웍스 계정으로 보낸다 (docs/remind-mails.md)
//     → dryRun:true 는 토큰 없이 허용(읽기 전용, 수신자 이메일은 가린다). 실제 실행은 헤더 X-Newsletter-Cron-Token 필수.
//     → 담당자가 아직 연결되지 않았으면 그 고객은 기다린다(waiting, 장부 기록 없음 — 유예 기간 안에 연결하면 나간다).
//     → B1(협약서) 단계는 실제 실행에서만 고객별 협약서 링크를 D1 에 만든다. 못 만들면 그 고객은 다음 날로 미룬다.
//   { action: 'test-send', sender, mail? }                   ← 받는 주소는 relation@airtor.co.kr 고정, 하루 20통
//     → 연결된 담당자 계정으로 견본 값 메일을 보낸다 (고객 장부는 건드리지 않음)
// 요청 (GET):
//   ?action=status  → 스티비 /auth-check + 주소록 구독자 수
//   ?action=config  → 리마인드 단계 설정 — 프론트 예정일 표시용
//
// 수신동의(marketingAllowed)는 보내지 않는다 (2026-11-10). 스티비에서 받은 광고 동의를 덮어쓰지 않도록 키 자체를 뺀다.

import { normalizeCompanyName } from '../../src/lib/company';
import {
  BATCH_MAX,
  CUSTOMERS_API,
  DEALS_API,
  MANAGERS_API,
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
  DEFAULT_MANAGER,
  addDays,
  applyResult,
  computeDue,
  parseFollowupConfig,
  todayKst,
  type CustomerRow,
  type DueItem,
  type RecipientResult,
} from '../_lib/followups';
import { issueMouLink, mouBaseUrl, type MouEnv } from '../_lib/mou';
import { REMIND_MAIL_KEYS, isRemindMailKey, renderRemindMail, type RemindMailKey, type RemindSender } from '../_lib/remind-mails';
import { TEST_RECIPIENT, WORKS_DOMAIN, listConnections, refreshStaleTokens, sendWorksMail, takeTestQuota, worksConfigured, type WorksEnv } from '../_lib/works';
import { optoutUrl, type OptoutEnv } from '../_lib/optout';

type Env = StibeeEnv & MouEnv & WorksEnv & OptoutEnv;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 한 번의 실행에서 보낼 최대 메일 수(받는 사람 단위). 하루에 너무 많이 몰리지 않게 하는 상한이다.
// 넘치는 대상은 deferred 로 보고되고 다음 날(유예 기간 내) 처리된다.
const MAX_SENDS_PER_RUN = 15;
const SEND_INTERVAL_MS = 300; // 네이버웍스 API 분당 240회 — 넉넉히 띄운다

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
    // marketingAllowed는 받지도 보내지도 않는다 — 로그인 없는 엔드포인트로 남의 광고 동의를 켜거나 지우지 못하게
    valid.push({ email, status, fields });
  }
  return { valid, dropped };
}

// 미리보기 응답용 이메일 가림: manager@airtor.co.kr → m***@airtor.co.kr
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

// 진행 중 딜(성공여부 '진행중' + 신규~일정조율)이 있는 회사 — 그 회사에는 팔로업을 보내지 않는다
const OPEN_DEAL_STATUSES = new Set(['new', 'call', 'quote-sent', 'quote-call', 'price-negotiation', 'schedule']);

async function fetchOpenDealCompanies(): Promise<Set<string>> {
  const res = await fetch(DEALS_API, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let json: { data?: { company?: string; status?: string; successStatus?: string }[] };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`deals_api 응답이 JSON이 아닙니다 (HTTP ${res.status})`);
  }
  if (!res.ok || !Array.isArray(json.data)) throw new Error(`deals_api 조회 실패 (HTTP ${res.status})`);
  const out = new Set<string>();
  for (const d of json.data) {
    if (d?.successStatus !== 'in-progress' || !OPEN_DEAL_STATUSES.has(String(d.status))) continue;
    const key = normalizeCompanyName(d.company);
    if (key) out.add(key);
  }
  return out;
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

// 리마인드 단계 설정 공개 — 프론트가 리마인드 예정일 표시에 사용
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
      stages: parsed.config.stages.map((s) => ({ stage: s.stage, days: s.days, label: s.label, mail: s.mail, altDays: s.altDays, altWorkMonths: s.altWorkMonths, mou: s.mou })),
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

// 담당 매니저 목록 (managers_api.php) — 리마인드 메일을 보낼 계정과 서명(이름·직급·휴대폰·메일)
export interface ManagerRow {
  name: string;
  position: string;
  email: string;
  phone: string;
  status: string;
}

async function fetchManagers(): Promise<ManagerRow[]> {
  const res = await fetch(MANAGERS_API, { headers: { Accept: 'application/json' } });
  let json: { data?: Record<string, unknown>[] };
  try {
    json = JSON.parse(await res.text());
  } catch {
    throw new Error(`managers_api 응답이 JSON이 아닙니다 (HTTP ${res.status})`);
  }
  if (!res.ok || !Array.isArray(json.data)) throw new Error(`managers_api 조회 실패 (HTTP ${res.status})`);
  return json.data
    .map((m) => ({
      name: String(m?.name ?? '').trim(),
      position: String(m?.position ?? '').trim(),
      email: String(m?.email ?? '').trim().toLowerCase(),
      phone: String(m?.phone ?? '').trim(),
      status: String(m?.status ?? 'active'),
    }))
    .filter((m) => m.name);
}

// 이름으로 매니저 찾기 — 정확히 같은 이름, 없으면 첫 단어. 휴직(leave)은 뺀다.
function findManager(name: string | undefined, managers: ManagerRow[]): ManagerRow | null {
  const n = (name || '').trim();
  if (!n || n === DEFAULT_MANAGER) return null;
  const pool = managers.filter((m) => m.status !== 'leave');
  return pool.find((m) => m.name === n) ?? pool.find((m) => m.name === n.split(/\s+/)[0]) ?? null;
}

// 보낼 네이버웍스 계정 — managers 데이터의 메일이 회사 메일이면 그것, 아니면(개인 메일 등) 같은 이름으로 연결된 계정
function worksEmailFor(m: ManagerRow, conns: { email: string; name: string }[]): string | null {
  if (m.email.endsWith(`@${WORKS_DOMAIN}`)) return m.email;
  const key = m.name.replace(/\s+/g, '');
  return conns.find((c) => c.name.replace(/\s+/g, '') === key)?.email ?? null;
}

const toSender = (m: ManagerRow, conns: { email: string; name: string }[]): RemindSender => ({
  name: m.name, position: m.position, email: worksEmailFor(m, conns) ?? m.email, phone: m.phone,
});

/** 고객 담당 매니저 → 보낼 사람. 담당이 없거나 찾지 못하면(휴직 포함) fallbackManager(설정), 그것도 없으면 null.
 *  담당자는 정해졌지만 네이버웍스 계정이 아직 연결되지 않았으면 그 담당자로 두고(연결 대기) 대신 보내지 않는다. */
export function pickSender(
  managerName: string,
  managers: ManagerRow[],
  fallbackName?: string,
  conns: { email: string; name: string }[] = [],
): { sender: RemindSender; fallback: boolean } | null {
  const own = findManager(managerName, managers);
  if (own) return { sender: toSender(own, conns), fallback: false };
  const fb = findManager(fallbackName, managers);
  if (fb) return { sender: toSender(fb, conns), fallback: true };
  return null;
}

interface RunOptions {
  dryRun: boolean;
  limit?: number;
}

type Brief = { customerId: number; company: string; stage: number; dueDate: string; recipients: number };
const brief = (d: DueItem): Brief => ({ customerId: d.customerId, company: d.company, stage: d.stage, dueDate: d.dueDate, recipients: d.recipients.length });

async function handleRunFollowups(env: Env, opts: RunOptions): Promise<Response> {
  const origin = getOrigin(env);
  const parsed = parseFollowupConfig(env.NEWSLETTER_FOLLOWUPS);
  if (!parsed.ok) {
    if ('disabled' in parsed) return jsonResponse({ ok: true, disabled: true, note: 'NEWSLETTER_FOLLOWUPS 미설정 — 아무 것도 하지 않음' }, 200, origin);
    return jsonResponse({ ok: false, error: parsed.error }, 500, origin);
  }
  const cfg = parsed.config;
  const today = todayKst();
  const configOut = { stages: cfg.stages.map((s) => ({ stage: s.stage, days: s.days, label: s.label, mail: s.mail, mou: s.mou })), grace: cfg.grace };

  const customers = await fetchCustomers();
  // 진행 중 딜 목록 — 실제 실행에서 못 읽으면 보내지 않는다(상담 중인 회사에 엉뚱한 메일이 가지 않게)
  let openDealCompanies = new Set<string>();
  const warnings: string[] = [];
  try {
    openDealCompanies = await fetchOpenDealCompanies();
  } catch (err) {
    const msg = `진행 중 딜 조회 실패: ${err instanceof Error ? err.message : String(err)}`;
    if (!opts.dryRun) return jsonResponse({ ok: false, error: `${msg} — 발송하지 않음` }, 502, origin);
    warnings.push(msg);
  }
  const { due, skipped } = computeDue(customers, cfg, today, { openDealCompanies });

  // 보낼 사람(담당 매니저 계정) — 목록을 못 읽으면 실제 실행은 멈춘다
  let managers: ManagerRow[] = [];
  try {
    managers = await fetchManagers();
  } catch (err) {
    const msg = `담당 매니저 목록 조회 실패: ${err instanceof Error ? err.message : String(err)}`;
    if (!opts.dryRun) return jsonResponse({ ok: false, error: `${msg} — 발송하지 않음` }, 502, origin);
    warnings.push(msg);
  }
  const errors: string[] = [];
  if (!opts.dryRun) {
    if (!worksConfigured(env)) return jsonResponse({ ok: false, error: '네이버웍스 연동 설정(WORKS_CLIENT_ID·WORKS_CLIENT_SECRET)이 없습니다 — 발송하지 않음' }, 500, origin);
    const refresh = await refreshStaleTokens(env);
    if (refresh.failed.length > 0) errors.push(`토큰 갱신 실패 — 다시 연결 필요: ${refresh.failed.join(', ')}`);
  }
  const conns = worksConfigured(env) ? await listConnections(env).catch(() => []) : [];
  const connected = new Set(conns.filter((c) => !c.lastError).map((c) => c.email));

  // 연결된 담당자 계정으로 보낼 수 있는 대상만 상한 안에서 고른다. 나머지는 기다린다(waiting).
  const annotated = due.map((d) => ({ d, picked: pickSender(d.manager, managers, cfg.fallbackManager, conns) }));
  const waiting = annotated
    .filter((a) => !a.picked || !connected.has(a.picked.sender.email))
    .map((a) => ({ ...brief(a.d), reason: a.picked ? 'not-connected' : 'no-sender', sender: a.picked ? a.picked.sender.name : null }));
  const sendable = annotated.filter((a) => a.picked && connected.has(a.picked.sender.email));
  const cap = Math.max(1, Math.min(opts.limit ?? MAX_SENDS_PER_RUN, MAX_SENDS_PER_RUN));
  const selected: typeof sendable = [];
  let mailCount = 0;
  for (const a of sendable) {
    if (mailCount + a.d.recipients.length > cap && selected.length > 0) break;
    selected.push(a);
    mailCount += a.d.recipients.length;
    if (mailCount >= cap) break;
  }
  const deferred = sendable.slice(selected.length).map((a) => brief(a.d));

  const skippedSummary: Record<string, number> = {};
  for (const s of skipped) skippedSummary[s.reason] = (skippedSummary[s.reason] || 0) + 1;

  if (opts.dryRun) {
    // 로그인 없이 열리는 미리보기라 수신자 이메일은 가리고, 고객별 건너뜀 목록은 요약만 보낸다
    const senderOut = (p: { sender: RemindSender; fallback: boolean } | null) =>
      p ? { name: `${p.sender.name} ${p.sender.position}`.trim(), connected: connected.has(p.sender.email), fallback: p.fallback } : null;
    const dueOut = selected.map(({ d, picked }) => ({
      customerId: d.customerId, company: d.company, stage: d.stage, label: d.label, mail: d.mail, workDate: d.workDate, dueDate: d.dueDate,
      projectName: d.projectName, recipients: d.recipients.map((r) => maskEmail(r.email)), supersededStages: d.supersededStages, mou: d.mou,
      sender: senderOut(picked),
    }));
    const senders = new Map<string, { name: string; connected: boolean; customers: number }>();
    for (const a of annotated) {
      const key = a.picked ? a.picked.sender.email : '';
      const cur = senders.get(key) || { name: a.picked ? `${a.picked.sender.name} ${a.picked.sender.position}`.trim() : '(보낼 사람 없음)', connected: a.picked ? connected.has(a.picked.sender.email) : false, customers: 0 };
      cur.customers++;
      senders.set(key, cur);
    }
    return jsonResponse(
      {
        ok: true, dryRun: true, today, config: configOut, evaluated: customers.length, due: dueOut, deferred, waiting, skippedSummary,
        mouLinks: selected.filter((a) => a.d.mou).length, senders: [...senders.values()], worksConfigured: worksConfigured(env), warnings,
      },
      200,
      origin,
    );
  }

  const sent: { customerId: number; company: string; stage: number; recipient: string; sender: string }[] = [];
  const failed: { customerId: number; company: string; stage: number; recipient: string; error: string }[] = [];
  const mouIssued: { customerId: number; mode: string; reused: boolean }[] = [];
  const mouDeferred: Brief[] = [];

  for (const { d: item, picked } of selected) {
    const sender = (picked as { sender: RemindSender }).sender;
    // 협약서 단계: 링크를 먼저 만든다. 못 만들면 링크 없는 메일이 나가지 않게 이 고객은 다음 날로 미룬다(장부 기록 없음).
    let mouUrl: string | undefined;
    if (item.mou) {
      try {
        const link = await issueMouLink(
          env,
          {
            customerId: item.customerId, jobKey: item.jobKey, company: item.company, workDate: item.workDate, dealId: item.dealId,
            detailedQuantity: item.detailedQuantity, totalQuantity: item.totalQuantity, quotationAmount: item.quotationAmount,
            manager: { name: sender.name, position: sender.position },
          },
          today,
        );
        mouUrl = link.url;
        mouIssued.push({ customerId: item.customerId, mode: link.mode, reused: link.reused });
      } catch (err) {
        errors.push(`고객 ${item.customerId}(${item.company}) 협약서 링크를 만들지 못해 오늘은 보내지 않음: ${err instanceof Error ? err.message : String(err)}`);
        mouDeferred.push(brief(item));
        continue;
      }
    }
    const results: RecipientResult[] = [];
    for (const rcpt of item.recipients) {
      try {
        const mail = renderRemindMail({
          key: item.mail, company: item.company, recipientName: rcpt.name, recipientPosition: rcpt.position, sender,
          workDate: item.workDate, today, equipment: item.equipment, mouUrl, optoutUrl: await optoutUrl(env, item.customerId, rcpt.email),
        });
        const r = await sendWorksMail(env, sender.email, { to: rcpt.email, subject: mail.subject, html: mail.html });
        results.push(r.ok ? { email: rcpt.email, ok: true } : { email: rcpt.email, ok: false, error: r.error });
      } catch (err) {
        results.push({ email: rcpt.email, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
      await sleep(SEND_INTERVAL_MS);
    }
    for (const res of results) {
      if (res.ok) sent.push({ customerId: item.customerId, company: item.company, stage: item.stage, recipient: res.email, sender: sender.name });
      else failed.push({ customerId: item.customerId, company: item.company, stage: item.stage, recipient: res.email, error: res.error || '' });
    }

    try {
      const fresh = (await fetchCustomers()).find((c) => c.id === item.customerId);
      if (!fresh) {
        errors.push(`고객 ${item.customerId}(${item.company}) 재조회 실패 — 장부 미기록 (다음 실행에서 재발송될 수 있음)`);
        continue;
      }
      const applied = applyResult(fresh, item, results, today, sender.email);
      // customers_api_v2: 장부는 덧붙이기, 리마인드 체크는 작업이력 패치 — 그사이 다른 수정(작업일 등)을 덮지 않는다
      const body: Record<string, unknown> = { id: item.customerId, _v: 2, emailHistoryAppend: applied.appended };
      if (applied.entryFound) {
        if (Object.keys(applied.flags).length > 0) body.workHistoryPatch = [{ op: 'update', key: item.jobKey, set: applied.flags }];
      } else {
        errors.push(`고객 ${item.customerId}(${item.company}) 작업 항목 ${item.jobKey} 을 찾지 못함 — 장부만 기록`);
      }
      const putRes = await fetch(CUSTOMERS_API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!putRes.ok) errors.push(`고객 ${item.customerId}(${item.company}) PUT 실패 HTTP ${putRes.status} — 장부 미기록`);
    } catch (err) {
      errors.push(`고객 ${item.customerId}(${item.company}) 기록 중 예외: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return jsonResponse(
    { ok: errors.length === 0, dryRun: false, today, config: configOut, evaluated: customers.length, sent, failed, deferred, waiting, mouIssued, mouDeferred, skippedSummary, errors },
    200,
    origin,
  );
}

// 시험 발송 — 연결된 담당자 계정으로 견본 값 메일을 relation@ 에만 보낸다 (제목 앞 [테스트]). 고객 장부는 건드리지 않는다.
const SAMPLE_DAYS: Record<RemindMailKey, number> = { a2: 45, b1: 200, b2: 335, b3: 395 };

async function handleTestSend(env: Env, senderRaw: unknown, mailRaw: unknown): Promise<Response> {
  const origin = getOrigin(env);
  if (!worksConfigured(env)) return jsonResponse({ ok: false, error: '네이버웍스 연동 설정이 없습니다' }, 400, origin);
  const keys: readonly RemindMailKey[] = mailRaw === undefined || mailRaw === 'all' ? REMIND_MAIL_KEYS : isRemindMailKey(mailRaw) ? [mailRaw] : [];
  if (keys.length === 0) return jsonResponse({ ok: false, error: 'mail 은 a2·b1·b2·b3·all 중 하나' }, 400, origin);
  const want = String(senderRaw || '').trim();
  const managers = await fetchManagers();
  const conns = await listConnections(env);
  const m = managers.find((x) => x.email === want.toLowerCase()) ?? findManager(want, managers);
  if (!m) return jsonResponse({ ok: false, error: '보낼 담당자를 찾지 못했습니다 (이름이나 메일로)' }, 400, origin);
  const sender = toSender(m, conns);
  if (!conns.some((c) => c.email === sender.email && !c.lastError)) {
    return jsonResponse({ ok: false, error: `${m.name} 님 계정이 아직 연결되지 않았습니다 (/api/works/connect)` }, 400, origin);
  }
  const today = todayKst();
  const base = mouBaseUrl(env);
  const results: { mail: RemindMailKey; ok: boolean; error?: string }[] = [];
  for (const key of keys) {
    if (!(await takeTestQuota(env, today))) {
      results.push({ mail: key, ok: false, error: '오늘 시험 발송 한도(20통)를 넘었습니다' });
      break;
    }
    const mail = renderRemindMail({
      key, company: '한빛초등학교', recipientName: '김지현', recipientPosition: '주무관', sender, workDate: addDays(today, -SAMPLE_DAYS[key]), today,
      equipment: '1way 천정형 22대, 4way 천정형 2대', mouUrl: `${base}/mou/sample`, optoutUrl: `${base}/optout?c=0`,
    });
    const r = await sendWorksMail(env, sender.email, { to: TEST_RECIPIENT, subject: `[테스트] ${mail.subject}`, html: mail.html });
    results.push(r.ok ? { mail: key, ok: true } : { mail: key, ok: false, error: r.error });
    await sleep(SEND_INTERVAL_MS);
  }
  return jsonResponse({ ok: results.length > 0 && results.every((r) => r.ok), to: TEST_RECIPIENT, sender: `${sender.name} ${sender.position}`.trim(), results }, 200, origin);
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const env = context.env;
  const origin = getOrigin(env);

  let payload: { action?: string; subscribers?: unknown; email?: unknown; sender?: unknown; mail?: unknown; dryRun?: unknown; limit?: unknown; token?: unknown };
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
  }

  // 발송·수신거부처럼 되돌리기 어려운 동작은 크론 토큰(GitHub Secrets와 같은 값)이 있어야 한다
  const cronAuthError = (): Response | null => {
    const token = context.request.headers.get('X-Newsletter-Cron-Token') || (typeof payload.token === 'string' ? payload.token : '');
    if (!env.NEWSLETTER_CRON_SECRET) return jsonResponse({ ok: false, error: 'NEWSLETTER_CRON_SECRET not configured' }, 500, origin);
    if (!token || token !== env.NEWSLETTER_CRON_SECRET) return jsonResponse({ ok: false, error: 'unauthorized' }, 401, origin);
    return null;
  };
  // 스티비 키는 주소록 동기화·수신거부에만 필요하다 (리마인드 메일은 네이버웍스로 나간다)
  const stibeeError = (): Response | null => {
    const cfgError = missingConfig(env);
    return cfgError ? jsonResponse({ ok: false, error: cfgError }, 500, origin) : null;
  };

  try {
    switch (payload.action) {
      case 'sync':
        return stibeeError() ?? (await handleSync(env, payload.subscribers));
      case 'unsubscribe':
        return stibeeError() ?? cronAuthError() ?? (await handleUnsubscribe(env, payload.email));
      case 'test-send':
        // 받는 주소가 relation@ 로 고정이고 하루 20통 상한이라 토큰 없이 연다
        return await handleTestSend(env, payload.sender, payload.mail);
      case 'run-followups': {
        const dryRun = payload.dryRun === true;
        if (!dryRun) {
          const authError = cronAuthError();
          if (authError) return authError;
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
