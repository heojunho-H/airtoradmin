// Cloudflare Pages Function — /api/customer-grades (고객 등급·고객 상태 '수동 고정')
// 등급은 화면이 누적 거래 금액으로 자동 분류한다(src/lib/customerGrade.ts). 담당자가 손으로 바꾼 고객만
// D1 customer_grade_locks 에 둔다(d1/migrations/0005_customer_grade_locks.sql). 팀 전체가 같은 고정을 본다.
//
// GET                                                              → { ok, items:[{customerId, grade, company, setBy, setAt}], managers:{S?,A?,B?},
//                                                                       statusLocks:[{customerId, status, lastWork, company, setBy, setAt}] | null }
//   managers = 등급별 고객책임자(D1 customer_grade_managers, 0006). 책임자가 비어 있는 S·A·B 고객에게 화면이 자동으로 지정한다.
//   직원 이름은 코드에 두지 않고 이 표에만 둔다. 표가 없거나 비어 있으면 {} — 그때는 화면이 자동 지정을 하지 않는다.
//   statusLocks = 고객 상태 '수동 고정'(D1 customer_status_locks, 0007). 표가 없으면 null — 그때는 화면이 상태 자동 변경을 하지 않는다.
// POST { action:'lock', customerId, grade, company, userName }     → { ok, item } — 이미 있으면 새 등급으로 바꾼다
// POST { action:'unlock', customerId, userName }                   → { ok }
// POST { action:'lock-status', customerId, status, lastWork, company, userName } → { ok, item } — 이미 있으면 새 상태로 바꾼다
// POST { action:'unlock-status', customerId, userName }            → { ok }
//   상태 규칙은 src/lib/customerStatus.ts (365일 넘으면 이탈위험, 450일 넘으면 이탈). lastWork = 고정할 때의 마지막 작업일 —
//   새 작업이 들어와 마지막 작업일이 바뀌면 화면이 고정을 끝난 것으로 보고 지운다.

import { requireDb } from '../_lib/ai-auth';
import { AiError, checkOrigin, cleanUserName, errorResponse, jsonFor, nowIso, optionsResponse, readJsonCapped, type AiEnv } from '../_lib/ai-http';

const GRADES = ['S', 'A', 'B', '그 외'];
// src/lib/customerStatus.ts CUSTOMER_STATUS_OPTIONS 와 같게
const STATUSES = [
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
const MAX_ITEMS = 5000;

interface LockRow {
  customer_id: number;
  grade: string;
  company: string;
  set_by: string;
  set_at: string;
}

interface StatusLockRow {
  customer_id: number;
  status: string;
  last_work: string;
  company: string;
  set_by: string;
  set_at: string;
}

function toItem(r: LockRow) {
  return { customerId: r.customer_id, grade: r.grade, company: r.company, setBy: r.set_by, setAt: r.set_at };
}

function toStatusItem(r: StatusLockRow) {
  return { customerId: r.customer_id, status: r.status, lastWork: r.last_work, company: r.company, setBy: r.set_by, setAt: r.set_at };
}

function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  console.error('[customer-grades] unexpected', String(err).slice(0, 300));
  return new AiError(500, 'internal', '처리 중 오류가 발생했습니다.', { retryable: true });
}

/** AI 저장소(D1) 연결 + customer_grade_locks 표 확인 */
async function lockDb(env: AiEnv): Promise<D1Database> {
  const db = await requireDb(env);
  try {
    await db.prepare('SELECT 1 FROM customer_grade_locks LIMIT 1').all();
  } catch {
    throw new AiError(503, 'db_not_initialized', '등급 고정 저장소 표가 아직 없습니다(관리자 확인 필요).');
  }
  return db;
}

/** 고객 상태 수동 고정 — 표가 아직 없으면 null (상태 자동 변경만 멈추고 등급 기능은 그대로 쓴다) */
async function statusLocks(db: D1Database): Promise<ReturnType<typeof toStatusItem>[] | null> {
  try {
    const { results } = await db
      .prepare('SELECT * FROM customer_status_locks ORDER BY set_at DESC LIMIT ?')
      .bind(MAX_ITEMS)
      .all<StatusLockRow>();
    return (results ?? []).map(toStatusItem);
  } catch {
    return null;
  }
}

async function requireStatusTable(db: D1Database): Promise<void> {
  try {
    await db.prepare('SELECT 1 FROM customer_status_locks LIMIT 1').all();
  } catch {
    throw new AiError(503, 'db_not_initialized', '상태 고정 저장소 표가 아직 없습니다(관리자 확인 필요).');
  }
}

/** 등급별 고객책임자 — 표가 아직 없으면 빈 값 (자동 지정만 멈추고 등급 기능은 그대로 쓴다) */
async function gradeManagers(db: D1Database): Promise<Record<string, string>> {
  try {
    const { results } = await db.prepare('SELECT grade, manager FROM customer_grade_managers').all<{ grade: string; manager: string }>();
    const out: Record<string, string> = {};
    for (const r of results ?? []) {
      const name = typeof r.manager === 'string' ? r.manager.trim() : '';
      if ((r.grade === 'S' || r.grade === 'A' || r.grade === 'B') && name) out[r.grade] = name;
    }
    return out;
  } catch {
    return {};
  }
}

function requireCustomerId(v: unknown): number {
  const id = Number(v);
  // 화면이 등록 직후에 쓰는 임시 번호(Date.now())는 받지 않는다
  if (!Number.isInteger(id) || id <= 0 || id > 1_000_000_000) throw new AiError(400, 'bad_request', '고객 번호가 올바르지 않습니다.');
  return id;
}

export const onRequestGet: PagesFunction<AiEnv> = async ({ request, env }) => {
  try {
    const originError = checkOrigin(request, env);
    if (originError) throw originError;
    const db = await lockDb(env);
    const { results } = await db.prepare('SELECT * FROM customer_grade_locks ORDER BY set_at DESC LIMIT ?').bind(MAX_ITEMS).all<LockRow>();
    return jsonFor(request, env, {
      ok: true,
      items: (results ?? []).map(toItem),
      managers: await gradeManagers(db),
      statusLocks: await statusLocks(db),
    });
  } catch (err) {
    return errorResponse(request, env, toAiError(err));
  }
};

export const onRequestPost: PagesFunction<AiEnv> = async ({ request, env }) => {
  try {
    const originError = checkOrigin(request, env);
    if (originError) throw originError;
    const body = await readJsonCapped<Record<string, unknown>>(request, 2_000);
    const db = await lockDb(env);
    const customerId = requireCustomerId(body.customerId);

    if (body.action === 'lock') {
      const grade = typeof body.grade === 'string' ? body.grade : '';
      if (!GRADES.includes(grade)) throw new AiError(400, 'bad_request', '등급이 올바르지 않습니다.');
      const company = typeof body.company === 'string' ? body.company.trim().slice(0, 100) : '';
      if (!company) throw new AiError(400, 'bad_request', '회사명이 필요합니다.');
      // 나중에 바꾼 사람의 등급이 남는다
      await db
        .prepare(
          `INSERT INTO customer_grade_locks (customer_id, grade, company, set_by, set_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(customer_id) DO UPDATE SET grade = excluded.grade, company = excluded.company, set_by = excluded.set_by, set_at = excluded.set_at`,
        )
        .bind(customerId, grade, company, cleanUserName(body.userName), nowIso())
        .run();
      const row = await db.prepare('SELECT * FROM customer_grade_locks WHERE customer_id = ?').bind(customerId).first<LockRow>();
      if (!row) throw new AiError(500, 'persist_failed', '등급 고정을 저장하지 못했습니다.', { retryable: true });
      return jsonFor(request, env, { ok: true, item: toItem(row) });
    }
    if (body.action === 'unlock') {
      await db.prepare('DELETE FROM customer_grade_locks WHERE customer_id = ?').bind(customerId).run();
      return jsonFor(request, env, { ok: true });
    }
    if (body.action === 'lock-status') {
      await requireStatusTable(db);
      const status = typeof body.status === 'string' ? body.status : '';
      if (!STATUSES.includes(status)) throw new AiError(400, 'bad_request', '고객 상태가 올바르지 않습니다.');
      const lastWork = typeof body.lastWork === 'string' ? body.lastWork : '';
      if (lastWork !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(lastWork)) throw new AiError(400, 'bad_request', '마지막 작업일이 올바르지 않습니다.');
      const company = typeof body.company === 'string' ? body.company.trim().slice(0, 100) : '';
      if (!company) throw new AiError(400, 'bad_request', '회사명이 필요합니다.');
      await db
        .prepare(
          `INSERT INTO customer_status_locks (customer_id, status, last_work, company, set_by, set_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(customer_id) DO UPDATE SET status = excluded.status, last_work = excluded.last_work, company = excluded.company,
             set_by = excluded.set_by, set_at = excluded.set_at`,
        )
        .bind(customerId, status, lastWork, company, cleanUserName(body.userName), nowIso())
        .run();
      const row = await db.prepare('SELECT * FROM customer_status_locks WHERE customer_id = ?').bind(customerId).first<StatusLockRow>();
      if (!row) throw new AiError(500, 'persist_failed', '상태 고정을 저장하지 못했습니다.', { retryable: true });
      return jsonFor(request, env, { ok: true, item: toStatusItem(row) });
    }
    if (body.action === 'unlock-status') {
      await requireStatusTable(db);
      await db.prepare('DELETE FROM customer_status_locks WHERE customer_id = ?').bind(customerId).run();
      return jsonFor(request, env, { ok: true });
    }
    throw new AiError(400, 'bad_request', '알 수 없는 요청입니다.');
  } catch (err) {
    return errorResponse(request, env, toAiError(err));
  }
};

export const onRequestOptions: PagesFunction<AiEnv> = async ({ request, env }) => optionsResponse(request, env, 'GET, POST, OPTIONS');
