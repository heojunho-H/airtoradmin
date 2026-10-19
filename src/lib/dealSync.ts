// 영업(딜) ↔ 고객 작업이력 ↔ 프로젝트 동기화 — 화면 쪽 공용 함수
// 서버 규칙은 api/sync_lib.php, 설명은 docs/data-sync.md.
//  - 저장할 때는 "바뀐 칸만" 보낸다 (오래 열어 둔 화면이 다른 사람이 고친 값을 되돌리지 않게)
//  - 서버가 연결된 딜·고객·프로젝트에 퍼뜨리고, 함께 바뀐 대상을 synced 로 알려 준다 → App 이 목록을 다시 불러온다

/** 서버 v2 API 가 요구하는 버전 표시 — 없으면 409(새로고침 필요) */
export const SYNC_VERSION = 2;

export interface SyncedIds {
  deals: number[];
  customers: number[];
  projects: number[];
}

export interface SyncConflict {
  type: 'not_found' | 'needs_confirmation' | string;
  key: string;
}

export interface SyncResult {
  synced: SyncedIds;
  warnings: string[];
  conflicts: SyncConflict[];
  transition: 'won' | 'lost' | null;
  /** 저장은 됐지만 연결된 곳에 반영하지 못함 — error 에 안내 문구 */
  partial: boolean;
  error: string | null;
}

export class SyncError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
    this.status = status;
  }
}

// ─── 쓰기 순번 ─────────────────────────────────────────────────────────
// App 은 목록을 다시 불러올 때 시작 순번을 기억했다가, 그 사이 쓰기가 있었으면 응답을 버린다
// (쓰기 직전 화면에 반영한 값을 오래된 목록이 되돌리지 않게).
let writeEpoch = 0;
export function bumpWriteEpoch(): number {
  writeEpoch += 1;
  return writeEpoch;
}
export function currentWriteEpoch(): number {
  return writeEpoch;
}

// ─── 판정 · 비교 ───────────────────────────────────────────────────────

/** 수주 판정 — api/sync_lib.php sl_is_won 과 같다. 성공여부가 우선, 진행상태 '수주확정'은 성공여부가 진행중일 때만. */
export function isWonDeal(d: { status?: string; successStatus?: string } | null | undefined): boolean {
  if (!d) return false;
  if (d.successStatus === 'success') return true;
  return d.status === 'confirmed' && d.successStatus === 'in-progress';
}

/** 서버(sl_is_ymd)와 같은 날짜 검사 — YYYY-MM-DD, 2000~2099년, 실제 있는 날짜 */
export function isValidYmd(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > 2099) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** 연결된 작업·프로젝트에 붙이는 표시 — 딜이 수주가 아니면 '수주 취소', 목록에 없으면 '딜 삭제됨' */
export type DealLinkState = 'won' | 'lost' | 'deleted';
export type DealStateMap = Map<number, 'won' | 'lost'>;

export function buildDealStateMap(deals: Array<{ id: number; status?: string; successStatus?: string }>): DealStateMap {
  const map: DealStateMap = new Map();
  for (const d of deals) map.set(Number(d.id), isWonDeal(d) ? 'won' : 'lost');
  return map;
}

export function dealLinkState(dealId: number | null | undefined, states: DealStateMap | null | undefined): DealLinkState | null {
  if (!states || !dealId) return null;
  return states.get(Number(dealId)) ?? 'deleted';
}

export const DEAL_LINK_LABEL: Record<Exclude<DealLinkState, 'won'>, string> = {
  lost: '수주 취소',
  deleted: '딜 삭제됨',
};

/** 딜에서 화면이 고칠 수 있는 칸 (서버 sl_deal_colmap + 문의 등록일) */
export const DEAL_FIELDS = [
  'registrationDate', 'company', 'contactName', 'contactPosition', 'phone', 'email', 'address',
  'desiredService', 'detailedQuantity', 'requirements', 'managementMemo', 'isChecked', 'status',
  'successStatus', 'salesManager', 'quotationAmount', 'confirmedWorkDate', 'totalQuantity',
] as const;

/** 원본 대비 바뀐 칸만 */
export function diffDeal(original: Record<string, unknown>, edited: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of DEAL_FIELDS) {
    const a = original[k];
    const b = edited[k];
    if (k === 'isChecked') {
      if (!!a !== !!b) out[k] = !!b;
    } else if (k === 'totalQuantity') {
      if (Number(a || 0) !== Number(b || 0)) out[k] = Number(b || 0);
    } else if (String(a ?? '') !== String(b ?? '')) {
      out[k] = b ?? '';
    }
  }
  return out;
}

// ─── 고객 작업이력 패치 ────────────────────────────────────────────────

export type WorkHistoryOp =
  | { op: 'update'; key: string; set: Record<string, unknown> }
  | { op: 'add'; entry: Record<string, unknown> }
  | { op: 'remove'; key: string; cascade?: 'fail-deal' };

interface EntryLike {
  dealId?: number | string | null;
  workDate?: string;
  projectName?: string;
  inquiryDate?: string;
}

export function linkedDealId(e: EntryLike | null | undefined): number {
  const n = Number(e?.dealId);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** 작업이력 항목 키 — api/sync_lib.php sl_job_key · functions/_lib/followups.ts jobKeyOf 와 같은 기본 키 */
export function jobKeyBase(e: EntryLike): string {
  const d = linkedDealId(e);
  if (d) return `deal:${d}`;
  return `wd:${e.workDate || ''}|${e.projectName || ''}|${e.inquiryDate || ''}`;
}

/** 목록 순서대로 키를 매긴다 — 연결 없는 항목은 같은 기본 키가 여럿일 수 있어 #0, #1 … (서버 sl_wh_key_index 와 같다) */
export function workHistoryKeys(list: EntryLike[]): string[] {
  const occ = new Map<string, number>();
  return list.map((e) => {
    const base = jobKeyBase(e);
    if (base.startsWith('deal:')) return base;
    const n = occ.get(base) ?? 0;
    occ.set(base, n + 1);
    return `${base}#${n}`;
  });
}

const WH_FIELDS = [
  'inquiryDate', 'projectName', 'totalQuantity', 'detailedQuantity', 'quotationAmount', 'accountManager',
  'workDate', 'subcontractorManager', 'reportSent', 'reminder1', 'reminder2', 'reminder3',
] as const;
const WH_NUMBERS = new Set<string>(['totalQuantity', 'quotationAmount']);
const WH_BOOLEANS = new Set<string>(['reportSent', 'reminder1', 'reminder2', 'reminder3']);

/** 바꾸기 전 목록과 바꾼 목록(같은 순서·같은 길이)을 비교해 update 연산을 만든다. 키는 바꾸기 전 값으로. */
export function buildWorkHistoryPatch(original: Array<Record<string, unknown>>, edited: Array<Record<string, unknown>>): WorkHistoryOp[] {
  const keys = workHistoryKeys(original as EntryLike[]);
  const ops: WorkHistoryOp[] = [];
  original.forEach((o, i) => {
    const e = edited[i];
    if (!e) return;
    const set: Record<string, unknown> = {};
    for (const f of WH_FIELDS) {
      const a = o?.[f];
      const b = e?.[f];
      if (WH_BOOLEANS.has(f)) {
        if (!!a !== !!b) set[f] = !!b;
      } else if (WH_NUMBERS.has(f)) {
        if (Number(a || 0) !== Number(b || 0)) set[f] = Number(b || 0);
      } else if (String(a ?? '') !== String(b ?? '')) {
        set[f] = b ?? '';
      }
    }
    if (Object.keys(set).length > 0) ops.push({ op: 'update', key: keys[i], set });
  });
  return ops;
}

// ─── 고객 담당자 ───────────────────────────────────────────────────────

export interface ContactLike {
  name: string;
  position: string;
  phone: string;
  email: string;
}
export interface ContactPair {
  old: ContactLike;
  new: ContactLike;
}

function cleanContact(c: Partial<ContactLike> | null | undefined): ContactLike {
  return { name: c?.name || '', position: c?.position || '', phone: c?.phone || '', email: c?.email || '' };
}

/** 편집 시작 때 붙인 _k(원래 순번)로 예전→새 값 쌍을 만든다 — 서버가 이 담당자였던 연결 딜을 찾아 고친다 */
export function contactPairs(original: ContactLike[], edited: Array<Partial<ContactLike> & { _k?: number }>): ContactPair[] {
  const pairs: ContactPair[] = [];
  for (const c of edited) {
    if (c._k == null || !original[c._k]) continue;
    const o = cleanContact(original[c._k]);
    const n = cleanContact(c);
    if (o.name !== n.name || o.position !== n.position || o.phone !== n.phone || o.email !== n.email) pairs.push({ old: o, new: n });
  }
  return pairs;
}

export function stripContactKeys(list: Array<Partial<ContactLike> & { _k?: number }>): ContactLike[] {
  return list.map((c) => cleanContact(c));
}

// ─── API ──────────────────────────────────────────────────────────────

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function ids(v: unknown): number[] {
  return Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n)) : [];
}

function toResult(body: any, partial: boolean): SyncResult {
  return {
    synced: { deals: ids(body?.synced?.deals), customers: ids(body?.synced?.customers), projects: ids(body?.synced?.projects) },
    warnings: Array.isArray(body?.warnings) ? body.warnings.map(String) : [],
    conflicts: Array.isArray(body?.conflicts) ? body.conflicts : [],
    transition: body?.transition === 'won' || body?.transition === 'lost' ? body.transition : null,
    partial,
    error: partial ? String(body?.error || '연결된 곳에 반영하지 못했습니다.') : null,
  };
}

const RELOAD_MESSAGE = '새 버전이 배포되었습니다. 화면을 새로고침(⌘R)한 뒤 다시 저장해 주세요.';

function failure(status: number, body: any, what: string): SyncError {
  if (status === 409 || body?.code === 'reload_required') return new SyncError(RELOAD_MESSAGE, 'reload_required', status);
  const msg = typeof body?.error === 'string' && body.error ? body.error : `${what}에 실패했습니다 (${status})`;
  return new SyncError(msg, String(body?.code || 'failed'), status);
}

/** 쓰기 요청 — 200 이면 결과, 500 + persisted 면 "저장은 됨" 결과, 그 밖은 SyncError */
async function send(url: string, method: string, payload: unknown, what: string): Promise<{ body: any; result: SyncResult }> {
  bumpWriteEpoch();
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {
    throw new SyncError(`${what}에 실패했습니다 — 네트워크를 확인해 주세요.`, 'network', 0);
  }
  const body = await readJson(res);
  if (res.ok && body && body.success !== false) return { body, result: toResult(body, false) };
  if (body?.persisted || body?.deal_persisted) return { body, result: toResult(body, true) };
  throw failure(res.status, body, what);
}

/** 딜 부분 저장 — 바뀐 칸만. 응답 deal 은 서버에 저장된 최신값 */
export async function patchDeal<T = any>(id: number, fields: Record<string, unknown>): Promise<SyncResult & { deal: T | null }> {
  const { body, result } = await send('/api/deals', 'PUT', { ...fields, id, _v: SYNC_VERSION }, '딜 저장');
  return { ...result, deal: (body?.deal as T) ?? null };
}

/** 딜 등록 — 처음부터 수주면 서버가 고객·프로젝트 연결을 만든다 */
export async function postDeal<T = any>(deal: Record<string, unknown>): Promise<SyncResult & { id: number; deal: T | null }> {
  const { id: _omit, ...rest } = deal as Record<string, unknown> & { id?: unknown };
  void _omit;
  const { body, result } = await send('/api/deals', 'POST', { ...rest, _v: SYNC_VERSION }, '딜 등록');
  return { ...result, id: Number(body?.id), deal: (body?.deal as T) ?? null };
}

export interface CustomerPatch {
  fields?: Record<string, unknown>;
  workHistoryPatch?: WorkHistoryOp[];
  contactPairs?: ContactPair[];
}

/** 고객 부분 저장 — 바뀐 칸 + 작업이력 연산. 응답 customer 는 서버에 저장된 최신값 */
export async function patchCustomer<T = any>(id: number, patch: CustomerPatch): Promise<SyncResult & { customer: T | null }> {
  const payload: Record<string, unknown> = { ...(patch.fields || {}), id, _v: SYNC_VERSION };
  if (patch.workHistoryPatch && patch.workHistoryPatch.length > 0) payload.workHistoryPatch = patch.workHistoryPatch;
  if (patch.contactPairs && patch.contactPairs.length > 0) payload.contactPairs = patch.contactPairs;
  const { body, result } = await send('/api/customers', 'PUT', payload, '고객 저장');
  return { ...result, customer: (body?.customer as T) ?? null };
}

export function hasSynced(r: Pick<SyncResult, 'synced'> | null | undefined): boolean {
  return !!r && r.synced.deals.length + r.synced.customers.length + r.synced.projects.length > 0;
}

/** 서버 경고 → 알림 문구 */
export function syncWarningText(w: string): string | null {
  switch (w) {
    case 'company_diverged':
      return '고객관리의 회사명은 그대로 두었습니다 — 이 고객에게 다른 작업도 있어 고객관리에서 직접 바꿔 주세요.';
    case 'no_company':
      return '회사명이 없어 고객관리·프로젝트에 등록하지 못했습니다.';
    case 'deal_missing':
      return '연결된 딜이 삭제되어 영업관리에는 반영하지 못했습니다.';
    default:
      return null;
  }
}

/** 고객 작업이력 충돌 → 알림 문구 */
export function syncConflictText(conflicts: SyncConflict[]): string | null {
  if (!conflicts.length) return null;
  if (conflicts.some((c) => c.type === 'not_found')) {
    return '다른 곳에서 먼저 바뀐 작업이 있어 일부는 반영하지 못했습니다. 목록을 새로 불러왔으니 확인 후 다시 고쳐 주세요.';
  }
  return '확인이 필요한 작업이 있어 일부는 반영하지 않았습니다.';
}
