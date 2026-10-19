// 전문가 스냅샷이 함께 쓰는 파생 지표 — 저장된 집계 필드 대신 원본 기록(딜·작업 이력·평가)에서 다시 계산한다.
// 공식은 화면과 같게 맞춘다: 자동 실패(SalesPage), 다음 관리일(CustomersPage), 최종 점수·등급(SupplyChainPage), 손익(ProfitPage·projects_api.php).
// 쓰지 않는 저장 필드: 고객책임자 매출·성과평가·재구매율·진행/완료 건수, 작업팀장 진행/완료 건수·저장 등급(C) — 아무도 채우지 않는다.
// 고객 nextManagementDate(생성 때만 계산), 프로젝트 aiApplied(더 이상 켜지지 않음).

import { normalizeCompanyName } from '../../company';
import { ROLE_ORDER, type RoleCode } from '../../roles';
import { daysBetween } from '../format';
import type { AiDatasets } from '../types';
import { addDays, addMonths, areaOfSido, MANAGER_STATUS, num, parseAmount, sidoOf, SUB_STATUS, ymd } from './common';

/** 문의 등록 후 이 일수를 넘기도록 진행중이면 자동 실패 (SalesPage: diffDays > 15) */
export const AUTO_FAIL_DAYS = 15;
const CYCLE_MONTHS: Record<number, number> = { 30: 1, 90: 3, 180: 6, 365: 12, 730: 24 };

export interface Job {
  customer: any;
  company: string;
  grade: string;
  dealId: number | null;
  service: string;
  workDate: string;
  inquiryDate: string;
  amount: number;
  quantity: number;
  manager: string;
  subcontractors: string[];
  reportSent: boolean;
  remindersSent: number;
  sido: string;
  area: string;
}

export interface Ctx {
  today: string;
  ds: AiDatasets;
  customerByName: Map<string, any>;
  customerById: Map<number, any>;
  dealById: Map<number, any>;
  jobs: Job[];
  jobByDealId: Map<number, Job>;
}

export function gradeOf(v: unknown): string {
  return v === 'S' || v === 'A' || v === 'B' ? v : '미설정';
}

export function buildCtx(ds: AiDatasets, today: string): Ctx {
  const customerByName = new Map<string, any>();
  const customerById = new Map<number, any>();
  const jobs: Job[] = [];
  const jobByDealId = new Map<number, Job>();
  for (const c of ds.customers) {
    const key = normalizeCompanyName(c.company);
    if (key && !customerByName.has(key)) customerByName.set(key, c);
    if (c.id != null) customerById.set(Number(c.id), c);
    const sido = sidoOf(c.address);
    for (const w of Array.isArray(c.workHistory) ? c.workHistory : []) {
      const job: Job = {
        customer: c,
        company: String(c.company || '-'),
        grade: gradeOf(c.grade),
        dealId: w.dealId != null && w.dealId !== '' ? Number(w.dealId) : null,
        service: String(w.projectName || '').trim() || '미지정',
        workDate: ymd(w.workDate),
        inquiryDate: ymd(w.inquiryDate),
        amount: num(w.quotationAmount),
        quantity: num(w.totalQuantity),
        manager: String(w.accountManager || '').trim(),
        subcontractors: String(w.subcontractorManager || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        reportSent: !!w.reportSent,
        remindersSent: [w.reminder1, w.reminder2, w.reminder3].filter(Boolean).length,
        sido,
        area: areaOfSido(sido),
      };
      jobs.push(job);
      if (job.dealId != null && !jobByDealId.has(job.dealId)) jobByDealId.set(job.dealId, job);
    }
  }
  const dealById = new Map<number, any>();
  for (const d of ds.deals) if (d.id != null) dealById.set(Number(d.id), d);
  return { today, ds, customerByName, customerById, dealById, jobs, jobByDealId };
}

// ─── 기록 입력 현황 ─────────────────────────────────────────────────────
// 기능을 거의 쓰지 않는 체크 항목(리포트 전송·작업팀장 배정)은 "미발송·미배정 목록"이 의미가 없다 — 쓰는지 먼저 본다.

/** 이 비율 미만이면 그 기록은 "거의 쓰지 않음"으로 보고 목록·경고 대신 입력 현황만 알린다 */
export const LOW_USAGE = 0.2;

export interface Usage {
  pastJobs: number;
  reportSent: number;
  reportRate: number | null;
  subAssigned: number;
  subAssignRate: number | null;
}

export function usageOf(ctx: Ctx): Usage {
  const past = ctx.jobs.filter((j) => j.workDate && j.workDate <= ctx.today);
  const reportSent = past.filter((j) => j.reportSent).length;
  const subAssigned = ctx.jobs.filter((j) => j.subcontractors.length > 0).length;
  return {
    pastJobs: past.length,
    reportSent,
    reportRate: past.length ? reportSent / past.length : null,
    subAssigned,
    subAssignRate: ctx.jobs.length ? subAssigned / ctx.jobs.length : null,
  };
}

export function isLowUsage(rate: number | null): boolean {
  return rate == null || rate < LOW_USAGE;
}

// ─── 서비스 분류 (교차판매용) ───────────────────────────────────────────

export function serviceCategory(service: string): string {
  if (/에어컨|냉난방|실외기/.test(service)) return '에어컨세척';
  if (/방제|해충|방역|바퀴|쥐|흰개미/.test(service)) return '해충방제';
  if (/소독|살균|멸균/.test(service)) return '표면소독';
  if (/공기|환기|미세|라돈|필터|덕트/.test(service)) return '실내공기질';
  return '기타';
}

// ─── 딜 ────────────────────────────────────────────────────────────────

export interface DealFact {
  d: any;
  id: number | null;
  date: string;
  amount: number;
  stage: string;
  result: string;
  manager: string;
  service: string;
  quantity: number;
  /** 문의 등록 후 경과일 (오늘 KST 기준) */
  age: number;
  /** 진행중 딜의 자동 실패까지 남은 일수. 0 이하 = 이미 지났는데 미처리 */
  daysLeft: number | null;
  sido: string;
  area: string;
  /** 이 딜 이전에 작업 이력이 있는 회사 */
  existing: boolean;
  /** 수주 딜의 문의 → 확정작업일 일수 */
  leadDays: number | null;
}

export function dealFacts(ctx: Ctx): DealFact[] {
  return ctx.ds.deals.map((d) => {
    const date = ymd(d.registrationDate);
    const age = date ? daysBetween(date, ctx.today) : NaN;
    const result = String(d.successStatus || '');
    const customer = ctx.customerByName.get(normalizeCompanyName(d.company));
    const myId = d.id != null ? Number(d.id) : null;
    const existing =
      !!customer &&
      (Array.isArray(customer.workHistory) ? customer.workHistory : []).some((w: any) => {
        if (myId != null && Number(w.dealId) === myId) return false;
        const wd = ymd(w.workDate) || ymd(w.inquiryDate);
        return !!wd && !!date && wd < date;
      });
    const sido = sidoOf(d.address);
    const confirmed = ymd(d.confirmedWorkDate);
    return {
      d,
      id: myId,
      date,
      amount: parseAmount(d.quotationAmount),
      stage: String(d.status || ''),
      result,
      manager: String(d.salesManager || '').trim() || '미지정',
      service: String(d.desiredService || '').trim() || '미지정',
      quantity: num(d.totalQuantity),
      age,
      daysLeft: result === 'in-progress' && Number.isFinite(age) ? AUTO_FAIL_DAYS + 1 - age : null,
      sido,
      area: areaOfSido(sido),
      existing,
      leadDays: result === 'success' && confirmed && date ? daysBetween(date, confirmed) : null,
    };
  });
}

export function quantityBand(q: number): string {
  if (q <= 0) return '수량 미입력';
  if (q < 10) return '1~9대';
  if (q < 30) return '10~29대';
  if (q < 100) return '30~99대';
  return '100대 이상';
}

export function amountBand(won: number): string {
  if (won <= 0) return '견적 미입력';
  if (won < 1_000_000) return '100만원 미만';
  if (won < 5_000_000) return '100~500만원';
  if (won < 20_000_000) return '500~2,000만원';
  return '2,000만원 이상';
}

// ─── 고객 ──────────────────────────────────────────────────────────────

export interface CustomerFact {
  c: any;
  company: string;
  grade: string;
  status: string;
  jobs: Job[];
  jobCount: number;
  amount: number;
  lastWork: string;
  cycle: number;
  /** 최근 작업일 + 관리 주기 (고객 상세 화면과 같은 계산) */
  nextMgmt: string;
  /** 다음 관리일 - 오늘. 음수 = 기한 초과 */
  daysToMgmt: number | null;
  /** 오늘 - 최근 작업일 */
  recency: number | null;
  categories: string[];
  services: string[];
  avgInterval: number | null;
  manager: string;
  sido: string;
  newsletter: string;
  segment: string;
}

export function nextManagementDate(lastWork: string, cycle: number): string {
  if (!lastWork || cycle <= 0) return '';
  const months = CYCLE_MONTHS[cycle];
  return months ? addMonths(lastWork, months) : addDays(lastWork, cycle);
}

export const SEGMENT_RULES = [
  '작업 이력 없음: 작업 기록이 없음',
  '휴면: 최근 작업 후 관리 주기의 2배 넘게 작업 없음',
  '이탈 위험: 다음 관리일이 지났고, 금액 상위 20% 이거나 작업 2회 이상',
  '관리 지연: 다음 관리일이 지난 나머지 고객',
  'VIP: 기한 안이면서 금액 상위 20%, 작업 2회 이상',
  '충성: 기한 안이면서 작업 3회 이상',
  '재구매: 기한 안이면서 작업 2회',
  '신규: 기한 안이면서 작업 1회',
];

export function customerFacts(ctx: Ctx): CustomerFact[] {
  const jobsByCustomer = new Map<any, Job[]>();
  for (const j of ctx.jobs) {
    const list = jobsByCustomer.get(j.customer);
    if (list) list.push(j);
    else jobsByCustomer.set(j.customer, [j]);
  }
  const amounts = ctx.ds.customers.map((c) => num(c.totalAmount)).filter((a) => a > 0).sort((a, b) => b - a);
  const topCut = amounts.length ? amounts[Math.max(0, Math.ceil(amounts.length * 0.2) - 1)] : Infinity;

  return ctx.ds.customers.map((c) => {
    const jobs = (jobsByCustomer.get(c) ?? []).slice().sort((a, b) => b.workDate.localeCompare(a.workDate));
    const jobCount = jobs.length || num(c.deals);
    const amount = num(c.totalAmount);
    const lastWork = ymd(c.lastWorkDate) || jobs.find((j) => j.workDate)?.workDate || '';
    const cycle = num(c.managementCycle) || 365;
    const nextMgmt = nextManagementDate(lastWork, cycle);
    const daysToMgmt = nextMgmt ? daysBetween(ctx.today, nextMgmt) : null;
    const recency = lastWork ? daysBetween(lastWork, ctx.today) : null;
    const dates = jobs.map((j) => j.workDate).filter(Boolean).sort();
    let avgInterval: number | null = null;
    if (dates.length >= 2) {
      let sum = 0;
      for (let i = 1; i < dates.length; i++) sum += daysBetween(dates[i - 1], dates[i]);
      avgInterval = Math.round(sum / (dates.length - 1));
    }
    const services = [...new Set(jobs.map((j) => j.service))];
    const categories = [...new Set(services.map(serviceCategory))];
    const high = amount > 0 && amount >= topCut;
    const overdue = daysToMgmt != null && daysToMgmt < 0;
    let segment: string;
    if (jobCount === 0) segment = '작업 이력 없음';
    else if (recency != null && recency > cycle * 2) segment = '휴면';
    else if (overdue && (high || jobCount >= 2)) segment = '이탈 위험';
    else if (overdue) segment = '관리 지연';
    else if (high && jobCount >= 2) segment = 'VIP';
    else if (jobCount >= 3) segment = '충성';
    else if (jobCount === 2) segment = '재구매';
    else segment = '신규';
    return {
      c,
      company: String(c.company || '-'),
      grade: gradeOf(c.grade),
      status: String(c.customerStatus || '신규'),
      jobs,
      jobCount,
      amount,
      lastWork,
      cycle,
      nextMgmt,
      daysToMgmt,
      recency,
      categories,
      services,
      avgInterval,
      manager: String(c.accountManager || '').trim() || '미지정',
      sido: sidoOf(c.address),
      newsletter: String(c.newsletterStatus || 'none'),
      segment,
    };
  });
}

// ─── 작업팀장 ───────────────────────────────────────────────────────────

export const EVAL_ITEMS = [
  ['evalCustomerClaim', '고객클레임'],
  ['evalAllDevices', '모든 기기 작업'],
  ['evalOnTime', '작업 예정시간'],
  ['evalAfterService', 'A/S 발생'],
  ['evalUniform', '유니폼'],
  ['evalKindness', '친절'],
] as const;

export function finalGrade(score: number): string {
  if (score >= 80) return '1등급';
  if (score >= 60) return '2등급';
  if (score >= 40) return '3등급';
  if (score >= 20) return '4등급';
  return '퇴출 심사';
}

export interface SubFact {
  s: any;
  name: string;
  score: number;
  grade: string;
  base: number;
  evalSum: number;
  repurchase: number;
  coop: number;
  jobCount: number;
  jobs90: number;
  lastJob: string;
  upcoming: number;
  evaluated: number;
  /** 작업일이 오늘 이전인 작업 수 / 그중 평가된 수 */
  pastJobs: number;
  pastEvaluated: number;
  /** 평가 입력률 = 평가된 지난 작업 ÷ 지난 작업 */
  coverage: number | null;
  negatives: Record<string, number>;
  avgJobScore: number | null;
  recentAvg: number | null;
  prevAvg: number | null;
  status: string;
  area: string;
  specialization: string;
  teamSize: number;
  coopEvals: number;
  lastCoopMemo: string;
}

function isEvaluated(a: any): boolean {
  return EVAL_ITEMS.some(([k]) => a?.[k] !== undefined && a?.[k] !== null && a?.[k] !== '');
}

export function subFacts(ctx: Ctx): SubFact[] {
  const ago90 = addDays(ctx.today, -90);
  return ctx.ds.subcontractors.map((s) => {
    const acts: any[] = Array.isArray(s.recentActivities) ? s.recentActivities : [];
    const base = num(s.baseScore) || 50;
    const evalSum = acts.reduce((sum, a) => sum + num(a.workEvaluationScore), 0);
    const repurchase = num(s.repurchaseCount);
    const coop = num(s.cooperationScore);
    const score = base + evalSum + repurchase * 3 + coop;
    const dated = acts.map((a) => ({ a, date: ymd(a.workDate) }));
    const past = dated.filter((x) => x.date && x.date <= ctx.today);
    const evaluated = dated.filter((x) => isEvaluated(x.a)).sort((x, y) => y.date.localeCompare(x.date));
    const negatives: Record<string, number> = {};
    for (const [k, label] of EVAL_ITEMS) negatives[label] = evaluated.filter((x) => num(x.a[k]) < 0).length;
    const scores = evaluated.map((x) => num(x.a.workEvaluationScore));
    const pastEvaluated = evaluated.filter((x) => x.date && x.date <= ctx.today).length;
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const history: any[] = Array.isArray(s.evaluationHistory) ? s.evaluationHistory : [];
    const lastCoop = history.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
    return {
      s,
      name: String(s.name || '-'),
      score,
      grade: finalGrade(score),
      base,
      evalSum,
      repurchase,
      coop,
      jobCount: acts.length,
      jobs90: past.filter((x) => x.date >= ago90).length,
      lastJob: past.map((x) => x.date).sort().pop() || '',
      upcoming: dated.filter((x) => x.date && x.date > ctx.today).length,
      evaluated: evaluated.length,
      pastJobs: past.length,
      pastEvaluated,
      coverage: past.length ? pastEvaluated / past.length : null,
      negatives,
      avgJobScore: avg(scores),
      recentAvg: avg(scores.slice(0, 3)),
      prevAvg: scores.length > 3 ? avg(scores.slice(3, 6)) : null,
      status: SUB_STATUS[s.status] ?? String(s.status || '-'),
      area: String(s.assignedArea || '').trim() || '미지정',
      specialization: String(s.specialization || '').trim(),
      teamSize: num(s.teamSize),
      coopEvals: history.length,
      lastCoopMemo: lastCoop?.memo ? String(lastCoop.memo) : '',
    };
  });
}

// ─── 고객책임자 ─────────────────────────────────────────────────────────

export interface ManagerFact {
  m: any;
  name: string;
  status: string;
  area: string;
  deals: number;
  won: number;
  lost: number;
  open: number;
  wonAmount: number;
  urgent: number;
  customers: number;
  byGrade: Record<string, number>;
  overdue: number;
  repeatCustomers: number;
  jobs90: number;
  upcoming: number;
}

export function managerFacts(ctx: Ctx, deals: DealFact[], customers: CustomerFact[]): ManagerFact[] {
  const ago90 = addDays(ctx.today, -90);
  return ctx.ds.managers.map((m) => {
    const name = String(m.name || '').trim();
    const mine = deals.filter((d) => d.manager === name);
    const cust = customers.filter((c) => c.manager === name);
    const byGrade: Record<string, number> = {};
    for (const c of cust) byGrade[c.grade] = (byGrade[c.grade] ?? 0) + 1;
    const jobs = ctx.jobs.filter((j) => j.manager === name);
    return {
      m,
      name: name || '-',
      status: MANAGER_STATUS[m.status] ?? String(m.status || '-'),
      area: String(m.assignedArea || '').trim() || '미지정',
      deals: mine.length,
      won: mine.filter((d) => d.result === 'success').length,
      lost: mine.filter((d) => d.result === 'failed').length,
      open: mine.filter((d) => d.result === 'in-progress').length,
      wonAmount: mine.filter((d) => d.result === 'success').reduce((s, d) => s + d.amount, 0),
      urgent: mine.filter((d) => d.daysLeft != null && d.daysLeft <= 3).length,
      customers: cust.length,
      byGrade,
      overdue: cust.filter((c) => c.daysToMgmt != null && c.daysToMgmt < 0).length,
      repeatCustomers: cust.filter((c) => c.jobCount >= 2).length,
      jobs90: jobs.filter((j) => j.workDate && j.workDate >= ago90 && j.workDate <= ctx.today).length,
      upcoming: jobs.filter((j) => j.workDate > ctx.today).length,
    };
  });
}

// ─── 프로젝트 ───────────────────────────────────────────────────────────

export interface ProjectFact {
  p: any;
  name: string;
  company: string;
  service: string;
  workDate: string;
  status: string;
  quantity: number;
  hasStaffing: boolean;
  revenue: number;
  labor: number;
  variable: number;
  meal: number;
  transport: number;
  other: number;
  total: number;
  profit: number;
  margin: number | null;
  laborRatio: number | null;
  roles: Record<RoleCode, number>;
  days: number;
  extras: number;
  aiStatus: string;
  aiMargin: number | null;
  aiDiff: Record<string, number> | null;
}

function parseJson(v: unknown): any {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

export function projectFacts(ctx: Ctx): ProjectFact[] {
  return ctx.ds.projects.map((p) => {
    const wa = parseJson(p.workerAssignments) ?? {};
    const roles = {} as Record<RoleCode, number>;
    for (const r of ROLE_ORDER) roles[r] = num(wa[r]);
    const revenue = num(p.netRevenue);
    const labor = num(p.laborCost);
    const meal = num(p.mealCost);
    const transport = num(p.transportCost);
    const other = num(p.otherCost);
    const variable = meal + transport + other;
    const total = num(p.totalCost) || labor + variable;
    const profit = p.netProfit != null ? num(p.netProfit) : revenue - total;
    const dealId = p.dealId != null ? Number(p.dealId) : null;
    const deal = dealId != null ? ctx.dealById.get(dealId) : null;
    const job = dealId != null ? ctx.jobByDealId.get(dealId) : null;
    const ai = parseJson(p.aiSuggestion);
    let aiDiff: Record<string, number> | null = null;
    if (ai?.assignments) {
      aiDiff = {};
      for (const r of ROLE_ORDER) aiDiff[r] = roles[r] - num(ai.assignments[r]);
      aiDiff.days = num(wa.days) - num(ai.assignments.days);
    }
    return {
      p,
      name: String(p.projectName || '-'),
      company: String(ctx.customerById.get(Number(p.customerId))?.company || deal?.company || job?.company || '-'),
      service: String(p.serviceType || p.projectName || '기타').trim() || '기타',
      workDate: ymd(p.workDate),
      status: p.status === 'completed' ? '완료' : '진행중',
      quantity: job?.quantity || num(deal?.totalQuantity),
      hasStaffing: labor > 0,
      revenue,
      labor,
      variable,
      meal,
      transport,
      other,
      total,
      profit,
      margin: revenue > 0 ? profit / revenue : null,
      laborRatio: revenue > 0 ? labor / revenue : null,
      roles,
      days: num(wa.days),
      extras: Array.isArray(wa.extras) ? wa.extras.length : 0,
      aiStatus: String(p.aiStatus || '-'),
      aiMargin: ai && Number.isFinite(Number(ai.estimatedProfitRatio)) ? Number(ai.estimatedProfitRatio) : null,
      aiDiff,
    };
  });
}
