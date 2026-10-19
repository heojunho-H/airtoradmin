// 견적서 입력 도우미 — 판독 결과를 딜·프로젝트 변경으로 바꾼다: 매칭(후보·점수), 변경표, 페이로드, 반영.
// 딜 PUT 은 행 전체를 덮어쓰므로(deals_api.php) 반영 직전에 최신 딜을 다시 받아 필요한 필드만 바꾼다.
// 수주 딜은 서버가 고객 작업 이력을 dealId 로 갱신하지만, 프로젝트는 생성 후 갱신되지 않고 부가세·순매출도
// 다시 계산하지 않으므로(projects_api.php) 견적·부가세·순매출을 직접 보낸다.

import { normalizeCompanyName } from '../company';
import { daysBetween, kstYmd } from './format';
import type { QuoteExtraction } from './files';
import { parseAmount, RESULT_LABELS, STAGE_LABELS } from './snapshot/common';

/** 영업 화면 상세 수량 키 (SalesPage.tsx) — 저장할 때 10개를 모두 쓴다 */
export const EQUIPMENT_KEYS = ['벽걸이형', '스탠드 일반형', '스탠드 대형', '1way 천정형', '2way 천정형', '4way 천정형', '원형 천정형', 'FCU형', '매립덕트형', '실외기'];

/** 딜 견적 금액 문자열 — 만 원 단위면 "₩115만", 아니면 원 단위 정수 "1155000".
 *  서버(deals_api.php parseQuotationAmount)는 "₩115.5만"을 floatval×10000 → intval 로 읽어 부동소수 오차로 1원이 빠질 수 있다. */
export function amountText(won: number): string {
  const man = won / 10_000;
  return Number.isInteger(man) ? `₩${man.toLocaleString('ko-KR')}만` : String(Math.round(won));
}

export function manwonText(won: number): string {
  return won ? `${Math.round(won / 10_000).toLocaleString('ko-KR')}만원` : '-';
}

export function wonText(won: number): string {
  return won ? `${won.toLocaleString('ko-KR')}원` : '';
}

export function detailedQuantityJson(ex: QuoteExtraction): string {
  const categories: Record<string, number> = {};
  for (const k of EQUIPMENT_KEYS) categories[k] = ex.equipment[k] ?? 0;
  return JSON.stringify({ categories, others: ex.otherItems.map((o) => ({ name: o.name, quantity: o.quantity })) });
}

/** 장비 구성 → [이름, 대수] 목록 (0 제외, 영업 화면 키 순서 → 그 밖의 키 → 기타 품목). 저장 JSON 이 아니면 null */
function equipmentEntries(src: QuoteExtraction | string | null | undefined): Array<[string, number]> | null {
  if (!src) return [];
  let cats: Record<string, unknown> = {};
  let others: unknown[] = [];
  if (typeof src === 'string') {
    if (!src.trim()) return [];
    try {
      const parsed = JSON.parse(src);
      cats = parsed?.categories ?? {};
      others = Array.isArray(parsed?.others) ? parsed.others : [];
    } catch {
      return null;
    }
  } else {
    cats = src.equipment;
    others = src.otherItems;
  }
  const keys = [...EQUIPMENT_KEYS.filter((k) => k in cats), ...Object.keys(cats).filter((k) => !EQUIPMENT_KEYS.includes(k))];
  const out: Array<[string, number]> = keys.map((k): [string, number] => [k, Number(cats[k]) || 0]).filter(([, n]) => n > 0);
  for (const o of others) {
    if (typeof o === 'string' && o.trim()) out.push([o.trim(), 0]);
    else if (o && typeof o === 'object' && (o as { name?: string }).name) {
      out.push([String((o as { name: string }).name).trim(), Number((o as { quantity?: number }).quantity) || 0]);
    }
  }
  return out;
}

/** 장비 구성 한 줄 — 판독 결과 또는 딜에 저장된 JSON */
export function equipmentSummary(src: QuoteExtraction | string | null | undefined): string {
  const entries = equipmentEntries(src);
  if (entries === null) return typeof src === 'string' ? src.trim().slice(0, 40) : '-';
  return entries.map(([k, n]) => (n ? `${k} ${n}` : k)).join(' · ') || '-';
}

/** 두 장비 구성이 같은지 (키 순서·0 값·표기 차이 무시) */
function sameEquipment(a: QuoteExtraction | string | null | undefined, b: QuoteExtraction | string | null | undefined): boolean {
  const ea = equipmentEntries(a);
  const eb = equipmentEntries(b);
  if (ea === null || eb === null) return false;
  const key = (e: Array<[string, number]>) => JSON.stringify([...e].sort(([x], [y]) => x.localeCompare(y)));
  return key(ea) === key(eb);
}

export function serviceLabel(ex: QuoteExtraction): string {
  return ex.serviceCategory && ex.serviceCategory !== '기타' ? ex.serviceCategory : ex.serviceName || '기타';
}

function serviceMatches(desired: unknown, ex: QuoteExtraction): boolean {
  const d = String(desired || '');
  if (!d) return false;
  const cat = ex.serviceCategory;
  if (cat === '에어컨세척') return /에어컨|냉난방/.test(d);
  if (cat === '해충방제') return /방제|해충|방역/.test(d);
  if (cat === '표면소독') return /소독|살균/.test(d);
  if (cat === '실내공기질') return /공기/.test(d);
  return d.includes(ex.serviceName.slice(0, 4));
}

// ─── 매칭 ──────────────────────────────────────────────────────────────

export interface DealCandidate {
  deal: any;
  score: number;
  reasons: string[];
  /** 이미 같은 견적 금액이 들어 있음 */
  alreadyEntered: boolean;
  /** 회사명이 정확히 같지 않고 비슷한 후보 */
  similar: boolean;
  /** 같은 영업 기회로 볼 수 있는 문의일 (견적일 60일 전 ~ 7일 후) — 창 밖 딜은 기본 선택하지 않는다 */
  inWindow: boolean;
}

export interface MatchResult {
  companyKey: string;
  customer: any | null;
  candidates: DealCandidate[];
  /** 정확히 같은 회사가 없을 때 비슷한 이름 */
  similarCompanies: string[];
  /** 기본으로 고를 딜 ID (없으면 새 딜) */
  defaultDealId: number | null;
  /** 기본 선택이 분명함: 정확한 회사명 + 창 안 + 2위와 15점 이상 차이 (일괄 입력에서 미리 체크하는 조건 중 하나) */
  clear: boolean;
  /** 같은 회사 딜이 있지만 모두 창 밖이라 새 딜로 둔 경우 안내 */
  note: string | null;
}

/** 같은 영업 기회 창 — 문의일이 견적일 60일 전부터 7일 후까지 */
export const WINDOW_BEFORE_DAYS = 60;
export const WINDOW_AFTER_DAYS = 7;
const CLEAR_MARGIN = 15;

function labelIn(label: string, d: any): boolean {
  const l = label.replace(/\s+/g, '');
  if (l.length < 2) return false;
  return [d.company, d.address, d.requirements, d.managementMemo, d.desiredService].some((v) => String(v || '').replace(/\s+/g, '').includes(l));
}

function scoreDeal(d: any, ex: QuoteExtraction, quoteDate: string, similar: boolean): DealCandidate {
  let score = similar ? 0 : 40;
  const reasons: string[] = [];
  let inWindow = false;
  const reg = String(d.registrationDate || '').slice(0, 10);
  const diff = /^\d{4}-\d{2}-\d{2}$/.test(reg) ? daysBetween(reg, quoteDate) : NaN;
  if (Number.isFinite(diff)) {
    if (diff >= 0 && diff <= 30) {
      score += 30 - diff;
      inWindow = true;
      reasons.push(diff === 0 ? '견적일에 문의' : `견적 ${diff}일 전 문의`);
    } else if (diff > 30 && diff <= WINDOW_BEFORE_DAYS) {
      score += 3;
      inWindow = true;
      reasons.push(`견적 ${diff}일 전 문의`);
    } else if (diff < 0 && diff >= -WINDOW_AFTER_DAYS) {
      score += 10;
      inWindow = true;
      reasons.push(`견적 ${-diff}일 뒤 등록`);
    } else {
      // 재구매 고객의 지난 딜일 가능성 — 기본 선택하지 않는다
      score -= 20;
      reasons.push(diff > 0 ? `견적보다 ${diff}일 전 문의 — 다른 작업건일 수 있음` : `견적보다 ${-diff}일 뒤 등록 — 다른 작업건일 수 있음`);
    }
  } else {
    reasons.push('문의일 없음');
  }
  const qty = Number(d.totalQuantity) || 0;
  if (qty && ex.totalQuantity) {
    if (qty === ex.totalQuantity) {
      score += 25;
      reasons.push(`수량 ${qty}대 일치`);
    } else if (Math.abs(qty - ex.totalQuantity) / ex.totalQuantity <= 0.2) {
      score += 10;
      reasons.push(`수량 비슷(${qty}대)`);
    } else {
      reasons.push(`수량 다름(${qty}대)`);
    }
  }
  if (d.successStatus === 'in-progress') {
    score += 15;
    reasons.push('진행중');
  } else if (d.successStatus === 'success' || d.status === 'confirmed') {
    score += 12;
    reasons.push('수주');
  } else if (d.successStatus === 'no-quote') {
    score += 8;
    reasons.push('미견적');
  } else if (d.successStatus === 'failed') {
    score -= 15;
    reasons.push('계약 실패');
  }
  if (serviceMatches(d.desiredService, ex)) {
    score += 8;
    reasons.push('서비스 일치');
  }
  if (ex.variantLabel && labelIn(ex.variantLabel, d)) {
    score += 10;
    reasons.push(`"${ex.variantLabel}" 일치`);
  }
  const alreadyEntered = !!ex.quotedTotal && parseAmount(d.quotationAmount) === ex.quotedTotal;
  if (alreadyEntered) reasons.push('같은 견적 금액이 이미 입력됨');
  return { deal: d, score, reasons, alreadyEntered, similar, inWindow };
}

export function matchQuote(ex: QuoteExtraction, deals: any[], customers: any[], today = kstYmd()): MatchResult {
  const key = normalizeCompanyName(ex.recipientCompany);
  const exact = key ? deals.filter((d) => normalizeCompanyName(d.company) === key) : [];
  const similarDeals: any[] = [];
  const similarNames = new Set<string>();
  const isSimilar = (k: string) => !!k && k !== key && key.length >= 2 && k.length >= 2 && (k.includes(key) || key.includes(k));
  if (!exact.length && key) {
    for (const d of deals) if (isSimilar(normalizeCompanyName(d.company))) similarDeals.push(d);
    for (const d of similarDeals) similarNames.add(String(d.company));
    for (const c of customers) if (isSimilar(normalizeCompanyName(c.company))) similarNames.add(String(c.company));
  }
  const quoteDate = /^\d{4}-\d{2}-\d{2}$/.test(ex.quoteDate) ? ex.quoteDate : today;
  const candidates = [...exact.map((d) => scoreDeal(d, ex, quoteDate, false)), ...similarDeals.map((d) => scoreDeal(d, ex, quoteDate, true))]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  // 기본 선택: 창 안의 최고점 (비슷한 이름은 50점 이상일 때만). 실패 딜도 창 안이면 같은 기회의 기록이다
  const pick = candidates.find((c) => c.inWindow && (!c.similar || c.score >= 50)) ?? null;
  const runnerUp = pick ? candidates.find((c) => c !== pick && c.inWindow) : undefined;
  const clear = !!pick && !pick.similar && (!runnerUp || pick.score - runnerUp.score >= CLEAR_MARGIN);
  const note =
    !pick && candidates.length > 0
      ? candidates.some((c) => c.inWindow)
        ? '비슷한 이름의 딜만 있어 새 딜로 둡니다 — 같은 고객이면 직접 고르세요.'
        : '같은 회사의 지난 딜만 있어 새 딜로 둡니다(재구매) — 같은 작업건이면 직접 고르세요.'
      : null;
  return {
    companyKey: key,
    customer: customers.find((c) => normalizeCompanyName(c.company) === key) ?? null,
    candidates,
    similarCompanies: [...similarNames].slice(0, 5),
    defaultDealId: pick ? Number(pick.deal.id) : null,
    clear,
    note,
  };
}

export function candidateLabel(c: DealCandidate): string {
  const d = c.deal;
  const amount = parseAmount(d.quotationAmount);
  return [
    `#${d.id}`,
    c.similar ? String(d.company) : null,
    String(d.registrationDate || '').slice(0, 10),
    STAGE_LABELS[d.status] ?? d.status,
    RESULT_LABELS[d.successStatus] ?? d.successStatus,
    d.totalQuantity ? `${d.totalQuantity}대` : null,
    amount ? manwonText(amount) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ─── 변경 계획 ──────────────────────────────────────────────────────────

export interface FieldChange {
  label: string;
  current: string;
  next: string;
  changed: boolean;
  /** fill = 비어 있을 때만 채움 */
  note?: string;
}

export interface DealPlan {
  mode: 'update' | 'create';
  payload: any;
  changes: FieldChange[];
  dealSuccess: boolean;
}

export interface PlanOptions {
  fileName: string;
  /** 담당 고객책임자 — 기존 딜에 담당이 없을 때 채움, 새 딜에는 그대로 */
  manager: string;
  today?: string;
}

function memoLine(ex: QuoteExtraction, opts: PlanOptions): string {
  const amount = ex.quotedTotal ? ` ${wonText(ex.quotedTotal)}` : '';
  return `[견적서 반영 ${ex.quoteDate || opts.today || kstYmd()}${amount} · ${opts.fileName}]`;
}

export function planDeal(ex: QuoteExtraction, deal: any | null, opts: PlanOptions): DealPlan {
  const today = opts.today ?? kstYmd();
  const json = detailedQuantityJson(ex);
  const amount = ex.quotedTotal > 0 ? amountText(ex.quotedTotal) : '';
  const service = serviceLabel(ex);
  const contact = [ex.contactName, ex.contactPosition].filter(Boolean).join(' ');

  if (!deal) {
    const payload = {
      registrationDate: ex.quoteDate || today,
      status: 'quote-sent',
      company: ex.recipientCompany,
      contactName: ex.contactName,
      contactPosition: ex.contactPosition,
      phone: '',
      email: '',
      address: '',
      desiredService: service,
      totalQuantity: ex.totalQuantity,
      quotationAmount: amount || '₩0만',
      salesManager: opts.manager,
      successStatus: 'in-progress',
      isChecked: true,
      requirements: '',
      detailedQuantity: json,
      confirmedWorkDate: '',
      managementMemo: memoLine(ex, opts),
    };
    const add = (label: string, next: string): FieldChange => ({ label, current: '-', next: next || '-', changed: !!next });
    return {
      mode: 'create',
      payload,
      dealSuccess: false,
      changes: [
        add('회사', ex.recipientCompany),
        add('문의일', payload.registrationDate),
        add('단계', '견적서 발송 (진행중)'),
        add('견적 금액', wonText(ex.quotedTotal)),
        add('장비 구성', equipmentSummary(ex)),
        add('총 수량', ex.totalQuantity ? `${ex.totalQuantity}대` : ''),
        add('서비스', service),
        add('담당자', contact),
        add('고객책임자', opts.manager),
      ],
    };
  }

  const payload = { ...deal };
  const changes: FieldChange[] = [];
  const push = (label: string, current: string, next: string, apply: () => void, note?: string, changed = current !== next) => {
    if (changed) apply();
    changes.push({ label, current: current || '-', next: next || '-', changed, note });
  };

  if (ex.quotedTotal > 0) {
    // 금액은 원 단위로 비교한다 (만 원 반올림 표시로 비교하면 1만 원 미만 차이를 놓친다)
    const cur = parseAmount(deal.quotationAmount);
    push('견적 금액', wonText(cur), wonText(ex.quotedTotal), () => (payload.quotationAmount = amount), undefined, cur !== ex.quotedTotal);
  }
  const nextEq = equipmentSummary(ex);
  if (nextEq !== '-') {
    push('장비 구성', equipmentSummary(deal.detailedQuantity), nextEq, () => (payload.detailedQuantity = json), undefined, !sameEquipment(deal.detailedQuantity, ex));
  }
  if (ex.totalQuantity > 0) {
    push('총 수량', deal.totalQuantity ? `${deal.totalQuantity}대` : '', `${ex.totalQuantity}대`, () => (payload.totalQuantity = ex.totalQuantity));
  }
  if (!String(deal.desiredService || '').trim() && service) {
    push('서비스', '', service, () => (payload.desiredService = service), '비어 있어 채움');
  }
  if (!String(deal.contactName || '').trim() && ex.contactName) {
    push('담당자', '', contact, () => {
      payload.contactName = ex.contactName;
      if (!String(deal.contactPosition || '').trim()) payload.contactPosition = ex.contactPosition;
    }, '비어 있어 채움');
  }
  if (deal.status === 'new' || deal.status === 'call') {
    push('단계', STAGE_LABELS[deal.status] ?? deal.status, '견적서 발송', () => (payload.status = 'quote-sent'));
  }
  if (!String(deal.salesManager || '').trim() && opts.manager) {
    push('고객책임자', '', opts.manager, () => (payload.salesManager = opts.manager), '비어 있어 채움');
  }
  const line = memoLine(ex, opts);
  const memo = String(deal.managementMemo || '');
  if (!memo.includes(line)) payload.managementMemo = memo.trim() ? `${memo.trim()}\n${line}` : line;

  return {
    mode: 'update',
    payload,
    changes,
    dealSuccess: payload.successStatus === 'success' || payload.status === 'confirmed',
  };
}

/** 프로젝트 금액 (견적은 VAT 포함 — deals_api.php syncDealToProject 와 같은 계산) */
export function projectAmounts(quoted: number) {
  const taxAmount = Math.round((quoted * 10) / 110);
  return { quotationAmount: quoted, taxAmount, netRevenue: quoted - taxAmount };
}

// ─── 반영 ──────────────────────────────────────────────────────────────

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function getList(url: string, what: string): Promise<any[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${what} 조회 실패 (${res.status})`);
  return (await readJson(res))?.data ?? [];
}

/** 딜 저장 — 서버가 고객·프로젝트 동기화에 실패해도 딜이 저장됐으면(deal_persisted) 성공으로 보고 표시한다 */
async function saveDeal(method: 'POST' | 'PUT', payload: any): Promise<{ id: number; syncFailed: boolean }> {
  const res = await fetch('/api/deals', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await readJson(res);
  if (res.ok) return { id: Number(body?.id ?? payload.id), syncFailed: false };
  if (body?.deal_persisted) return { id: Number(body.id ?? payload.id), syncFailed: true };
  throw new Error(body?.error ? `딜 저장 실패: ${body.error}` : `딜 저장 실패 (${res.status})`);
}

/** 서버가 저장 후 손익 지표(인건비율·순익)를 다시 계산한다 — 실패하면 500 + project_persisted */
async function patchProject(id: number, updates: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...updates }) });
  if (res.ok) return;
  const body = await readJson(res);
  throw new Error(body?.project_persisted ? '프로젝트 금액은 저장됐지만 손익 재계산에 실패했습니다' : `프로젝트 금액 갱신 실패 (${res.status})`);
}

export interface ApplyResult {
  dealId: number;
  created: boolean;
  company: string;
  dealSuccess: boolean;
  syncFailed: boolean;
  projectUpdated: boolean;
  projectError: string | null;
  changes: FieldChange[];
}

export async function applyQuote(ex: QuoteExtraction, dealId: number | null, opts: PlanOptions): Promise<ApplyResult> {
  let plan: DealPlan;
  let saved: { id: number; syncFailed: boolean };
  if (dealId != null) {
    // 행 전체를 덮어쓰므로 최신 값을 다시 받아 합친다
    const fresh = (await getList('/api/deals', '딜')).find((d) => Number(d.id) === dealId);
    if (!fresh) throw new Error('선택한 딜을 찾을 수 없습니다. 다른 사람이 삭제했을 수 있습니다.');
    plan = planDeal(ex, fresh, opts);
    saved = await saveDeal('PUT', plan.payload);
  } else {
    plan = planDeal(ex, null, opts);
    saved = await saveDeal('POST', plan.payload);
  }

  let projectUpdated = false;
  let projectError: string | null = null;
  if (plan.dealSuccess && ex.quotedTotal > 0) {
    try {
      const project = (await getList('/api/projects', '프로젝트')).find((p) => Number(p.dealId) === saved.id);
      if (project && Number(project.quotationAmount) !== ex.quotedTotal) {
        await patchProject(Number(project.id), projectAmounts(ex.quotedTotal));
        projectUpdated = true;
      }
    } catch (err) {
      projectError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    dealId: saved.id,
    created: plan.mode === 'create',
    company: String(plan.payload.company || ex.recipientCompany),
    dealSuccess: plan.dealSuccess,
    syncFailed: saved.syncFailed,
    projectUpdated,
    projectError,
    changes: plan.changes,
  };
}
