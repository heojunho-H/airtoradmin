// 홈 화면 계산 — 지표 3장(이번 달 매출·영업 현황·재계약 현황), 재계약 연락 할 일, 일정표 작업.
// 공식은 AI 분석 스냅샷(src/lib/ai/snapshot/derive.ts)과 같게 맞춘다:
// 관리일 = 최근 작업일 + 관리 주기, 문의 후 15일 자동 실패, 견적 금액 해석(parseAmount), 수주 판정(isWonDeal).
// 매출은 고객 작업이력의 작업일·견적금액(VAT 포함) 기준이다 — 프로젝트 표는 2026-01 부터라 전년 비교가 안 된다.

import { normalizeCompanyName } from '../company';
import { ROLE_LABELS, ROLE_ORDER } from '../roles';
import { daysBetween } from '../ai/format';
import type { AiDatasets } from '../ai/types';
import { equipmentMix, num, parseAmount, ymd } from '../ai/snapshot/common';
import {
  AUTO_FAIL_DAYS,
  buildCtx,
  customerFacts,
  dealFacts,
  nextManagementDate,
  type CustomerFact,
  type DealFact,
} from '../ai/snapshot/derive';
import { buildDealStateMap, dealLinkState, isValidYmd, isWonDeal, type DealStateMap } from '../dealSync';

/** 재계약 연락 대상 등급 (B등급 이상) */
export const RENEWAL_GRADES: readonly string[] = ['S', 'A', 'B'];
/** 관리일 며칠 전부터 연락 할 일로 띄우는가 */
export const RENEWAL_LEAD_DAYS = 30;
/** 자동 실패까지 이 일수 이하로 남으면 '임박' */
export const EXPIRING_DAYS = 3;

export interface RevenueKpi {
  month: string;
  /** 작업일이 오늘까지인 금액 */
  done: number;
  /** 작업일이 남은 날인 금액 */
  planned: number;
  total: number;
  jobs: number;
  lastYearMonth: string;
  lastYearTotal: number;
  lastYearJobs: number;
  /** 작년 같은 달 1일 ~ 오늘 날짜 */
  lastYearSamePeriod: number;
  /** (이번 달 - 작년 같은 달) ÷ 작년 같은 달. 작년이 0이면 null */
  change: number | null;
}

export interface SalesKpi {
  /** 이번 달 문의 (문의 등록일 기준) */
  inquiries: number;
  /** 진행 중 딜 (수주 전, 문의 후 15일 이내) */
  open: number;
  openAmount: number;
  /** 자동 실패까지 EXPIRING_DAYS 이하 */
  expiring: number;
}

export interface RenewalKpi {
  /** 관리 중인 S·A·B 고객 */
  managed: number;
  /** 관리일까지 0~30일 */
  dueSoon: number;
  /** 관리일 지남 */
  overdue: number;
  /** 첫 작업 후 관리 주기가 한 번 이상 지난 고객 */
  eligible: number;
  /** 그중 작업 2회 이상 */
  renewed: number;
  rate: number | null;
}

export interface RenewalTodo {
  /** renewal:{고객ID}:{관리일} — 재작업하면 관리일이 바뀌어 새 할 일이 된다 */
  key: string;
  customerId: number;
  company: string;
  grade: string;
  dueDate: string;
  /** 관리일 - 오늘. 음수 = 지남 */
  daysToDue: number;
  contactName: string;
  contactPosition: string;
  /** 고객 담당자 → 예전 단일 필드 → 같은 회사 최근 딜 순으로 찾은 전화번호 (없으면 '') */
  phone: string;
  /** 전화번호가 없을 때 보여 줄 이메일 */
  email: string;
  manager: string;
  lastWorkDate: string;
  lastService: string;
  lastQuantity: number;
  /** 같은 회사에 진행 중인 딜이 있다 (중복 연락 방지) */
  openDeal: boolean;
}

export interface ScheduleEvent {
  id: string;
  date: string;
  days: number;
  company: string;
  customerId: number | null;
  service: string;
  quantity: number;
  detail: string;
  address: string;
  manager: string;
  subcontractors: string;
  crew: string;
  /** 견적 금액 (VAT 포함). 0 = 미입력 */
  amount: number;
  /** 수주 전 딜에 적힌 확정작업일 */
  tentative: boolean;
  dealId: number | null;
  projectId: number | null;
}

export type EventStatus = 'done' | 'today' | 'plan' | 'tent';

export interface PeakSeason {
  /** before = 다가오는 성수기까지, during = 성수기 진행 중 */
  phase: 'before' | 'during';
  /** before: 시작일까지 남은 날, during: 종료일까지 남은 날 (0 = 당일) */
  days: number;
  start: string;
  end: string;
  /** 1~12 */
  startMonth: number;
  endMonth: number;
  /** 추정에 쓴 작업 건수 (최근 3년) */
  jobs: number;
}

export interface HomeData {
  today: string;
  revenue: RevenueKpi;
  sales: SalesKpi;
  renewal: RenewalKpi;
  todos: RenewalTodo[];
  events: ScheduleEvent[];
  /** 데이터가 적어 추정할 수 없으면 null */
  peak: PeakSeason | null;
}

// ─── 공통 ──────────────────────────────────────────────────────────────

function parseJson(v: unknown): any {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

/** 수주 취소·삭제된 딜에 연결된 작업은 뺀다. 딜 목록이 없으면(states=null) 모두 유효 */
function isLiveLink(dealId: unknown, states: DealStateMap | null): boolean {
  const id = dealId != null && dealId !== '' ? Number(dealId) : null;
  const st = dealLinkState(id, states);
  return st === null || st === 'won';
}

function workHistoryOf(c: any): any[] {
  return Array.isArray(c?.workHistory) ? c.workHistory : [];
}

/**
 * 작업의 서비스 이름 — 연결된 딜의 희망서비스('에어컨전문세척|표면소독') 우선.
 * 작업이력의 프로젝트명은 회사명이 들어 있는 경우가 많아(절반 가까이) 회사명과 같으면 버린다.
 */
function serviceName(projectName: unknown, company: string, deal: any): string {
  const fromDeal = String(deal?.desiredService ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' · ');
  if (fromDeal) return fromDeal;
  const p = String(projectName ?? '').trim();
  if (!p || p === '미지정') return '';
  const a = normalizeCompanyName(p);
  const b = normalizeCompanyName(company);
  return a && b && (a === b || a.includes(b) || b.includes(a)) ? '' : p;
}

/** 진행 중 딜 — 영업 관리 자동 실패(15일 초과)와 같은 기준 */
function isOpenDeal(d: DealFact): boolean {
  if (d.result !== 'in-progress' || isWonDeal(d.d)) return false;
  return !Number.isFinite(d.age) || d.age <= AUTO_FAIL_DAYS;
}

export function eventStatus(ev: ScheduleEvent, date: string, today: string): EventStatus {
  if (ev.tentative) return 'tent';
  return date < today ? 'done' : date === today ? 'today' : 'plan';
}

// ─── 지표 ──────────────────────────────────────────────────────────────

export function revenueKpi(customers: any[], states: DealStateMap | null, today: string): RevenueKpi {
  const month = today.slice(0, 7);
  const lastYearMonth = `${Number(today.slice(0, 4)) - 1}${today.slice(4, 7)}`;
  const lastYearToday = `${lastYearMonth}${today.slice(7)}`;
  const r: RevenueKpi = {
    month,
    done: 0,
    planned: 0,
    total: 0,
    jobs: 0,
    lastYearMonth,
    lastYearTotal: 0,
    lastYearJobs: 0,
    lastYearSamePeriod: 0,
    change: null,
  };
  for (const c of customers) {
    for (const w of workHistoryOf(c)) {
      const date = ymd(w?.workDate);
      if (!date || !isLiveLink(w?.dealId, states)) continue;
      const amount = num(w?.quotationAmount);
      if (date.startsWith(month)) {
        r.total += amount;
        r.jobs += 1;
        if (date <= today) r.done += amount;
        else r.planned += amount;
      } else if (date.startsWith(lastYearMonth)) {
        r.lastYearTotal += amount;
        r.lastYearJobs += 1;
        if (date <= lastYearToday) r.lastYearSamePeriod += amount;
      }
    }
  }
  r.change = r.lastYearTotal > 0 ? (r.total - r.lastYearTotal) / r.lastYearTotal : null;
  return r;
}

export function salesKpi(deals: DealFact[], today: string): SalesKpi {
  const month = today.slice(0, 7);
  const open = deals.filter(isOpenDeal);
  return {
    inquiries: deals.filter((d) => d.date.startsWith(month)).length,
    open: open.length,
    openAmount: open.reduce((s, d) => s + d.amount, 0),
    expiring: open.filter((d) => d.daysLeft != null && d.daysLeft <= EXPIRING_DAYS).length,
  };
}

export function renewalKpi(customers: CustomerFact[], today: string): RenewalKpi {
  const managed = customers.filter((c) => RENEWAL_GRADES.includes(c.grade));
  let eligible = 0;
  let renewed = 0;
  for (const c of managed) {
    const dates = c.jobs.map((j) => j.workDate).filter(Boolean).sort();
    if (!dates.length) continue;
    const firstDue = nextManagementDate(dates[0], c.cycle);
    if (!firstDue || firstDue > today) continue;
    eligible += 1;
    if (dates.length >= 2) renewed += 1;
  }
  return {
    managed: managed.length,
    dueSoon: managed.filter((c) => c.daysToMgmt != null && c.daysToMgmt >= 0 && c.daysToMgmt <= RENEWAL_LEAD_DAYS).length,
    overdue: managed.filter((c) => c.daysToMgmt != null && c.daysToMgmt < 0).length,
    eligible,
    renewed,
    rate: eligible > 0 ? renewed / eligible : null,
  };
}

// ─── 재계약 연락 할 일 ───────────────────────────────────────────────────

interface ContactInfo {
  name: string;
  position: string;
  phone: string;
  email: string;
}

const str = (v: unknown) => String(v ?? '').trim();

function toContact(x: any): ContactInfo {
  return { name: str(x?.name ?? x?.contactName), position: str(x?.position ?? x?.contactPosition), phone: str(x?.phone), email: str(x?.email) };
}

/**
 * 연락할 사람 — 고객 담당자 목록(전화번호 있는 사람 우선) → 예전 단일 필드 → 같은 회사 최근 딜.
 * 오래된 고객은 고객 정보에 전화번호가 없고 딜에만 남아 있는 경우가 많다.
 */
function pickContact(c: any, dealContact: ContactInfo | undefined): ContactInfo {
  const list = parseJson(c?.contacts);
  const people = (Array.isArray(list) ? list.map(toContact) : []).filter((p) => p.name || p.phone || p.email);
  const legacy = toContact(c);
  const candidates = [...people, legacy, ...(dealContact ? [dealContact] : [])];
  const withPhone = candidates.find((p) => p.phone);
  const named = withPhone ?? candidates.find((p) => p.name) ?? legacy;
  return {
    name: named.name || candidates.find((p) => p.name)?.name || '',
    position: named.name ? named.position : candidates.find((p) => p.name)?.position || '',
    phone: withPhone?.phone || '',
    email: named.email || candidates.find((p) => p.email)?.email || '',
  };
}

/** 회사(정규화 이름) → 가장 최근 딜의 담당자·전화번호 */
function latestDealContacts(deals: DealFact[]): Map<string, ContactInfo> {
  const map = new Map<string, { date: string; info: ContactInfo }>();
  for (const f of deals) {
    const key = normalizeCompanyName(f.d?.company);
    const info = toContact(f.d);
    if (!key || !info.phone) continue;
    const cur = map.get(key);
    if (!cur || f.date > cur.date) map.set(key, { date: f.date, info });
  }
  return new Map([...map].map(([k, v]) => [k, v.info]));
}

const GRADE_ORDER: Record<string, number> = { S: 0, A: 1, B: 2 };

/** ① 연락 적기(D-30~D-0) D가 작은 순 ② 관리일 지난 곳, 최근에 지난 순. 같으면 S → A → B */
export function compareTodos(a: RenewalTodo, b: RenewalTodo): number {
  const wa = a.daysToDue >= 0 ? 0 : 1;
  const wb = b.daysToDue >= 0 ? 0 : 1;
  if (wa !== wb) return wa - wb;
  if (a.daysToDue !== b.daysToDue) return wa === 0 ? a.daysToDue - b.daysToDue : b.daysToDue - a.daysToDue;
  return (GRADE_ORDER[a.grade] ?? 9) - (GRADE_ORDER[b.grade] ?? 9) || a.company.localeCompare(b.company, 'ko');
}

export function renewalTodos(customers: CustomerFact[], deals: DealFact[]): RenewalTodo[] {
  const openCompanies = new Set(
    deals
      .filter(isOpenDeal)
      .map((d) => normalizeCompanyName(d.d?.company))
      .filter(Boolean),
  );
  const dealContacts = latestDealContacts(deals);
  const dealById = new Map<number, any>();
  for (const f of deals) if (f.id != null) dealById.set(f.id, f.d);
  const out: RenewalTodo[] = [];
  for (const c of customers) {
    if (!RENEWAL_GRADES.includes(c.grade)) continue;
    if (!c.nextMgmt || c.daysToMgmt == null || c.daysToMgmt > RENEWAL_LEAD_DAYS) continue;
    const id = Number(c.c?.id);
    if (!Number.isFinite(id)) continue;
    const contact = pickContact(c.c, dealContacts.get(normalizeCompanyName(c.company)));
    const last = c.jobs.find((j) => j.workDate) ?? c.jobs[0];
    out.push({
      key: `renewal:${id}:${c.nextMgmt}`,
      customerId: id,
      company: c.company,
      grade: c.grade,
      dueDate: c.nextMgmt,
      daysToDue: c.daysToMgmt,
      contactName: contact.name,
      contactPosition: contact.position,
      phone: contact.phone,
      email: contact.email,
      manager: c.manager === '미지정' ? '' : c.manager,
      lastWorkDate: c.lastWork,
      lastService: last ? serviceName(last.service, c.company, last.dealId != null ? dealById.get(last.dealId) : null) : '',
      lastQuantity: last?.quantity ?? 0,
      openDeal: openCompanies.has(normalizeCompanyName(c.company)),
    });
  }
  return out.sort(compareTodos);
}

// ─── 일정표 ────────────────────────────────────────────────────────────

function crewOf(wa: any): string {
  if (!wa || typeof wa !== 'object') return '';
  const parts = ROLE_ORDER.filter((r) => num(wa[r]) > 0).map((r) => `${ROLE_LABELS[r]} ${num(wa[r])}명`);
  if (Array.isArray(wa.extras)) {
    for (const e of wa.extras) {
      const n = num(e?.count);
      if (n > 0) parts.push(`${String(e?.label || '기타').trim() || '기타'} ${n}명`);
    }
  }
  return parts.join(' · ');
}

function detailOf(v: unknown): string {
  const s = equipmentMix(v, 80);
  return s === '-' ? '' : s.replace(/\s*\/\s*/g, ' · ');
}

export function scheduleEvents(ds: AiDatasets, deals: DealFact[], states: DealStateMap | null): ScheduleEvent[] {
  const dealById = new Map<number, any>();
  for (const d of ds.deals) if (d?.id != null) dealById.set(Number(d.id), d);
  const projectByDeal = new Map<number, any>();
  for (const p of ds.projects) if (p?.dealId) projectByDeal.set(Number(p.dealId), p);

  const events: ScheduleEvent[] = [];
  const jobDealIds = new Set<number>();
  for (const c of ds.customers) {
    workHistoryOf(c).forEach((w, i) => {
      const date = ymd(w?.workDate);
      if (!date || !isLiveLink(w?.dealId, states)) return;
      const dealId = w?.dealId != null && w.dealId !== '' ? Number(w.dealId) : null;
      if (dealId != null) jobDealIds.add(dealId);
      const deal = dealId != null ? dealById.get(dealId) : null;
      const project = dealId != null ? projectByDeal.get(dealId) : null;
      const wa = parseJson(project?.workerAssignments);
      const days = Math.min(14, Math.max(1, Math.round(num(wa?.days)) || 1));
      events.push({
        id: `w:${c.id}:${i}`,
        date,
        days,
        company: String(c.company || deal?.company || '-'),
        customerId: c.id != null ? Number(c.id) : null,
        service: serviceName(w?.projectName, String(c.company || ''), deal),
        quantity: num(w?.totalQuantity) || num(deal?.totalQuantity),
        detail: detailOf(w?.detailedQuantity) || detailOf(deal?.detailedQuantity),
        address: String(deal?.address || c.address || '').trim(),
        manager: String(w?.accountManager || deal?.salesManager || c.accountManager || '').trim(),
        subcontractors: String(w?.subcontractorManager || '').trim(),
        crew: crewOf(wa),
        amount: num(w?.quotationAmount),
        tentative: false,
        dealId,
        projectId: project?.id != null ? Number(project.id) : null,
      });
    });
  }

  // 가예정 — 아직 수주 전인 진행 딜에 적힌 확정작업일
  for (const f of deals) {
    if (!isOpenDeal(f) || f.id == null || jobDealIds.has(f.id)) continue;
    const date = ymd(f.d?.confirmedWorkDate);
    if (!date || !isValidYmd(date)) continue;
    events.push({
      id: `d:${f.id}`,
      date,
      days: 1,
      company: String(f.d?.company || '-'),
      customerId: null,
      service: serviceName('', String(f.d?.company || ''), f.d),
      quantity: num(f.d?.totalQuantity),
      detail: detailOf(f.d?.detailedQuantity),
      address: String(f.d?.address || '').trim(),
      manager: f.manager === '미지정' ? '' : f.manager,
      subcontractors: '',
      crew: '',
      amount: parseAmount(f.d?.quotationAmount),
      tentative: true,
      dealId: f.id,
      projectId: null,
    });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.company.localeCompare(b.company, 'ko'));
}

/** 날짜 → 그날 걸친 작업 (여러 날 작업은 이어지는 날마다 k번째로 펼친다) */
export function occurrencesByDate(events: ScheduleEvent[]): Map<string, Array<{ ev: ScheduleEvent; k: number }>> {
  const map = new Map<string, Array<{ ev: ScheduleEvent; k: number }>>();
  for (const ev of events) {
    for (let k = 0; k < ev.days; k++) {
      const d = new Date(`${ev.date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + k);
      const key = d.toISOString().slice(0, 10);
      const list = map.get(key);
      if (list) list.push({ ev, k });
      else map.set(key, [{ ev, k }]);
    }
  }
  return map;
}

// ─── 성수기 ────────────────────────────────────────────────────────────
// 최근 3년 작업 건수를 달별로 모아, 가장 바쁜 달에서 월평균의 PEAK_RATIO 배 이상인 이웃 달로 넓힌 구간을 성수기로 본다.
// 3년 창이라 각 달이 세 번씩 들어가 달끼리 공정하게 비교된다. 이어지지 않는 단발성 달(예: 대형 고객 한 번)은 빠진다.

export const PEAK_RATIO = 1.3;
const PEAK_MIN_JOBS = 36;
const PEAK_MAX_MONTHS = 6;

const pad2 = (n: number) => String(n).padStart(2, '0');

function lastDayOf(year: number, month1: number): string {
  return `${year}-${pad2(month1)}-${pad2(new Date(Date.UTC(year, month1, 0)).getUTCDate())}`;
}

export function peakSeason(customers: any[], states: DealStateMap | null, today: string): PeakSeason | null {
  const from = `${Number(today.slice(0, 4)) - 3}${today.slice(4)}`;
  const byMonth = new Array<number>(12).fill(0);
  let jobs = 0;
  for (const c of customers) {
    for (const w of workHistoryOf(c)) {
      const date = ymd(w?.workDate);
      if (!date || date <= from || date > today || !isLiveLink(w?.dealId, states)) continue;
      byMonth[Number(date.slice(5, 7)) - 1] += 1;
      jobs += 1;
    }
  }
  if (jobs < PEAK_MIN_JOBS) return null;
  const cut = (jobs / 12) * PEAK_RATIO;
  let top = 0;
  for (let m = 1; m < 12; m++) if (byMonth[m] > byMonth[top]) top = m;
  if (byMonth[top] < cut) return null;

  // 더 바쁜 쪽 이웃부터 한 달씩 넓힌다 (연말·연초를 넘어 이어질 수 있다)
  let first = top;
  let last = top;
  for (let len = 1; len < PEAK_MAX_MONTHS; len++) {
    const left = (first + 11) % 12;
    const right = (last + 1) % 12;
    const okLeft = byMonth[left] >= cut;
    const okRight = byMonth[right] >= cut;
    if (!okLeft && !okRight) break;
    if (okRight && (!okLeft || byMonth[right] >= byMonth[left])) last = right;
    else first = left;
  }

  // 오늘이 걸치거나 오늘 뒤에 오는 첫 회차 (작년에 시작해 올해 끝나는 성수기도 본다)
  const year = Number(today.slice(0, 4));
  for (const y of [year - 1, year, year + 1]) {
    const start = `${y}-${pad2(first + 1)}-01`;
    const end = lastDayOf(last >= first ? y : y + 1, last + 1);
    if (end < today) continue;
    const during = start <= today;
    return {
      phase: during ? 'during' : 'before',
      days: daysBetween(today, during ? end : start),
      start,
      end,
      startMonth: first + 1,
      endMonth: last + 1,
      jobs,
    };
  }
  return null;
}

// ─── 한 번에 ───────────────────────────────────────────────────────────

export function computeHome(ds: AiDatasets, today: string): HomeData {
  const ctx = buildCtx(ds, today);
  const states = ds.deals.length ? buildDealStateMap(ds.deals) : null;
  const deals = dealFacts(ctx);
  const customers = customerFacts(ctx);
  return {
    today,
    revenue: revenueKpi(ds.customers, states, today),
    sales: salesKpi(deals, today),
    renewal: renewalKpi(customers, today),
    todos: renewalTodos(customers, deals),
    events: scheduleEvents(ds, deals, states),
    peak: peakSeason(ds.customers, states, today),
  };
}
