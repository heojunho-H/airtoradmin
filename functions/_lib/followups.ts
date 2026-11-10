// 팔로업 자동 발송 — 순수 계산 로직 (외부 호출 없음)
//
// 고객의 최신 작업 항목(workHistory 중 workDate 최대) 기준으로 단계별 발송 예정일을 계산하고,
// emailHistory 장부(source:'auto')로 멱등성을 보장한다. 리마인드 1/2/3차 체크박스(reminder1~3)는
// 단계 1~3에 대응: 발송 완료 시 true로 켜고, 이미 true(수동 체크)면 발송하지 않는다.
// 단계 4·5는 체크 칸이 없다(PHP 허용 목록이 reminder1~3뿐) — 장부만으로 중복을 막는다.
//
// 설정 env NEWSLETTER_FOLLOWUPS (JSON):
//   {"grace":30,"stages":[{"stage":1,"days":45,"autoEmailId":"...","label":"A2 사용 가이드"},
//                         {"stage":3,"days":300,"altDays":240,"altWorkMonths":[7,8,9,10],...}, ...]}
//   - 배열만 주면 grace 기본 30일. grace는 단계 간 최소 간격(35일)보다 작아야 한다
//   - stage 1..5 정수·중복 불가, days > 0, autoEmailId 필수
//   - altDays + altWorkMonths: 작업월이 altWorkMonths면 days 대신 altDays (리마인드 기획 B1: 7~10월 작업은 D+240)
//
// 규칙 요약 (계획서 "멱등 규칙"):
//   - 오늘(KST) >= 예정일 이고 오늘 <= 예정일+grace 일 때만 발송 (첫 가동/크론 중단 시 대량 발송 방지)
//   - 작업일이 미래면 지날 때까지 어떤 단계도 보내지 않음
//   - 같은 회사에 진행 중인 딜이 있거나, 작업일 없이 수주된 작업이 있으면 보내지 않음 (open-deal / pending-job)
//   - 여러 단계가 동시에 due면 가장 높은 단계만 발송, 낮은 단계는 superseded로 장부 기록
//   - 같은 (jobKey, stage, recipient)가 sent|skipped 로 장부에 있으면 재발송 안 함
//
// 리마인드 기획(2026-11, 5통 모두 정보성): 1 A2 D+45 · 2 A3 D+150 · 3 B1 D+300(7~10월 240) · 4 B2 D+335 · 5 B3 D+395

import { formatDetailedQuantity } from '../../src/lib/quantity';
import { normalizeCompanyName } from '../../src/lib/company';

export type StageNo = 1 | 2 | 3 | 4 | 5;

export interface FollowupStage {
  stage: StageNo;
  days: number;
  autoEmailId: string;
  label?: string;
  /** 작업월이 altWorkMonths에 있으면 days 대신 이 값 */
  altDays?: number;
  altWorkMonths?: number[];
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
  detailedQuantity?: unknown;
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
  /** 설비 내역 한 줄 (예: '1way 천정형 22대, 4way 천정형 2대') — 개인화 값 equipment */
  equipment: string;
  /** 고객 담당 매니저 — 개인화 값 manager */
  manager: string;
  recipients: Recipient[]; // 아직 장부에 없는 담당자만
  supersededStages: number[]; // 동시에 due였지만 상위 단계에 밀린 낮은 단계
}

export type SkipReason =
  | 'unsubscribed'
  | 'bounced'
  | 'no-email'
  | 'no-work-entry'
  | 'future-work-date'
  | 'open-deal'
  | 'pending-job'
  | 'not-due'
  | 'out-of-grace'
  | 'flag-set'
  | 'already-sent';

export interface ComputeOptions {
  /** 진행 중 딜이 있는 회사 — normalizeCompanyName 결과 */
  openDealCompanies?: Set<string>;
}

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
  if (stagesRaw.length > 5) return { ok: false, error: 'at most 5 stages' };

  const stages: FollowupStage[] = [];
  const seen = new Set<number>();
  for (const s of stagesRaw) {
    if (!s || typeof s !== 'object') return { ok: false, error: 'stage entry must be an object' };
    const o = s as Record<string, unknown>;
    const stage = o.stage;
    const days = o.days;
    const autoEmailId = o.autoEmailId;
    if (stage !== 1 && stage !== 2 && stage !== 3 && stage !== 4 && stage !== 5) return { ok: false, error: `stage must be 1~5 (got ${String(stage)})` };
    if (seen.has(stage)) return { ok: false, error: `duplicate stage ${stage}` };
    if (typeof days !== 'number' || !Number.isInteger(days) || days <= 0) return { ok: false, error: `stage ${stage}: days must be a positive integer` };
    if (typeof autoEmailId !== 'string' || !autoEmailId.trim()) return { ok: false, error: `stage ${stage}: autoEmailId required` };
    let altDays: number | undefined;
    let altWorkMonths: number[] | undefined;
    if (o.altDays !== undefined || o.altWorkMonths !== undefined) {
      const ad = o.altDays;
      const am = o.altWorkMonths;
      if (typeof ad !== 'number' || !Number.isInteger(ad) || ad <= 0) return { ok: false, error: `stage ${stage}: altDays must be a positive integer` };
      if (!Array.isArray(am) || am.length === 0 || !am.every((m) => Number.isInteger(m) && m >= 1 && m <= 12)) {
        return { ok: false, error: `stage ${stage}: altWorkMonths must be a non-empty array of months 1~12` };
      }
      altDays = ad;
      altWorkMonths = am as number[];
    }
    seen.add(stage);
    stages.push({
      stage,
      days,
      autoEmailId: autoEmailId.trim(),
      label: typeof o.label === 'string' ? o.label : undefined,
      altDays,
      altWorkMonths,
    });
  }
  stages.sort((a, b) => a.days - b.days);
  return { ok: true, config: { stages, grace } };
}

export function stageLabel(s: FollowupStage): string {
  return s.label || `${s.stage}단계 (+${s.days}일)`;
}

// 이 작업에 적용되는 경과일 — 작업월이 altWorkMonths면 altDays
export function stageDays(s: FollowupStage, workDate: string): number {
  if (s.altDays && s.altWorkMonths && isYmd(workDate)) {
    const month = Number(workDate.slice(5, 7));
    if (s.altWorkMonths.includes(month)) return s.altDays;
  }
  return s.days;
}

// 리마인드 체크 칸 — 단계 4·5는 칸이 없어 null (장부만으로 중복 방지)
export function reminderKey(stage: number): 'reminder1' | 'reminder2' | 'reminder3' | null {
  return stage >= 1 && stage <= 3 ? (`reminder${stage}` as 'reminder1' | 'reminder2' | 'reminder3') : null;
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

// 작업일 없이 수주된 작업(딜 연결) — 새 작업이 잡혔으니 이전 작업의 남은 단계는 멈춘다
function hasPendingJob(workHistory: WorkEntry[] | undefined): boolean {
  if (!Array.isArray(workHistory)) return false;
  return workHistory.some((e) => e && e.dealId !== undefined && e.dealId !== null && e.dealId !== 0 && !isYmd(e.workDate));
}

export function computeDue(
  customers: CustomerRow[],
  cfg: FollowupConfig,
  today: string,
  opts: ComputeOptions = {},
): { due: DueItem[]; skipped: SkipItem[] } {
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
    const companyKey = normalizeCompanyName(company);
    if (companyKey && opts.openDealCompanies?.has(companyKey)) { skipped.push({ ...base, reason: 'open-deal' }); continue; }
    if (hasPendingJob(c.workHistory)) { skipped.push({ ...base, reason: 'pending-job' }); continue; }

    const jobKey = jobKeyOf(entry);
    const candidates: DueItem[] = [];
    for (const s of cfg.stages) {
      const days = stageDays(s, workDate);
      const dueDate = addDays(workDate, days);
      const flagKey = reminderKey(s.stage);
      if (flagKey && entry[flagKey] === true) { skipped.push({ ...base, stage: s.stage, reason: 'flag-set' }); continue; }
      if (today < dueDate) { skipped.push({ ...base, stage: s.stage, reason: 'not-due' }); continue; }
      if (today > addDays(dueDate, cfg.grace)) { skipped.push({ ...base, stage: s.stage, reason: 'out-of-grace' }); continue; }
      const pending = recipients.filter((r) => !alreadyDone(c.emailHistory, jobKey, s.stage, r.email));
      if (pending.length === 0) { skipped.push({ ...base, stage: s.stage, reason: 'already-sent' }); continue; }
      candidates.push({
        customerId: c.id,
        company,
        stage: s.stage,
        days,
        label: stageLabel(s),
        autoEmailId: s.autoEmailId,
        jobKey,
        workDate,
        dueDate,
        projectName: entry.projectName || '',
        totalQuantity: Number(entry.totalQuantity) || 0,
        quotationAmount: Number(entry.quotationAmount) || 0,
        equipment: equipmentLine(entry),
        manager: (c.accountManager || '').trim() || DEFAULT_MANAGER,
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
  /** 이번에 덧붙인 장부 항목 — customers_api_v2 emailHistoryAppend 로 보낸다 */
  appended: LedgerEntry[];
  /** 이번에 체크할 리마인드 칸 — customers_api_v2 workHistoryPatch update 로 보낸다 */
  flags: Record<string, boolean>;
  entryFound: boolean;
  flagSet: boolean;
}

// 최신 조회본(fresh)에 발송 결과를 반영. 항목은 jobKey로 찾는다 (사용자가 그 사이 편집했을 수 있음).
export function applyResult(fresh: CustomerRow, item: DueItem, results: RecipientResult[], today: string): ApplyResult {
  const ledger: LedgerEntry[] = Array.isArray(fresh.emailHistory) ? fresh.emailHistory.slice() : [];
  const before = ledger.length;
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
  if (idx < 0) return { workHistory: null, emailHistory: ledger, appended: ledger.slice(before), flags: {}, entryFound: false, flagSet: false };

  // 이 작업·단계의 모든 담당자가 sent|skipped 이면 리마인드 N차 체크
  const recipientsAll = recipientsOf(fresh);
  const everyDone = recipientsAll.length > 0 && recipientsAll.every((r) => alreadyDone(ledger, item.jobKey, item.stage, r.email));
  let flagSet = false;
  const flags: Record<string, boolean> = {};
  const ownKey = reminderKey(item.stage);
  if (everyDone && ownKey) {
    wh[idx][ownKey] = true;
    flags[ownKey] = true;
    flagSet = true;
  }
  for (const s of item.supersededStages) {
    const k = reminderKey(s);
    if (!k) continue;
    wh[idx][k] = true;
    flags[k] = true;
  }

  return { workHistory: wh, emailHistory: ledger, appended: ledger.slice(before), flags, entryFound: true, flagSet };
}

// ── 메일 개인화 값 (스티비 주소록 사용자 정의 필드와 키가 같아야 한다 — docs/stibee-emails/README.md) ──

export const DEFAULT_MANAGER = '에어터';

// 설비 내역 한 줄. 작업 항목의 detailedQuantity(JSON 문자열 또는 [{item, quantity}])를 쓰고,
// 없으면 총 대수, 그것도 없으면 일반 문구.
export function equipmentLine(entry: WorkEntry): string {
  const dq = entry.detailedQuantity;
  let line = '';
  if (typeof dq === 'string') {
    line = formatDetailedQuantity(dq).replace(/(\d+)(?=,|$)/g, '$1대');
  } else if (Array.isArray(dq)) {
    line = dq
      .map((d) => {
        const o = d as { item?: unknown; quantity?: unknown };
        const item = String(o?.item ?? '').trim();
        const qty = Number(o?.quantity);
        return item && Number.isFinite(qty) && qty > 0 ? `${item} ${qty}대` : '';
      })
      .filter(Boolean)
      .join(', ');
  }
  if (line) return line;
  const total = Number(entry.totalQuantity) || 0;
  return total > 0 ? `에어컨 ${total}대` : '작업한 설비';
}

// 'YYYY-MM-DD' → '2026년 6월 12일' / '2026년 6월'
export function koreanDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}
export function koreanMonth(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  return `${y}년 ${m}월`;
}

// 메일이 실제로 도착하는 날 — 스티비 발송 시간대가 평일 9~18시라 주말 트리거는 월요일에 나간다
export function arrivalDate(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 일 ~ 6 토
  if (dow === 6) return addDays(today, 2);
  if (dow === 0) return addDays(today, 1);
  return today;
}

// 계절 관리법 4종 — 회사 '냉난방기 유지관리 지침' 기준 (리마인드 기획 문서 '계절 관리법 4종' 표와 같게 유지)
export const CARE_BY_SEASON: { months: number[]; season: string; line: string }[] = [
  { months: [3, 4], season: '냉방 준비', line: '여름 가동 전에 필터를 청소하고 전체를 한 번 점검해 주세요.' },
  { months: [5, 6, 7, 8], season: '냉방철', line: '필터는 최소 한 달에 한 번 청소해 주세요. 켤 때 냄새가 나면 창문을 열고 1~2시간 송풍으로 돌리면 좋아집니다.' },
  { months: [9, 10], season: '냉방 마감', line: '쓰지 않는 동안에는 분전함 차단기를 내려 대기 전력을 막고, 다음에 켜기 전에 필터를 청소해 주세요.' },
  { months: [11, 12, 1, 2], season: '난방철', line: '겨울에 실외기에서 김이 나는 것은 성에를 녹이는 정상 운전입니다. 필터는 한 달에 한 번 청소해 주세요.' },
];

export function careFor(ymd: string): { season: string; line: string } {
  const month = Number(ymd.slice(5, 7));
  const hit = CARE_BY_SEASON.find((c) => c.months.includes(month)) || CARE_BY_SEASON[1];
  return { season: hit.season, line: hit.line };
}

// 자동 이메일 트리거에 실어 보내는 개인화 값 (스티비 $%키%$)
export function mergeFieldsFor(item: Pick<DueItem, 'workDate' | 'equipment' | 'manager'>, today: string): Record<string, string> {
  const care = careFor(arrivalDate(today));
  const due = addDays(item.workDate, 365);
  return {
    work_date_kr: koreanDate(item.workDate),
    work_month: koreanMonth(item.workDate),
    due_date_kr: koreanDate(due),
    due_month: koreanMonth(due),
    equipment: item.equipment,
    manager: item.manager,
    care_season: care.season,
    care_line: care.line,
  };
}
