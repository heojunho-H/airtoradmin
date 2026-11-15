// 고객 등급·고객 상태 '수동 고정' — /api/customer-grades 클라이언트 + 상태 훅
// (서버: functions/api/customer-grades.ts, D1 customer_grade_locks · customer_status_locks)
// App 이 한 번 들고, 등급·상태 자동 반영(App.tsx)과 고객관리 화면이 함께 쓴다.
// 고정·해제는 서버에 저장된 뒤에 화면에 반영한다 — 고정 목록이 바뀌면 App 이 고객 등급을 다시 계산해 저장하므로,
// 저장도 안 된 고정으로 등급을 바꿨다가 되돌리는 일을 막는다.
// 저장소를 못 쓰면(표 미생성·네트워크) status='unavailable' — 등급은 저장된 값 그대로 보이고 자동 반영·등급 변경만 멈춘다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson, postJson, toAiRequestError } from './ai/api';
import { gradeClass, type GradeClass } from './customerGrade';
import { isCustomerStatus, type CustomerStatus } from './customerStatus';

export const GRADE_LOCKS_ENDPOINT = '/api/customer-grades';

// 운영 주소 (functions/_lib/ai-http.ts DEFAULT_ORIGINS 와 같게)
const PROD_HOSTS = ['airtoradmin.co.kr', 'www.airtoradmin.co.kr', 'airtoradmin.pages.dev'];

/**
 * 계산한 등급을 고객 표에 저장해도 되는 곳인지 — 운영 주소에서만 저장한다.
 * 브랜치 프리뷰·로컬은 고객 데이터는 운영 것을 쓰지만 수동 고정 저장소(D1)는 운영과 다르다. 거기서 저장하면
 * 운영에서 수동 고정한 고객의 등급을 금액 기준으로 덮어쓴다. 그런 곳에서는 화면 표시만 맞춘다.
 * 로컬에서 저장 흐름까지 점검할 때만 localStorage.grade_persist = '1' (쓰기 차단 설정과 함께 쓴다).
 */
export function canPersistGrades(): boolean {
  if (typeof window === 'undefined') return false;
  if (PROD_HOSTS.includes(window.location.hostname)) return true;
  try {
    return window.localStorage.getItem('grade_persist') === '1';
  } catch {
    return false;
  }
}

export interface GradeLock {
  customerId: number;
  grade: GradeClass;
  company: string;
  setBy: string;
  /** ISO 시각 */
  setAt: string;
}

export type GradeLocksStatus = 'loading' | 'ok' | 'unavailable';

/** 고객 상태 수동 고정 — lastWork(고정할 때의 마지막 작업일)가 지금과 다르면 끝난 고정이다 (src/lib/customerStatus.ts) */
export interface StatusLock {
  customerId: number;
  status: CustomerStatus;
  lastWork: string;
  company: string;
  setBy: string;
  /** ISO 시각 */
  setAt: string;
}

/** 등급별 고객책임자 (D1 customer_grade_managers) — 책임자가 비어 있는 S·A·B 고객에게 자동으로 지정할 이름. 없는 등급은 지정하지 않는다 */
export type GradeManagers = Partial<Record<'S' | 'A' | 'B', string>>;

export interface GradeLocksState {
  /** 고객 번호 → 고정 */
  locks: Map<number, GradeLock>;
  gradeManagers: GradeManagers;
  status: GradeLocksStatus;
  /** unavailable 일 때 이유 */
  error: string;
  lock: (customer: { id: number; company: string }, grade: GradeClass) => Promise<boolean>;
  /** silent: 실패해도 알리지 않는다 (고객 삭제 뒤 정리) */
  unlock: (customerId: number, opts?: { silent?: boolean }) => Promise<boolean>;
  /** 고객 번호 → 상태 고정 */
  statusLocks: Map<number, StatusLock>;
  /** 상태 고정 표를 읽었는지 — false 면 상태 자동 변경·상태 고정을 쉰다 (표 미생성) */
  statusReady: boolean;
  lockStatus: (customer: { id: number; company: string }, status: CustomerStatus, lastWork: string) => Promise<boolean>;
  /** silent: 실패해도 알리지 않는다 (끝난 고정 정리·고객 삭제 뒤) */
  unlockStatus: (customerId: number, opts?: { silent?: boolean }) => Promise<boolean>;
}

interface RawLock {
  customerId: number;
  grade: string;
  company: string;
  setBy: string;
  setAt: string;
}

function toLock(r: RawLock): GradeLock {
  return { customerId: Number(r.customerId), grade: gradeClass(r.grade), company: r.company, setBy: r.setBy, setAt: r.setAt };
}

interface RawStatusLock {
  customerId: number;
  status: string;
  lastWork: string;
  company: string;
  setBy: string;
  setAt: string;
}

/** 모르는 상태 값이면 null (버린다) */
function toStatusLock(r: RawStatusLock): StatusLock | null {
  if (!isCustomerStatus(r.status)) return null;
  return { customerId: Number(r.customerId), status: r.status, lastWork: String(r.lastWork ?? ''), company: r.company, setBy: r.setBy, setAt: r.setAt };
}

const STALE_MS = 60_000;

export function useGradeLocks(userName: string, onError: (message: string) => void): GradeLocksState {
  const [locks, setLocks] = useState<Map<number, GradeLock>>(() => new Map());
  const [gradeManagers, setGradeManagers] = useState<GradeManagers>({});
  const [status, setStatus] = useState<GradeLocksStatus>('loading');
  const [error, setError] = useState('');
  const [statusLocks, setStatusLocks] = useState<Map<number, StatusLock>>(() => new Map());
  const [statusReady, setStatusReady] = useState(false);
  const loadedAtRef = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  // 저장을 마친 뒤 그 전에 출발한 목록 응답이 덮어쓰지 않게 — 저장할 때마다 올리고, 응답은 출발 때 값과 같을 때만 쓴다
  const writeSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = writeSeqRef.current;
    try {
      const res = await getJson<{ ok: true; items: RawLock[]; managers?: Record<string, unknown>; statusLocks?: RawStatusLock[] | null }>(
        {},
        GRADE_LOCKS_ENDPOINT,
      );
      if (seq !== writeSeqRef.current) return;
      const items = Array.isArray(res.items) ? res.items : [];
      setLocks(new Map(items.map((r) => [Number(r.customerId), toLock(r)])));
      // 상태 고정 표가 없으면(null·예전 서버) 상태 자동 변경을 쉰다 — 손으로 고정한 고객을 모른 채 덮어쓰지 않게
      const rawStatus = Array.isArray(res.statusLocks) ? res.statusLocks : null;
      const nextStatus = new Map<number, StatusLock>();
      for (const r of rawStatus ?? []) {
        const l = toStatusLock(r);
        if (l) nextStatus.set(l.customerId, l);
      }
      setStatusLocks(nextStatus);
      setStatusReady(rawStatus !== null);
      const next: GradeManagers = {};
      for (const g of ['S', 'A', 'B'] as const) {
        const name = res.managers?.[g];
        if (typeof name === 'string' && name.trim()) next[g] = name.trim();
      }
      // 값이 같으면 같은 객체를 유지한다 (등급 자동 반영 effect 가 쓸데없이 다시 돌지 않게)
      setGradeManagers((prev) => (prev.S === next.S && prev.A === next.A && prev.B === next.B ? prev : next));
      setStatus('ok');
      setError('');
      loadedAtRef.current = Date.now();
    } catch (err) {
      setStatus((s) => (s === 'ok' ? s : 'unavailable'));
      setError(toAiRequestError(err).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAtRef.current > STALE_MS) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const lock = useCallback(
    async (customer: { id: number; company: string }, grade: GradeClass) => {
      try {
        const res = await postJson<{ ok: true; item: RawLock }>(
          { action: 'lock', customerId: customer.id, grade, company: customer.company || '-', userName },
          { endpoint: GRADE_LOCKS_ENDPOINT },
        );
        writeSeqRef.current += 1;
        setLocks((prev) => new Map(prev).set(customer.id, toLock(res.item)));
        return true;
      } catch (err) {
        onErrorRef.current(`[${customer.company}] 등급을 고정하지 못했습니다 — ${toAiRequestError(err).message}`);
        return false;
      }
    },
    [userName],
  );

  const unlock = useCallback(
    async (customerId: number, opts: { silent?: boolean } = {}) => {
      try {
        await postJson<{ ok: true }>({ action: 'unlock', customerId, userName }, { endpoint: GRADE_LOCKS_ENDPOINT });
        writeSeqRef.current += 1;
        setLocks((prev) => {
          if (!prev.has(customerId)) return prev;
          const next = new Map(prev);
          next.delete(customerId);
          return next;
        });
        return true;
      } catch (err) {
        if (!opts.silent) onErrorRef.current(`등급을 자동으로 되돌리지 못했습니다 — ${toAiRequestError(err).message}`);
        return false;
      }
    },
    [userName],
  );

  const lockStatus = useCallback(
    async (customer: { id: number; company: string }, status: CustomerStatus, lastWork: string) => {
      try {
        const res = await postJson<{ ok: true; item: RawStatusLock }>(
          { action: 'lock-status', customerId: customer.id, status, lastWork, company: customer.company || '-', userName },
          { endpoint: GRADE_LOCKS_ENDPOINT },
        );
        const l = toStatusLock(res.item);
        if (!l) throw new Error('알 수 없는 상태 값입니다');
        writeSeqRef.current += 1;
        setStatusLocks((prev) => new Map(prev).set(customer.id, l));
        return true;
      } catch (err) {
        onErrorRef.current(`[${customer.company}] 고객 상태를 고정하지 못했습니다 — ${toAiRequestError(err).message}`);
        return false;
      }
    },
    [userName],
  );

  const unlockStatus = useCallback(
    async (customerId: number, opts: { silent?: boolean } = {}) => {
      try {
        await postJson<{ ok: true }>({ action: 'unlock-status', customerId, userName }, { endpoint: GRADE_LOCKS_ENDPOINT });
        writeSeqRef.current += 1;
        setStatusLocks((prev) => {
          if (!prev.has(customerId)) return prev;
          const next = new Map(prev);
          next.delete(customerId);
          return next;
        });
        return true;
      } catch (err) {
        if (!opts.silent) onErrorRef.current(`고객 상태를 자동으로 되돌리지 못했습니다 — ${toAiRequestError(err).message}`);
        return false;
      }
    },
    [userName],
  );

  return { locks, gradeManagers, status, error, lock, unlock, statusLocks, statusReady, lockStatus, unlockStatus };
}
