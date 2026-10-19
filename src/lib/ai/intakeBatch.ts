// 견적서 일괄 입력 — 여러 견적서를 대상(딜)별로 묶고, 묶음마다 딜 값을 정할 견적을 고른 뒤 차례대로 반영한다.
//
// 실제 견적서 폴더에서 본 세 가지 경우를 구분한다 (docs/ai-claude.md "견적서 일괄 입력"):
//   차수 견적  견적서 → 2차 → 3차      최신 견적(문서의 견적일 → 차수)이 딜 값, 나머지는 파일만 보관
//                                      파일명 차수는 틀릴 때가 있어(용인 "2차"가 실제 세 번째) 견적일을 먼저 본다
//   대안 견적  견적서(스탠드)/(반분해)   하나를 고른다 (사용자 결정)
//   현장 견적  견적서(김포)/(방화)       합산한다 (사용자 결정)
// 화면은 항목의 결정(회사명·대상 딜·고객책임자·포함 여부)과 묶음 선택만 들고, 나머지는 여기서 계산한다.

import { normalizeCompanyName } from '../company';
import { FLAG_LABELS, linkFile, type QuoteExtraction, type UploadResult } from './files';
import { applyQuote, matchQuote, type ApplyResult, type FieldChange, type MatchResult } from './intake';
import { parseAmount } from './snapshot/common';

/** 한 번에 올릴 수 있는 견적서 수 (서버는 사용자당 10분 30건으로 한 번 더 막는다) */
export const MAX_BATCH = 10;
/** 동시에 판독하는 수 */
export const READ_CONCURRENCY = 3;

export type ItemPhase = 'queued' | 'uploading' | 'reading' | 'ready' | 'rejected' | 'duplicate' | 'error' | 'applying' | 'done';

export interface AppliedInfo {
  dealId: number;
  company: string;
  /** values = 이 파일로 딜 값을 정함 (합산 포함), file = 파일만 보관 */
  role: 'values' | 'file';
  created: boolean;
  dealSuccess: boolean;
  syncFailed: boolean;
  projectUpdated: boolean;
  projectError: string | null;
  changes: FieldChange[];
  linkError: string | null;
  merged: number;
}

export interface BatchItem {
  key: string;
  /** 판독 전·재시도용 원본 (판독이 끝나면 비운다) */
  file: File | null;
  fileName: string;
  size: number;
  phase: ItemPhase;
  /** 오류·제외 사유 */
  message: string | null;
  result: UploadResult | null;
  company: string;
  target: number | 'new';
  manager: string;
  /** 사용자가 회사·대상·책임자를 직접 바꿈 — 데이터를 다시 받아도 기본값으로 되돌리지 않는다 */
  touched: boolean;
  /** null = 자동 (분명한 건이면 체크) */
  checkedOverride: boolean | null;
  applied: AppliedInfo | null;
}

export interface MatchData {
  deals: any[];
  customers: any[];
  managers: any[];
  projects: any[];
}

/** 묶음 선택: 딜 값을 정할 항목 key, 'merge' = 합산, null = 아직 안 정함 */
export type GroupPick = string | 'merge' | null;

export interface GroupView {
  key: string;
  target: number | 'new';
  /** 표시 순서 — 최신(차수 → 견적일 → 파일명) 먼저 */
  itemKeys: string[];
  /** single = 1건, revisions = 차수·날짜가 다름(최신 자동), same = 차수·날짜가 같음(대안 또는 현장 — 사용자 결정) */
  kind: 'single' | 'revisions' | 'same';
  pick: GroupPick;
  defaultPick: GroupPick;
  /** same 묶음에서 라벨이 현장처럼 보여 합산을 권함 */
  suggestMerge: boolean;
  label: string;
  /** 기본 선택 이유 등 안내 */
  note: string | null;
}

export interface ItemView {
  item: BatchItem;
  /** 회사명 수정을 반영한 판독 결과 */
  ex: QuoteExtraction;
  match: MatchResult;
  groupKey: string;
  role: 'values' | 'file';
  /** 확인 필요 사유 — 하나라도 있으면 미리 체크하지 않는다 */
  reviewReasons: string[];
  autoChecked: boolean;
  checked: boolean;
  /** 실행할 수 없는 이유 (묶음 선택 전 등) */
  blocked: string | null;
}

export interface Resolution {
  groups: GroupView[];
  views: Record<string, ItemView>;
}

// ─── 기본 결정 ──────────────────────────────────────────────────────────

export function withCompany(ex: QuoteExtraction, company: string): QuoteExtraction {
  const c = company.trim();
  return c && c !== ex.recipientCompany ? { ...ex, recipientCompany: c } : ex;
}

/** 판독 직후(또는 데이터 갱신 후, 손대지 않은 항목) 회사·대상·책임자 기본값 */
export function defaultDecisions(result: UploadResult, company: string, data: MatchData, userName: string): Pick<BatchItem, 'company' | 'target' | 'manager'> {
  const ex = withCompany(result.extraction, company);
  const m = matchQuote(ex, data.deals, data.customers);
  const file = result.file;
  // 이미 입력했던 파일이면 그 딜
  const linked = file.dealId && m.candidates.some((c) => Number(c.deal.id) === file.dealId) ? file.dealId : null;
  const target: number | 'new' = linked ?? m.defaultDealId ?? 'new';
  const managerNames = data.managers.filter((x) => x.status !== 'leave').map((x) => String(x.name || '').trim());
  const manager = String(m.customer?.accountManager || '').trim() || (target === 'new' && managerNames.includes(userName) ? userName : '');
  return { company, target, manager };
}

// ─── 묶기 ──────────────────────────────────────────────────────────────

const OPTION_WORDS = /(스탠드|벽걸이|천정|반분해|완전분해|분해|기본|일반|표준|정밀|종합|프리미엄|고급|옵션|[A-Za-z]\s*안|\d+\s*안|\d+\s*대|필터|정기|1회|회차|단가|성수기|비수기|수정|구형|전체|최종|추가|변경)/;

/** 라벨이 모두 있고 서로 다르며 옵션 단어가 없으면 현장·지점으로 본다 → 합산 권장 */
export function looksLikeSites(labels: string[]): boolean {
  return labels.length >= 2 && labels.every((l) => !!l && !OPTION_WORDS.test(l)) && new Set(labels).size === labels.length;
}

/** 최신 먼저: 문서의 견적일 → 차수 (파일명 차수만으로는 틀릴 수 있다) */
function newer(a: QuoteExtraction, b: QuoteExtraction): number {
  if (a.quoteDate && b.quoteDate && a.quoteDate !== b.quoteDate) return b.quoteDate.localeCompare(a.quoteDate);
  if ((a.revision || 1) !== (b.revision || 1)) return (b.revision || 1) - (a.revision || 1);
  return 0;
}

function groupKeyOf(item: BatchItem): string {
  return item.target === 'new' ? `new:${normalizeCompanyName(item.company)}` : `deal:${item.target}`;
}

const CONFIDENCE_TEXT: Record<string, string> = { medium: '판독 신뢰도 보통', low: '판독 신뢰도 낮음' };

export function resolveBatch(items: BatchItem[], picks: Record<string, GroupPick>, data: MatchData): Resolution {
  const ready = items.filter((i) => i.phase === 'ready' && i.result);
  const views: Record<string, ItemView> = {};
  const byGroup = new Map<string, BatchItem[]>();
  for (const item of ready) {
    const key = groupKeyOf(item);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(item);
  }

  const groups: GroupView[] = [];
  for (const [key, members] of byGroup) {
    const exOf = (i: BatchItem) => withCompany(i.result!.extraction, i.company);
    const sorted = [...members].sort((a, b) => newer(exOf(a), exOf(b)) || b.fileName.localeCompare(a.fileName));
    const target0 = sorted[0].target;
    const dealObj = target0 === 'new' ? null : (data.deals.find((d) => Number(d.id) === target0) ?? null);
    // 딜에 이미 이 견적의 금액이 들어 있음 — 합의된 견적일 가능성이 높다
    const holds = (i: BatchItem) => !!dealObj && exOf(i).quotedTotal > 0 && parseAmount(dealObj.quotationAmount) === exOf(i).quotedTotal;
    let kind: GroupView['kind'] = 'single';
    let defaultPick: GroupPick = sorted[0].key;
    let suggestMerge = false;
    let note: string | null = null;
    if (sorted.length > 1) {
      const top = exOf(sorted[0]);
      const tier = sorted.filter((i) => newer(exOf(i), top) === 0);
      if (tier.length === 1) {
        kind = 'revisions';
        // 진행 중 딜은 최신 견적이 기준. 수주·실패로 끝난 딜은 이미 들어 있는 견적을 기준으로 둔다 (예: 수주 후 낸 3차)
        const settled = !!dealObj && dealObj.successStatus !== 'in-progress';
        const keep = settled ? sorted.find(holds) : undefined;
        if (keep && keep !== sorted[0]) {
          defaultPick = keep.key;
          note = `딜에 이미 ${keep.fileName}의 금액이 들어 있어 그 견적을 기준으로 둡니다 — 최신 견적으로 바꾸려면 직접 고르세요.`;
        } else {
          note = '가장 최근 견적(견적일 → 차수)으로 딜을 갱신하고, 나머지는 파일만 보관합니다.';
        }
      } else {
        kind = 'same';
        suggestMerge = looksLikeSites(tier.map((i) => exOf(i).variantLabel));
        const matching = tier.filter(holds);
        if (matching.length === 1) {
          defaultPick = matching[0].key;
          note = `딜에 이미 ${matching[0].fileName}의 금액이 들어 있어 그 견적을 기준으로 둡니다.`;
        } else {
          defaultPick = null;
          note = suggestMerge
            ? '같은 날짜의 현장별 견적으로 보입니다 — 합산하거나 하나를 고르세요.'
            : '같은 날짜의 대안 견적으로 보입니다 — 딜에 넣을 견적을 고르세요.';
        }
      }
    }
    const chosen = picks[key];
    const pick: GroupPick = chosen === 'merge' || (typeof chosen === 'string' && sorted.some((i) => i.key === chosen)) ? chosen : chosen === null ? null : defaultPick;
    const target = sorted[0].target;
    const first = sorted[0];
    const m = matchQuote(exOf(first), data.deals, data.customers);
    const deal = target === 'new' ? null : m.candidates.find((c) => Number(c.deal.id) === target)?.deal;
    const label = target === 'new' ? `새 딜 · ${first.company || exOf(first).recipientCompany}` : `딜 #${target}${deal ? ` · ${deal.company}` : ''}`;
    groups.push({ key, target, itemKeys: sorted.map((i) => i.key), kind, pick, defaultPick, suggestMerge, label, note });
  }
  // 회사명 순, 같은 회사 안에서는 대상 순
  groups.sort((a, b) => a.label.localeCompare(b.label, 'ko'));

  for (const g of groups) {
    const members = g.itemKeys.map((k) => ready.find((i) => i.key === k)!);
    // 합산이면 딜과 비교할 값은 합계다
    const mergedEx = g.pick === 'merge' ? mergeExtractions(members.map((i) => withCompany(i.result!.extraction, i.company))) : null;
    // 1단계: 각 항목의 역할·확인 사유
    for (const item of members) {
      const ex = withCompany(item.result!.extraction, item.company);
      const match = matchQuote(ex, data.deals, data.customers);
      const role: ItemView['role'] = g.pick === 'merge' || g.pick === item.key ? 'values' : 'file';
      const reasons: string[] = [];
      const linked = item.result!.file.status === 'linked';
      if (linked) reasons.push('이미 입력된 견적서');
      if (role === 'values') {
        if (ex.confidence !== 'high') reasons.push(CONFIDENCE_TEXT[ex.confidence] ?? '판독 신뢰도 확인');
        for (const f of ex.flags ?? []) reasons.push(FLAG_LABELS[f] ?? f);
        if (g.target === 'new') {
          reasons.push('새 딜 등록');
          // 같은 고객의 다른 견적이 기존 딜로 들어가면 같은 작업건일 수 있다 (예: 견적서(스탠드) 추가 견적)
          const myKey = normalizeCompanyName(item.company);
          const sibling = groups.find((o) => {
            if (o.target === 'new' || o.key === g.key) return false;
            const d = data.deals.find((x) => Number(x.id) === o.target);
            const k = normalizeCompanyName(d?.company);
            return !!k && !!myKey && (k.includes(myKey) || myKey.includes(k));
          });
          if (sibling) reasons.push(`같은 고객 견적서가 딜 #${sibling.target}에 들어감`);
        } else {
          const cand = match.candidates.find((c) => Number(c.deal.id) === g.target);
          if (!cand) reasons.push('직접 고른 딜');
          else {
            if (cand.similar) reasons.push('비슷한 회사명');
            if (!cand.inWindow) reasons.push('문의일이 먼 딜');
            if (Number(cand.deal.id) !== match.defaultDealId || !match.clear) reasons.push('후보 딜 여러 개');
          }
          const deal = cand?.deal ?? data.deals.find((d) => Number(d.id) === g.target);
          const cmp = mergedEx ?? ex;
          if (deal) {
            const dAmt = parseAmount(deal.quotationAmount);
            const dQty = Number(deal.totalQuantity) || 0;
            // 수주 딜의 금액·수량은 합의된 값 — 견적서가 달라도 사람이 확인하고 바꾼다 (예: 수주 후 낸 3차 견적)
            if (deal.successStatus === 'success' || deal.status === 'confirmed') {
              if ((cmp.quotedTotal > 0 && dAmt !== cmp.quotedTotal) || (cmp.totalQuantity > 0 && dQty !== cmp.totalQuantity)) reasons.push('수주 딜 금액·수량 변경');
            }
            // 기존 값과 30% 넘게 다르면 부분·대안 견적일 수 있다 (예: 109대 딜에 8대 기본세척 견적)
            const far = (a: number, b: number) => a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) > 0.3;
            if (far(dAmt, cmp.quotedTotal) || far(dQty, cmp.totalQuantity)) reasons.push('기존 딜과 금액·수량 차이 큼');
          }
        }
        // 합산은 새 값을 만든다 — 항상 사람이 확인. 하나를 고른 경우는 위 사유(수주 딜 변경·차이 큼)가 걸러 준다
        if (g.pick === 'merge') reasons.push('합산 입력');
      }
      const blocked = g.pick === null ? '딜에 넣을 견적서를 고르세요 (하나만 선택 또는 합산)' : null;
      views[item.key] = { item, ex, match, groupKey: g.key, role, reviewReasons: [...new Set(reasons)], autoChecked: false, checked: false, blocked };
    }
    // 2단계: 미리 체크 — 값을 정하는 항목이 분명하면 묶음의 파일 보관도 함께 체크
    const valueViews = members.map((i) => views[i.key]).filter((v) => v.role === 'values');
    const valuesClear = valueViews.length > 0 && valueViews.every((v) => v.reviewReasons.length === 0);
    for (const item of members) {
      const v = views[item.key];
      const linked = item.result!.file.status === 'linked';
      v.autoChecked = !v.blocked && valuesClear && !linked;
      v.checked = v.blocked ? false : (item.checkedOverride ?? v.autoChecked);
    }
  }
  return { groups, views };
}

// ─── 합산 ──────────────────────────────────────────────────────────────

const LEVEL: Record<string, number> = { low: 0, medium: 1, high: 2 };
const unique = <T,>(xs: T[]) => [...new Set(xs)];

/** 현장별 견적 합산 — 금액·대수·수량을 더하고 견적일은 가장 늦은 날, 경고·플래그는 모두 */
export function mergeExtractions(list: QuoteExtraction[]): QuoteExtraction {
  const [first] = list;
  if (list.length === 1) return first;
  const sum = (f: (e: QuoteExtraction) => number) => list.reduce((a, e) => a + (Number(f(e)) || 0), 0);
  const equipment: Record<string, number> = {};
  for (const e of list) for (const [k, v] of Object.entries(e.equipment)) equipment[k] = (equipment[k] ?? 0) + (Number(v) || 0);
  const others = new Map<string, number>();
  for (const e of list) for (const o of e.otherItems) others.set(o.name, (others.get(o.name) ?? 0) + o.quantity);
  const dates = list.map((e) => e.quoteDate).filter(Boolean).sort();
  const confidence = list.reduce((min, e) => (LEVEL[e.confidence] < LEVEL[min] ? e.confidence : min), 'high' as QuoteExtraction['confidence']);
  return {
    ...first,
    quoteDate: dates[dates.length - 1] ?? first.quoteDate,
    revision: Math.max(...list.map((e) => e.revision || 1)),
    variantLabel: list.map((e) => e.variantLabel).filter(Boolean).join('+'),
    quoteCount: 1,
    equipment,
    otherItems: [...others].map(([name, quantity]) => ({ name, quantity })),
    totalQuantity: sum((e) => e.totalQuantity),
    lineItems: list.flatMap((e) => e.lineItems.map((l) => ({ ...l, name: e.variantLabel ? `${e.variantLabel} ${l.name}` : l.name }))),
    supplyTotal: sum((e) => e.supplyTotal),
    taxTotal: sum((e) => e.taxTotal),
    quotedTotal: sum((e) => e.quotedTotal),
    vatIncluded: list.every((e) => e.vatIncluded),
    notes: unique(list.flatMap((e) => e.notes)).slice(0, 5),
    warnings: unique(list.flatMap((e) => e.warnings)),
    flags: unique(list.flatMap((e) => e.flags ?? [])),
    confidence,
  };
}

// ─── 실행 ──────────────────────────────────────────────────────────────

export interface RunGroup {
  group: GroupView;
  /** 딜 값을 정하는 항목 (합산이면 여럿, 파일만 보관 묶음이면 0) */
  values: ItemView[];
  /** 연결할 모든 파일 (values 포함) */
  files: ItemView[];
}

/** 체크된 항목으로 실행 계획 — groupKeys 를 주면 그 묶음만 */
export function planRun(res: Resolution, groupKeys?: string[]): RunGroup[] {
  const out: RunGroup[] = [];
  for (const g of res.groups) {
    if (groupKeys && !groupKeys.includes(g.key)) continue;
    const vs = g.itemKeys.map((k) => res.views[k]).filter((v) => v && v.checked && !v.blocked);
    if (!vs.length) continue;
    const values = vs.filter((v) => v.role === 'values');
    // 새 딜은 값을 정할 견적이 있어야 만든다. 기존 딜이면 파일만 연결할 수 있다
    if (!values.length && g.target === 'new') continue;
    out.push({ group: g, values, files: vs });
  }
  return out;
}

export interface GroupOutcome {
  dealId: number;
  company: string;
  created: boolean;
  dealSuccess: boolean;
  applied: ApplyResult | null;
  /** 항목 key → 연결 오류 (없으면 null) */
  linkErrors: Record<string, string | null>;
}

/** 묶음 하나를 반영한다 — 딜 PUT 이 행 전체를 덮어쓰므로 호출하는 쪽에서 묶음을 하나씩 차례로 부른다 */
export async function runGroup(rg: RunGroup, opts: { userName: string; customers: any[] }): Promise<GroupOutcome> {
  let applied: ApplyResult | null = null;
  let dealId: number;
  let company: string;
  if (rg.values.length) {
    const ex = mergeExtractions(rg.values.map((v) => v.ex));
    const fileLabel = rg.values.length === 1 ? rg.values[0].item.fileName : `${rg.values.map((v) => v.item.fileName).join(' + ')} 합산`;
    applied = await applyQuote(ex, rg.group.target === 'new' ? null : rg.group.target, { fileName: fileLabel, manager: rg.values[0].item.manager });
    dealId = applied.dealId;
    company = applied.company;
  } else {
    dealId = rg.group.target as number;
    const cand = rg.files[0].match.candidates.find((c) => Number(c.deal.id) === dealId);
    company = String(cand?.deal.company || rg.files[0].item.company);
  }
  const key = normalizeCompanyName(company);
  const customer = opts.customers.find((c) => normalizeCompanyName(c.company) === key);
  const linkErrors: Record<string, string | null> = {};
  for (const v of rg.files) {
    try {
      await linkFile({
        id: v.item.result!.file.id,
        company,
        customerId: customer ? Number(customer.id) : null,
        dealId,
        applied: {
          role: v.role,
          mode: applied ? (applied.created ? 'create' : 'update') : 'file',
          dealId,
          merged: rg.values.length > 1 ? rg.values.map((x) => x.item.fileName) : undefined,
          quotedTotal: v.ex.quotedTotal,
          changes: v.role === 'values' && applied ? applied.changes.filter((c) => c.changed) : [],
        },
        userName: opts.userName,
      });
      linkErrors[v.item.key] = null;
    } catch (err) {
      linkErrors[v.item.key] = err instanceof Error ? err.message : String(err);
    }
  }
  return { dealId, company, created: !!applied?.created, dealSuccess: !!applied?.dealSuccess, applied, linkErrors };
}
