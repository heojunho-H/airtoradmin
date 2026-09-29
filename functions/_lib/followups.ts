// 팔로업 자동 발송 — 순수 계산 로직 (외부 호출 없음)
//
// 고객의 최신 작업 항목(workHistory 중 workDate 최대) 기준으로 단계별 발송 예정일을 계산하고,
// emailHistory 장부(source:'auto')로 멱등성을 보장한다. 리마인드 1/2/3차 체크박스(reminder1~3)는
// 단계 1~3에 대응: 발송 완료 시 true로 켜고, 이미 true(수동 체크)면 발송하지 않는다.
//
// 설정 env NEWSLETTER_FOLLOWUPS (JSON):
//   {"grace":30,"stages":[{"stage":1,"days":30,"autoEmailId":"...","label":"1개월 팔로업"}, ...]}
//   - 배열만 주면 grace 기본 30일
//   - stage 1..3 정수·중복 불가, days > 0, autoEmailId 필수
//
// 규칙 요약 (계획서 "멱등 규칙"):
//   - 오늘(KST) >= 예정일 이고 오늘 <= 예정일+grace 일 때만 발송 (첫 가동/크론 중단 시 대량 발송 방지)
//   - 작업일이 미래면 지날 때까지 어떤 단계도 보내지 않음
//   - 여러 단계가 동시에 due면 가장 높은 단계만 발송, 낮은 단계는 superseded로 장부 기록
//   - 같은 (jobKey, stage, recipient)가 sent|skipped 로 장부에 있으면 재발송 안 함

export interface FollowupStage {
  stage: 1 | 2 | 3;
  days: number;
  autoEmailId: string;
  label?: string;
}

export interface FollowupConfig {
  stages: FollowupStage[]; // days 오름차순
  grace: number;
}

export type ParsedFollowupConfig =
  | { ok: true; config: FollowupConfig }
  | { ok: false; disabled: true }
  | { ok: false; error: string };

export interface WorkEntry {
  dealId?: number;
  inquiryDate?: string;
  projectName?: string;
  workDate?: string;
  totalQuantity?: number;
  quotationAmount?: number;
  reminder1?: boolean;
  reminder2?: boolean;
  reminder3?: boolean;
  [k: string]: unknown;
}

export interface LedgerEntry {
  date: string;
  type: string;
  recipient: string;
  status: 'sent' | 'opened' | 'failed' | 'skipped';
  stage?: number;
  jobKey?: string;
  source?: 'auto';
  reason?: string;
}

export interface ContactLike {
  name?: string;
  position?: string;
  phone?: string;
  email?: string;
}

export interface CustomerRow {
  id: number;
  company?: string;
  grade?: string;
  customerStatus?: string;
  accountManager?: string;
  lastWorkDate?: string;
  contactName?: string;
  contactPosition?: string;
  phone?: string;
  email?: string;
  contacts?: ContactLike[];
  newsletterStatus?: string;
  workHistory?: WorkEntry[];
  emailHistory?: LedgerEntry[];
}

export interface Recipient {
  email: string;
  name: string;
  position: string;
}

export interface DueItem {
  customerId: number;
  company: string;
  stage: number;
  days: number;
  label: string;
  autoEmailId: string;
  jobKey: string;
  workDate: string;
  dueDate: string;
  projectName: string;
  totalQuantity: number;
  quotationAmount: number;
  recipients: Recipient[]; // 아직 장부에 없는 담당자만
  supersededStages: number[]; // 동시에 due였지만 상위 단계에 밀린 낮은 단계
}

export type SkipReason =
  | 'unsubscribed'
  | 'bounced'
  | 'no-email'
  | 'no-work-entry'
  | 'future-work-date'
  | 'not-due'
  | 'out-of-grace'
  | 'flag-set'
  | 'already-sent';

export interface SkipItem {
  customerId: number;
  company: string;
  stage?: number;
  reason: SkipReason;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

export function isYmd(s: unknown): s is string {
  return typeof s === 'string' && YMD_RE.test(s);
}

// KST 기준 오늘 (Workers는 UTC)
export function todayKst(now: number = Date.now()): string {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

export function parseFollowupConfig(raw: string | undefined): ParsedFollowupConfig {
  if (!raw || !raw.trim()) return { ok: false, disabled: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'NEWSLETTER_FOLLOWUPS is not valid JSON' };
  }
  let stagesRaw: unknown;
  let grace = 30;
  if (Array.isArray(parsed)) {
    stagesRaw = parsed;
  } else if (parsed && typeof parsed === 'object') {
    stagesRaw = (parsed as { stages?: unknown }).stages;
    const g = (parsed as { grace?: unknown }).grace;
    if (g !== undefined) {
      if (typeof g !== 'number' || !Number.isInteger(g) || g < 0) return { ok: false, error: 'grace must be a non-negative integer' };
      grace = g;
    }
  }
  if (!Array.isArray(stagesRaw) || stagesRaw.length === 0) return { ok: false, error: 'stages must be a non-empty array' };
  if (stagesRaw.length > 3) return { ok: false, error: 'at most 3 stages (reminder1~3)' };

  const stages: FollowupStage[] = [];
  const seen = new Set<number>();
  for (const s of stagesRaw) {
    if (!s || typeof s !== 'object') return { ok: false, error: 'stage entry must be an object' };
    const o = s as Record<string, unknown>;
    const stage = o.stage;
    const days = o.days;
    const autoEmailId = o.autoEmailId;
    if (stage !== 1 && stage !== 2 && stage !== 3) return { ok: false, error: `stage must be 1, 2 or 3 (got ${String(stage)})` };
    if (seen.has(stage)) return { ok: false, error: `duplicate stage ${stage}` };
    if (typeof days !== 'number' || !Number.isInteger(days) || days <= 0) return { ok: false, error: `stage ${stage}: days must be a positive integer` };
    if (typeof autoEmailId !== 'string' || !autoEmailId.trim()) return { ok: false, error: `stage ${stage}: autoEmailId required` };
    seen.add(stage);
    stages.push({
      stage,
      days,
      autoEmailId: autoEmailId.trim(),
      label: typeof o.label === 'string' ? o.label : undefined,
    });
  }
  stages.sort((a, b) => a.days - b.days);
  return { ok: true, config: { stages, grace } };
}

export function stageLabel(s: FollowupStage): string {
  return s.label || `${s.stage}단계 (+${s.days}일)`;
}

export function reminderKey(stage: number): 'reminder1' | 'reminder2' | 'reminder3' {
  return `reminder${stage}` as 'reminder1' | 'reminder2' | 'reminder3';
}

// 작업 항목 식별 키 — dealId가 없는 레거시 항목이 많아 복합 키를 쓴다. 프론트(src/lib/newsletter.ts)와 동일해야 함.
export function jobKeyOf(entry: WorkEntry): string {
  if (entry.dealId !== undefined && entry.dealId !== null && entry.dealId !== 0) return `deal:${entry.dealId}`;
  return `wd:${entry.workDate || ''}|${entry.projectName || ''}|${entry.inquiryDate || ''}`;
}

// 유효한 workDate 중 최대인 항목
export function latestEntry(workHistory: WorkEntry[] | undefined): WorkEntry | null {
  if (!Array.isArray(workHistory)) return null;
  let best: WorkEntry | null = null;
  for (const e of workHistory) {
    if (!e || !isYmd(e.workDate)) continue;
    if (!best || (e.workDate as string) > (best.workDate as string)) best = e;
  }
  return best;
}

// src/lib/newsletter.ts contactsOf와 동일 규칙 + 이메일 검증/중복 제거
export function recipientsOf(customer: CustomerRow): Recipient[] {
  let contacts: ContactLike[] = [];
  if (Array.isArray(customer.contacts) && customer.contacts.length > 0) contacts = customer.contacts;
  else if (customer.contactName || customer.phone || customer.email) {
    contacts = [{ name: customer.contactName || '', position: customer.contactPosition || '', phone: customer.phone || '', email: customer.email || '' }];
  }
  const out: Recipient[] = [];
  const seen = new Set<string>();
  for (const c of contacts) {
    const email = String(c?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 64 || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: c.name || '', position: c.position || '' });
  }
  return out;
}

export function alreadyDone(ledger: LedgerEntry[] | undefined, jobKey: string, stage: number, recipient: string): boolean {
  if (!Array.isArray(ledger)) return false;
  return ledger.some(
    (l) => l && l.source === 'auto' && l.jobKey === jobKey && l.stage === stage
      && (l.recipient || '').toLowerCase() === recipient && (l.status === 'sent' || l.status === 'skipped'),
  );
}

export function computeDue(customers: CustomerRow[], cfg: FollowupConfig, today: string): { due: DueItem[]; skipped: SkipItem[] } {
  const due: DueItem[] = [];
  const skipped: SkipItem[] = [];

  for (const c of customers) {
    const company = c.company || '';
    const base = { customerId: c.id, company };
    if (c.newsletterStatus === 'unsubscribed') { skipped.push({ ...base, reason: 'unsubscribed' }); continue; }
    if (c.newsletterStatus === 'bounced') { skipped.push({ ...base, reason: 'bounced' }); continue; }

    const recipients = recipientsOf(c);
    if (recipients.length === 0) { skipped.push({ ...base, reason: 'no-email' }); continue; }

    const entry = latestEntry(c.workHistory);
    if (!entry) { skipped.push({ ...base, reason: 'no-work-entry' }); continue; }
    const workDate = entry.workDate as string;
    if (workDate > today) { skipped.push({ ...base, reason: 'future-work-date' }); continue; }

    const jobKey = jobKeyOf(entry);
    const candidates: DueItem[] = [];
    for (const s of cfg.stages) {
      const dueDate = addDays(workDate, s.days);
      if (entry[reminderKey(s.stage)] === true) { skipped.push({ ...base, stage: s.stage, reason: 'flag-set' }); continue; }
      if (today < dueDate) { skipped.push({ ...base, stage: s.stage, reason: 'not-due' }); continue; }
      if (today > addDays(dueDate, cfg.grace)) { skipped.push({ ...base, stage: s.stage, reason: 'out-of-grace' }); continue; }
      const pending = recipients.filter((r) => !alreadyDone(c.emailHistory, jobKey, s.stage, r.email));
      if (pending.length === 0) { skipped.push({ ...base, stage: s.stage, reason: 'already-sent' }); continue; }
      candidates.push({
        customerId: c.id,
        company,
        stage: s.stage,
        days: s.days,
        label: stageLabel(s),
        autoEmailId: s.autoEmailId,
        jobKey,
        workDate,
        dueDate,
        projectName: entry.projectName || '',
        totalQuantity: Number(entry.totalQuantity) || 0,
        quotationAmount: Number(entry.quotationAmount) || 0,
        recipients: pending,
        supersededStages: [],
      });
    }
    if (candidates.length === 0) continue;
    // 동시에 여러 단계가 due → 가장 높은 단계(days 최대)만 발송
    candidates.sort((a, b) => b.days - a.days);
    const top = candidates[0];
    top.supersededStages = candidates.slice(1).map((x) => x.stage);
    due.push(top);
  }

  due.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.customerId - b.customerId));
  return { due, skipped };
}

export interface RecipientResult {
  email: string;
  ok: boolean;
  error?: string;
}

export interface ApplyResult {
  workHistory: WorkEntry[] | null; // null이면 항목을 못 찾음 → emailHistory만 PUT
  emailHistory: LedgerEntry[];
  entryFound: boolean;
  flagSet: boolean;
}

// 최신 조회본(fresh)에 발송 결과를 반영. 항목은 jobKey로 찾는다 (사용자가 그 사이 편집했을 수 있음).
export function applyResult(fresh: CustomerRow, item: DueItem, results: RecipientResult[], today: string): ApplyResult {
  const ledger: LedgerEntry[] = Array.isArray(fresh.emailHistory) ? fresh.emailHistory.slice() : [];
  const type = `팔로업 ${item.stage}단계 (+${item.days}d)`;
  for (const r of results) {
    ledger.push({
      date: today,
      type,
      recipient: r.email,
      status: r.ok ? 'sent' : 'failed',
      stage: item.stage,
      jobKey: item.jobKey,
      source: 'auto',
      reason: r.ok ? undefined : (r.error || 'trigger failed'),
    });
  }
  // 상위 단계에 밀린 낮은 단계 — 다시 발송되지 않도록 담당자별 skipped 기록
  const allRecipients = results.map((r) => r.email);
  for (const s of item.supersededStages) {
    for (const email of allRecipients) {
      ledger.push({ date: today, type: `팔로업 ${s}단계`, recipient: email, status: 'skipped', stage: s, jobKey: item.jobKey, source: 'auto', reason: 'superseded' });
    }
  }

  const wh = Array.isArray(fresh.workHistory) ? fresh.workHistory.map((e) => ({ ...e })) : [];
  const idx = wh.findIndex((e) => e && jobKeyOf(e) === item.jobKey);
  if (idx < 0) return { workHistory: null, emailHistory: ledger, entryFound: false, flagSet: false };

  // 이 작업·단계의 모든 담당자가 sent|skipped 이면 리마인드 N차 체크
  const recipientsAll = recipientsOf(fresh);
  const everyDone = recipientsAll.length > 0 && recipientsAll.every((r) => alreadyDone(ledger, item.jobKey, item.stage, r.email));
  let flagSet = false;
  if (everyDone) {
    wh[idx][reminderKey(item.stage)] = true;
    flagSet = true;
  }
  for (const s of item.supersededStages) wh[idx][reminderKey(s)] = true;

  return { workHistory: wh, emailHistory: ledger, entryFound: true, flagSet };
}
