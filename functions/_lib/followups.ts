// 팔로업 자동 발송 — 순수 계산 로직 (외부 호출 없음)
//
// 고객의 최신 작업 항목(workHistory 중 workDate 최대) 기준으로 단계별 발송 예정일을 계산하고,
// emailHistory 장부(source:'auto')로 멱등성을 보장한다. 리마인드 1/2/3차 체크박스(reminder1~3)는
// 단계 1~3에 대응: 발송 완료 시 true로 켜고, 이미 true(수동 체크)면 발송하지 않는다.
// 단계 4·5는 체크 칸이 없다(PHP 허용 목록이 reminder1~3뿐) — 장부만으로 중복을 막는다.
//
// 설정 env NEWSLETTER_FOLLOWUPS (JSON):
//   {"grace":30,"fallbackManager":"<담당 매니저가 없을 때 보낼 사람 이름>","teams":{"<매니저 이름>":"<팀>"},
//    "stages":[{"stage":1,"days":45,"mail":"a2"},{"stage":2,"days":200,"mail":"b1","mou":true},
//              {"stage":3,"days":335,"mail":"b2"},{"stage":4,"days":395,"mail":"b3"}]}
//   - 배열만 주면 grace 기본 30일. grace는 단계 간 최소 간격(35일)보다 작아야 한다
//   - stage 1..5 정수·중복 불가, days > 0, mail(문안 키 a2·b1·b2·b3 — functions/_lib/remind-mails.ts) 필수
//   - b1 은 언제나 협약서 링크를 싣는다(mou). altDays + altWorkMonths 는 예전 규칙 호환용(지금은 쓰지 않음)
//   - fallbackManager: 이름만 env 에 둔다(공개 저장소에 직원 이름 X). 메일은 담당 매니저 네이버웍스 계정으로 나간다
//   - teams: 메일 서명 '이름 직급(팀)'의 팀 — managers 데이터에 팀이 없어서 env 에 둔다. 없는 사람은 괄호를 뺀다
//
// 규칙 요약 (계획서 "멱등 규칙"):
//   - 오늘(KST) >= 예정일 이고 오늘 <= 예정일+grace 일 때만 발송 (첫 가동/크론 중단 시 대량 발송 방지)
//   - 작업일이 미래면 지날 때까지 어떤 단계도 보내지 않음
//   - 같은 회사에 진행 중인 딜이 있거나, 작업일 없이 수주된 작업이 있으면 보내지 않음 (open-deal / pending-job)
//   - 여러 단계가 동시에 due면 가장 높은 단계만 발송, 낮은 단계는 superseded로 장부 기록
//   - 같은 (jobKey, stage, recipient)가 sent|skipped 로 장부에 있으면 재발송 안 함
//   - 고객 상세에서 '보내지 않기'로 취소한 회차(D1 remind_cancels — functions/_lib/remind-cancels.ts)는 보내지 않음
//   - 손으로 보낸·예약한 메일(장부 source:'manual', sent|scheduled)이 있는 회차는 받는 주소와 상관없이 끝난 것으로 본다
//
// 리마인드 메일(2026-11-15 확정, 광고 표시 없음 — 사용자 결정): 1 A2 D+45 · 2 B1 D+200(협약서) · 3 B2 D+335 · 4 B3 D+395

import { formatDetailedQuantity } from '../../src/lib/quantity';
import { normalizeCompanyName } from '../../src/lib/company';
import { isRemindMailKey, type RemindMailKey } from './remind-mails';

export type StageNo = 1 | 2 | 3 | 4 | 5;

export interface FollowupStage {
  stage: StageNo;
  days: number;
  /** 보낼 문안 — functions/_lib/remind-mails.ts */
  mail: RemindMailKey;
  label?: string;
  /** 작업월이 altWorkMonths에 있으면 days 대신 이 값 */
  altDays?: number;
  altWorkMonths?: number[];
  /** 단가보장 협약서 링크를 만들어 싣는 단계 (b1 은 언제나) — functions/_lib/mou.ts */
  mou?: boolean;
}

export interface FollowupConfig {
  stages: FollowupStage[]; // days 오름차순
  grace: number;
  /** 담당 매니저가 없거나 찾지 못한 고객을 맡을 매니저 이름 */
  fallbackManager?: string;
  /** 매니저 이름 → 메일 서명의 팀 이름 */
  teams?: Record<string, string>;
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
  /** scheduled — 손으로 네이버웍스에 예약한 메일 (at 이 예약 시각) */
  status: 'sent' | 'opened' | 'failed' | 'skipped' | 'scheduled';
  stage?: number;
  jobKey?: string;
  /** auto — 발송기, manual — 담당자가 네이버웍스에서 손으로 보낸·예약한 메일 (docs/remind-mails.md '가동') */
  source?: 'auto' | 'manual';
  reason?: string;
  /** 보낸 담당자 계정 (네이버웍스) */
  sender?: string;
  via?: 'works';
  /** 보낸 시각 (ISO) — 작업 히스토리 리마인드 칸에 시각을 보인다. 예전 항목은 날짜만 있다 */
  at?: string;
  /** 손메일의 네이버웍스 메일 번호 — 같은 메일을 두 번 기록하지 않고, 나중에 수신확인과 다시 맞출 때 쓴다 */
  mailSn?: number;
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
  mail: RemindMailKey;
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
  /** 작업 항목의 딜 ID (없으면 null) — 협약서 단가표가 견적서 판독을 찾을 때 쓴다 */
  dealId: number | null;
  /** 작업 항목의 설비 내역 원본 — 협약서 대수 표 */
  detailedQuantity: unknown;
  /** 이 단계가 협약서 링크를 싣는가 (FollowupStage.mou) */
  mou: boolean;
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
  | 'cancelled'
  | 'already-sent';

export interface ComputeOptions {
  /** 진행 중 딜이 있는 회사 — normalizeCompanyName 결과 */
  openDealCompanies?: Set<string>;
  /** 보내지 않기로 한 회차 — cancelKeyOf 키 (D1 remind_cancels, functions/_lib/remind-cancels.ts) */
  cancelled?: Set<string>;
}

// 취소 키 — jobKey '*' = 이 고객의 모든 작업, stage 0 = 모든 회차 ('이 고객 리마인드 모두 끄기'는 '*'·0)
export function cancelKeyOf(customerId: number, jobKey: string, stage: number): string {
  return `${customerId}|${jobKey}|${stage}`;
}

export function isCancelled(set: Set<string> | undefined, customerId: number, jobKey: string, stage: number): boolean {
  if (!set || set.size === 0) return false;
  return (
    set.has(cancelKeyOf(customerId, jobKey, stage)) || set.has(cancelKeyOf(customerId, jobKey, 0))
    || set.has(cancelKeyOf(customerId, '*', stage)) || set.has(cancelKeyOf(customerId, '*', 0))
  );
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
  let fallbackManager: string | undefined;
  let teams: Record<string, string> | undefined;
  if (Array.isArray(parsed)) {
    stagesRaw = parsed;
  } else if (parsed && typeof parsed === 'object') {
    stagesRaw = (parsed as { stages?: unknown }).stages;
    const g = (parsed as { grace?: unknown }).grace;
    if (g !== undefined) {
      if (typeof g !== 'number' || !Number.isInteger(g) || g < 0) return { ok: false, error: 'grace must be a non-negative integer' };
      grace = g;
    }
    const fm = (parsed as { fallbackManager?: unknown }).fallbackManager;
    if (fm !== undefined) {
      if (typeof fm !== 'string') return { ok: false, error: 'fallbackManager must be a string' };
      fallbackManager = fm.trim() || undefined;
    }
    const tm = (parsed as { teams?: unknown }).teams;
    if (tm !== undefined) {
      if (!tm || typeof tm !== 'object' || Array.isArray(tm) || !Object.values(tm).every((v) => typeof v === 'string')) {
        return { ok: false, error: 'teams must be an object of name → team strings' };
      }
      teams = Object.fromEntries(Object.entries(tm as Record<string, string>).map(([k, v]) => [k.trim(), v.trim()]).filter(([k, v]) => k && v));
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
    const mail = o.mail;
    if (stage !== 1 && stage !== 2 && stage !== 3 && stage !== 4 && stage !== 5) return { ok: false, error: `stage must be 1~5 (got ${String(stage)})` };
    if (seen.has(stage)) return { ok: false, error: `duplicate stage ${stage}` };
    if (typeof days !== 'number' || !Number.isInteger(days) || days <= 0) return { ok: false, error: `stage ${stage}: days must be a positive integer` };
    if (!isRemindMailKey(mail)) return { ok: false, error: `stage ${stage}: mail must be one of a2, b1, b2, b3` };
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
    if (o.mou !== undefined && typeof o.mou !== 'boolean') return { ok: false, error: `stage ${stage}: mou must be true or false` };
    seen.add(stage);
    stages.push({
      stage,
      days,
      mail,
      label: typeof o.label === 'string' ? o.label : undefined,
      altDays,
      altWorkMonths,
      mou: o.mou === true || mail === 'b1' ? true : undefined,
    });
  }
  stages.sort((a, b) => a.days - b.days);
  return { ok: true, config: { stages, grace, fallbackManager, teams } };
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

// 손으로 보낸·예약한 메일이 있는 회차 — 담당자가 고른 주소로 갔으므로 CRM 담당자 주소와 달라도 그 회차는 끝났다
export function manualDone(ledger: LedgerEntry[] | undefined, jobKey: string, stage: number): boolean {
  if (!Array.isArray(ledger)) return false;
  return ledger.some(
    (l) => l && l.source === 'manual' && l.jobKey === jobKey && l.stage === stage && (l.status === 'sent' || l.status === 'scheduled'),
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
      if (manualDone(c.emailHistory, jobKey, s.stage)) { skipped.push({ ...base, stage: s.stage, reason: 'already-sent' }); continue; }
      if (isCancelled(opts.cancelled, c.id, jobKey, s.stage)) { skipped.push({ ...base, stage: s.stage, reason: 'cancelled' }); continue; }
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
        mail: s.mail,
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
        dealId: Number.isInteger(Number(entry.dealId)) && Number(entry.dealId) > 0 ? Number(entry.dealId) : null,
        detailedQuantity: entry.detailedQuantity,
        mou: s.mou === true,
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

// ── 작업 히스토리 '리마인드 1~4차' 칸 (src/app/components/ReminderCell.tsx) ──
// 회차별 판단은 computeDue 를 그대로 쓰고(규칙을 따로 베끼지 않는다), 그 위에 장부(자동·손메일)·취소·체크를 얹는다.
// 상태 우선순위: 보냄 > 손 예약 > 취소됨 > 손메일 실패(체크됐거나 기한 지남) > 체크됨 > 건너뜀 > 기한 지남 > 보류(고객 전체 사유) > 곧 보냄 > 예약됨.

export type StageStatus = 'sent' | 'reserved' | 'cancelled' | 'failed' | 'checked' | 'skipped' | 'expired' | 'blocked' | 'due' | 'scheduled';

export interface StageLedgerItem {
  recipient: string;
  date: string;
  at?: string;
  sender?: string;
  reason?: string;
  /** 손으로 보낸·예약한 메일 */
  manual?: boolean;
}

// 손 예약 메일의 예약 시각(ms) — at 이 없으면 그날 오전 9시(KST)
export function scheduledAtMs(l: Pick<LedgerEntry, 'at' | 'date'>): number {
  const t = l.at ? Date.parse(l.at) : NaN;
  return Number.isFinite(t) ? t : Date.parse(`${l.date}T00:00:00Z`);
}

// 장부 한 줄이 지금 어떤 상태인가 — 손 예약은 예약 시각이 지나면 보낸 것으로 본다(네이버웍스 예약 발송)
export function ledgerState(l: LedgerEntry, now: number = Date.now()): 'sent' | 'reserved' | 'failed' | 'skipped' | 'opened' {
  if (l.status === 'scheduled') return scheduledAtMs(l) <= now ? 'sent' : 'reserved';
  return l.status;
}

export interface StageTimeline {
  stage: number;
  mail: RemindMailKey;
  label: string;
  days: number;
  dueDate: string;
  /** 자동 실행 기준 예상 발송일 — 예약됨은 예정일(주말이면 다음 평일), 곧 보냄은 다음 실행일 */
  sendDate: string | null;
  status: StageStatus;
  /** computeDue 판단 — 'due'·'superseded' 또는 회차 건너뜀 사유 (고객 전체 사유로 막혔으면 null) */
  verdict: SkipReason | 'due' | 'superseded' | null;
  sent: StageLedgerItem[];
  /** 손으로 네이버웍스에 예약해 두었고 아직 예약 시각 전인 메일 */
  reserved: StageLedgerItem[];
  failed: StageLedgerItem[];
  skipped: StageLedgerItem[];
  /** 아직 이 회차를 받지 않은 담당자 — '보냄'인데 남아 있으면 일부만 보낸 것. 손메일이 있는 회차는 비운다 */
  pending: string[];
  /** 작업 히스토리의 리마인드 N차 칸 (④는 칸이 없어 false) */
  flag: boolean;
}

export interface RemindTimeline {
  customerId: number;
  company: string;
  /** 고객 전체를 막는 computeDue 사유 (수신거부·반송·메일 없음·작업 없음·미래 작업·진행 중 딜·작업일 없는 수주) */
  blocked: SkipReason | null;
  job: { jobKey: string; workDate: string; projectName: string } | null;
  recipients: Recipient[];
  stages: StageTimeline[];
}

// 그날이 평일이면 그날, 토·일이면 다음 월요일
export function weekdayOnOrAfter(ymd: string): string {
  let d = ymd;
  for (let i = 0; i < 3; i++) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) return d;
    d = addDays(d, 1);
  }
  return d;
}

export function remindTimeline(
  c: CustomerRow,
  cfg: FollowupConfig,
  today: string,
  opts: ComputeOptions & { nextRun?: string; now?: number } = {},
): RemindTimeline {
  const now = opts.now ?? Date.now();
  const recipients = recipientsOf(c);
  const { due, skipped } = computeDue([c], cfg, today, opts);
  const customerSkip = skipped.find((s) => s.stage === undefined);
  const blocked = customerSkip ? customerSkip.reason : null;
  const entry = latestEntry(c.workHistory);
  if (!entry) return { customerId: c.id, company: c.company || '', blocked, job: null, recipients, stages: [] };

  const workDate = entry.workDate as string;
  const jobKey = jobKeyOf(entry);
  const top = due[0];
  const ledger = Array.isArray(c.emailHistory) ? c.emailHistory : [];
  const toItem = (l: LedgerEntry): StageLedgerItem => ({
    recipient: l.recipient,
    date: l.date,
    ...(l.at ? { at: l.at } : {}),
    ...(l.sender ? { sender: l.sender } : {}),
    ...(l.reason ? { reason: l.reason } : {}),
    ...(l.source === 'manual' ? { manual: true } : {}),
  });

  const stages = cfg.stages.map((s): StageTimeline => {
    const days = stageDays(s, workDate);
    const dueDate = addDays(workDate, days);
    const mine = ledger.filter((l) => l && (l.source === 'auto' || l.source === 'manual') && l.jobKey === jobKey && l.stage === s.stage);
    const sent = mine.filter((l) => ledgerState(l, now) === 'sent').map(toItem);
    const reserved = mine.filter((l) => ledgerState(l, now) === 'reserved').map(toItem);
    const failed = mine.filter((l) => l.status === 'failed').map(toItem);
    const skippedLedger = mine.filter((l) => l.status === 'skipped').map(toItem);
    const manual = manualDone(ledger, jobKey, s.stage);
    const pending = manual ? [] : recipients.filter((r) => !alreadyDone(ledger, jobKey, s.stage, r.email)).map((r) => r.email);
    const flagKey = reminderKey(s.stage);
    const flag = Boolean(flagKey && entry[flagKey] === true);
    let verdict: StageTimeline['verdict'] = null;
    if (top && top.stage === s.stage) verdict = 'due';
    else if (top && top.supersededStages.includes(s.stage)) verdict = 'superseded';
    else verdict = skipped.find((x) => x.stage === s.stage)?.reason ?? null;

    const expired = today > addDays(dueDate, cfg.grace);
    // 손메일 실패는 다시 보내지 않을 때(체크됐거나 기한이 지남)만 '발송 실패'로 — 체크를 풀어 다시 예약하면 예약 상태를 보인다
    const manualFailed = failed.some((x) => x.manual) && (flag || expired);
    let status: StageStatus;
    if (sent.length > 0) status = 'sent';
    else if (reserved.length > 0) status = 'reserved';
    else if (isCancelled(opts.cancelled, c.id, jobKey, s.stage)) status = 'cancelled';
    else if (manualFailed) status = 'failed';
    else if (flag) status = 'checked';
    else if (skippedLedger.length > 0 || verdict === 'superseded') status = 'skipped';
    else if (expired) status = 'expired';
    else if (blocked && blocked !== 'future-work-date') status = 'blocked';
    else if (verdict === 'due' || today >= dueDate) status = 'due';
    else status = 'scheduled';

    const sendDate = status === 'scheduled' ? weekdayOnOrAfter(dueDate)
      : status === 'due' ? (opts.nextRun ?? weekdayOnOrAfter(today))
      : status === 'reserved' ? reserved[0].date : null;
    return { stage: s.stage, mail: s.mail, label: stageLabel(s), days, dueDate, sendDate, status, verdict, sent, reserved, failed, skipped: skippedLedger, pending, flag };
  });

  return {
    customerId: c.id,
    company: c.company || '',
    blocked,
    job: { jobKey, workDate, projectName: entry.projectName || '' },
    recipients,
    stages,
  };
}

// ── 고객 목록 '리마인드 상태' 열 (src/app/components/CustomersPage.tsx) ──
// 한 줄: 가장 최근에 나간 메일(모든 작업의 장부) → 없으면 다음 예약(최근 작업) → 보류 → 예약발송 취소 → 미발송

export interface RemindBrief {
  /** 가장 최근에 나간(또는 손메일이 실패한) 리마인드 메일 — 지난 작업의 메일도 본다 */
  last: { stage: number; date: string; at?: string; kind: 'sent' | 'failed'; manual: boolean } | null;
  /** 다음에 나갈 회차 — 최근 작업의 손 예약·곧 보냄·예약됨 중 가장 이른 것 */
  next: { stage: number; date: string; kind: 'reserved' | 'due' | 'scheduled' } | null;
  /** 고객 전체를 막는 사유 (작업일이 미래면 null) */
  blocked: SkipReason | null;
  /** 기한 안의 회차를 꺼 두었다 (D1 취소 또는 리마인드 체크) */
  off: boolean;
}

export function remindBrief(c: CustomerRow, tl: RemindTimeline, cfg: FollowupConfig, today: string, now: number = Date.now()): RemindBrief {
  let last: RemindBrief['last'] = null;
  let lastAt = -Infinity;
  for (const l of Array.isArray(c.emailHistory) ? c.emailHistory : []) {
    if (!l || (l.source !== 'auto' && l.source !== 'manual') || typeof l.stage !== 'number') continue;
    const st = ledgerState(l, now);
    // 자동 실패는 발송기가 다시 보내므로 '최근 발송'으로 보지 않는다
    const kind = st === 'sent' ? 'sent' : st === 'failed' && l.source === 'manual' ? 'failed' : null;
    if (!kind) continue;
    const t = scheduledAtMs(l);
    if (t > lastAt || (t === lastAt && kind === 'sent')) {
      lastAt = t;
      last = { stage: l.stage, date: l.date, ...(l.at ? { at: l.at } : {}), kind, manual: l.source === 'manual' };
    }
  }
  let next: RemindBrief['next'] = null;
  for (const s of tl.stages) {
    if ((s.status === 'reserved' || s.status === 'due' || s.status === 'scheduled') && s.sendDate && (!next || s.sendDate < next.date)) {
      next = { stage: s.stage, date: s.sendDate, kind: s.status };
    }
  }
  const blocked = tl.blocked && tl.blocked !== 'future-work-date' ? tl.blocked : null;
  const off = tl.stages.some((s) => (s.status === 'cancelled' || s.status === 'checked') && today <= addDays(s.dueDate, cfg.grace));
  return { last, next, blocked, off };
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
export function applyResult(fresh: CustomerRow, item: DueItem, results: RecipientResult[], today: string, sender?: string, at?: string): ApplyResult {
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
      reason: r.ok ? undefined : (r.error || 'send failed'),
      ...(sender ? { sender, via: 'works' as const } : {}),
      ...(at ? { at } : {}),
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

// ── 메일 값 (functions/_lib/remind-mails.ts 가 문안에 넣는다) ──

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
