// 고객 상태 자동 변경 — 마지막 작업일로부터 지난 날수로 '이탈위험'·'이탈'을 붙인다.
// 2026-11-15 사용자 요청: 신규·재구매(+ 사용자 결정으로 충성고객)마다 '이탈위험'·'이탈' 상태를 두고 자동으로 바꾼다.
//
// 기준을 정한 근거 (운영 데이터 11-15, 작업 249건 · 2024-02 ~ 2026-11, 수주 취소·딜 삭제 연결 작업 제외):
//   - 같은 고객의 작업 간격은 0~152일(같은 시즌 추가 작업·여러 곳 작업)과 228일 이상(다음 시즌)으로 갈린다.
//     180일 안의 작업을 한 번으로 묶어 '다시 돌아온' 19건을 보면 모두 마지막 작업 후 228~442일(가운데 358일)이다.
//   - 365일 안에 돌아온 것 10건, 366~442일 9건, 그 뒤 0건. 1년이 넘도록 다음 작업이 없던 71건 중 9건(13%)만 돌아왔고,
//     450일을 넘긴 53건 중 돌아온 것은 0건이다(1년을 건너뛰고 돌아온 고객 없음).
//   - 그래서 365일(관리일이 지남, 돌아올 고객의 절반이 이미 돌아온 때)이 넘으면 이탈위험, 450일이 넘으면 이탈.
//     365~450일은 돌아온 고객의 절반이 돌아온 구간이라 연락으로 되찾을 수 있는 때다.
//   - 재구매·충성고객이 한 번 더 돌아온 기록은 2건뿐이라 세 단계 모두 같은 기준을 쓴다. 2027년 시즌 자료가 쌓이면 다시 본다.
//
// 기본 상태(신규·재구매·충성고객)는 지금 규칙 그대로 작업 횟수로 정한다 — 화면 deriveCustomerStatus(CustomersPage.tsx)와
// PHP sl_wh_aggregate(api/sync_lib.php)가 같은 규칙으로 저장한다(1회 이하는 저장된 값 유지).
// 손으로 고른 상태는 '수동 고정'(D1 customer_status_locks, src/lib/gradeLocks.ts) — 새 작업이 들어오면 풀린다.
// 저장은 App.tsx 의 등급·책임자 자동 반영 effect 가 함께 한다(바뀐 고객만, 운영 주소에서만).

import { daysBetween } from './ai/format';
import { ymd } from './ai/snapshot/common';
import { dealLinkState, type DealStateMap } from './dealSync';

export type BaseStatus = '신규' | '재구매' | '충성고객';
export type CustomerStatus =
  | BaseStatus
  | '신규 이탈위험'
  | '신규 이탈'
  | '재구매 이탈위험'
  | '재구매 이탈'
  | '충성고객 이탈위험'
  | '충성고객 이탈'
  | '고객이탈';

/** 마지막 작업 후 이 날수가 넘으면 '이탈위험' */
export const STATUS_RISK_DAYS = 365;
/** 마지막 작업 후 이 날수가 넘으면 '이탈' */
export const STATUS_CHURN_DAYS = 450;

/** 선택 상자 순서 — 단계마다 기본 → 이탈위험 → 이탈, 마지막에 담당자가 정하는 '고객이탈' */
export const CUSTOMER_STATUS_OPTIONS: readonly CustomerStatus[] = [
  '충성고객',
  '충성고객 이탈위험',
  '충성고객 이탈',
  '재구매',
  '재구매 이탈위험',
  '재구매 이탈',
  '신규',
  '신규 이탈위험',
  '신규 이탈',
  '고객이탈',
];

export const STATUS_RULE_TEXT =
  `마지막 작업 후 ${STATUS_RISK_DAYS}일이 넘으면 이탈위험, ${STATUS_CHURN_DAYS}일이 넘으면 이탈로 자동 변경 ` +
  '(신규·재구매·충성고객 각각). 새 작업이 들어오면 작업 횟수대로 돌아갑니다. 고객이탈은 담당자가 직접 정하는 상태입니다';

export function isCustomerStatus(v: unknown): v is CustomerStatus {
  return typeof v === 'string' && (CUSTOMER_STATUS_OPTIONS as readonly string[]).includes(v);
}

/** 이탈위험·이탈이면 경고 색을 쓴다 */
export function statusStage(v: unknown): 'base' | 'risk' | 'churn' {
  const s = String(v ?? '');
  if (s.endsWith(' 이탈위험')) return 'risk';
  if (s.endsWith(' 이탈') || s === '고객이탈') return 'churn';
  return 'base';
}

/** 기본 상태 — 작업 3회 이상 충성고객 · 2회 재구매 · 1회 이하는 저장된 값에서 ' 이탈…'을 뗀 값(없으면 신규) */
export function baseStatusOf(current: unknown, workCount: number): BaseStatus {
  if (workCount >= 3) return '충성고객';
  if (workCount === 2) return '재구매';
  const s = String(current ?? '');
  if (s.startsWith('충성고객')) return '충성고객';
  if (s.startsWith('재구매')) return '재구매';
  return '신규';
}

type WorkLike = { workDate?: unknown; dealId?: unknown } | null | undefined;
type CustomerLike = { workHistory?: unknown; lastWorkDate?: unknown; customerStatus?: unknown } | null | undefined;

function workList(c: CustomerLike): WorkLike[] {
  return Array.isArray(c?.workHistory) ? (c.workHistory as WorkLike[]) : [];
}

/** 수주 취소·딜 삭제에 연결된 작업이 아닌지 (딜 목록이 없으면 모두 유효) — 홈 지표 isLiveLink 와 같다 */
function isLiveWork(w: WorkLike, states: DealStateMap | null): boolean {
  const raw = w?.dealId;
  const id = raw != null && raw !== '' ? Number(raw) : null;
  const st = dealLinkState(id, states);
  return st === null || st === 'won';
}

/**
 * 상태를 세는 기준일 — 수주 취소·딜 삭제에 연결되지 않은 작업 중 가장 늦은 작업일.
 * 유효한 작업은 있는데 작업일이 모두 비어 있으면 저장된 최근 작업일. 그래도 없으면 '' (자동 대상 아님).
 */
export function lastLiveWorkDate(c: CustomerLike, states: DealStateMap | null): string {
  const live = workList(c).filter((w) => isLiveWork(w, states));
  if (!live.length) return '';
  let last = '';
  for (const w of live) {
    const d = ymd(w?.workDate);
    if (d && d > last) last = d;
  }
  if (last) return last;
  const anyDated = workList(c).some((w) => ymd(w?.workDate));
  return anyDated ? '' : ymd(c?.lastWorkDate);
}

/** 기본 상태 + 지난 날수 → 자동 상태 */
export function statusForDays(base: BaseStatus, days: number): CustomerStatus {
  if (days > STATUS_CHURN_DAYS) return `${base} 이탈` as CustomerStatus;
  if (days > STATUS_RISK_DAYS) return `${base} 이탈위험` as CustomerStatus;
  return base;
}

export interface StatusLockLike {
  status: string;
  /** 고정할 때의 마지막 작업일 — 지금 마지막 작업일과 다르면(새 작업이 들어왔으면) 고정은 끝났다 */
  lastWork: string;
}

export interface ResolvedStatus {
  /** 있어야 할 상태. null = 자동 대상이 아니라 그대로 둔다(작업일 없음) */
  want: CustomerStatus | null;
  /** 자동으로 계산한 상태(고정과 상관없이). 자동 대상이 아니면 null */
  auto: CustomerStatus | null;
  /** 기준일 (없으면 '') */
  lastWork: string;
  /** 기준일부터 오늘까지 날수 (기준일이 없으면 null) */
  days: number | null;
  /** 유효한 수동 고정을 따른 값인지 */
  locked: boolean;
  /** 고정이 있지만 새 작업이 들어와 끝난 것 — 지워도 된다 */
  staleLock: boolean;
}

/** 고객 한 곳의 상태 — 유효한 수동 고정이 있으면 그 값, 없으면 자동 */
export function resolveCustomerStatus(
  c: CustomerLike,
  lock: StatusLockLike | null | undefined,
  states: DealStateMap | null,
  today: string,
): ResolvedStatus {
  const lastWork = lastLiveWorkDate(c, states);
  const d = lastWork ? daysBetween(lastWork, today) : NaN;
  const days = Number.isFinite(d) ? d : null;
  const auto = days == null ? null : statusForDays(baseStatusOf(c?.customerStatus, workList(c).length), days);
  if (lock && lock.lastWork === lastWork && isCustomerStatus(lock.status)) {
    return { want: lock.status, auto, lastWork, days, locked: true, staleLock: false };
  }
  return { want: auto, auto, lastWork, days, locked: false, staleLock: !!lock };
}
