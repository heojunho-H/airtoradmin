// Cloudflare Pages Function — /api/todos (홈 '오늘의 할 일' 완료 기록)
// 진행중 목록은 화면이 고객 데이터에서 계산한다(src/lib/home/metrics.ts). 여기는 완료한 것만 D1 home_todos 에 둔다
// (d1/migrations/0003_home_todos.sql). 팀 전체가 같은 기록을 본다.
//
// GET                                                        → { ok, items:[{key, kind, customerId, company, dueDate, doneBy, doneAt}] } 최근순
// POST { action:'done', key, customerId, company, dueDate, userName } → { ok, item } — 이미 누가 완료했으면 그 기록을 돌려준다
// POST { action:'undo', key, userName }                       → { ok }

import { requireDb } from '../_lib/ai-auth';
import { AiError, checkOrigin, cleanUserName, errorResponse, jsonFor, nowIso, optionsResponse, readJsonCapped, type AiEnv } from '../_lib/ai-http';

// renewal:{고객ID}:{관리일} 재계약 연락 · winback:{딜ID}:{작년 문의일 1년} 작년실패 연락
const KEY_RE = /^(renewal|winback):\d{1,10}:\d{4}-\d{2}-\d{2}$/;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ITEMS = 2000;

interface TodoRow {
  todo_key: string;
  kind: string;
  customer_id: number | null;
  company: string;
  due_date: string | null;
  done_by: string;
  done_at: string;
}

function toItem(r: TodoRow) {
  return { key: r.todo_key, kind: r.kind, customerId: r.customer_id, company: r.company, dueDate: r.due_date, doneBy: r.done_by, doneAt: r.done_at };
}

function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  console.error('[todos] unexpected', String(err).slice(0, 300));
  return new AiError(500, 'internal', '처리 중 오류가 발생했습니다.', { retryable: true });
}

/** AI 저장소(D1) 연결 + home_todos 표 확인 */
async function todoDb(env: AiEnv): Promise<D1Database> {
  const db = await requireDb(env);
  try {
    await db.prepare('SELECT 1 FROM home_todos LIMIT 1').all();
  } catch {
    throw new AiError(503, 'db_not_initialized', '할 일 저장소 표가 아직 없습니다(관리자 확인 필요).');
  }
  return db;
}

function requireKey(v: unknown): string {
  const key = typeof v === 'string' ? v.trim() : '';
  if (!KEY_RE.test(key)) throw new AiError(400, 'bad_request', '할 일 키가 올바르지 않습니다.');
  return key;
}

async function getRow(db: D1Database, key: string): Promise<TodoRow | null> {
  return db.prepare('SELECT * FROM home_todos WHERE todo_key = ?').bind(key).first<TodoRow>();
}

export const onRequestGet: PagesFunction<AiEnv> = async ({ request, env }) => {
  try {
    const originError = checkOrigin(request, env);
    if (originError) throw originError;
    const db = await todoDb(env);
    const { results } = await db.prepare('SELECT * FROM home_todos ORDER BY done_at DESC LIMIT ?').bind(MAX_ITEMS).all<TodoRow>();
    return jsonFor(request, env, { ok: true, items: (results ?? []).map(toItem) });
  } catch (err) {
    return errorResponse(request, env, toAiError(err));
  }
};

export const onRequestPost: PagesFunction<AiEnv> = async ({ request, env }) => {
  try {
    const originError = checkOrigin(request, env);
    if (originError) throw originError;
    const body = await readJsonCapped<Record<string, unknown>>(request, 2_000);
    const db = await todoDb(env);
    const key = requireKey(body.key);

    if (body.action === 'done') {
      const company = typeof body.company === 'string' ? body.company.trim().slice(0, 100) : '';
      if (!company) throw new AiError(400, 'bad_request', '회사명이 필요합니다.');
      const customerId = Number(body.customerId);
      const dueDate = typeof body.dueDate === 'string' && YMD_RE.test(body.dueDate) ? body.dueDate : null;
      // 동시에 눌러도 먼저 완료한 사람의 기록이 남는다
      await db
        .prepare('INSERT OR IGNORE INTO home_todos (todo_key, kind, customer_id, company, due_date, done_by, done_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(key, key.slice(0, key.indexOf(':')), Number.isInteger(customerId) && customerId > 0 ? customerId : null, company, dueDate, cleanUserName(body.userName), nowIso())
        .run();
      const row = await getRow(db, key);
      if (!row) throw new AiError(500, 'persist_failed', '완료 기록을 저장하지 못했습니다.', { retryable: true });
      return jsonFor(request, env, { ok: true, item: toItem(row) });
    }
    if (body.action === 'undo') {
      await db.prepare('DELETE FROM home_todos WHERE todo_key = ?').bind(key).run();
      return jsonFor(request, env, { ok: true });
    }
    throw new AiError(400, 'bad_request', '알 수 없는 요청입니다.');
  } catch (err) {
    return errorResponse(request, env, toAiError(err));
  }
};

export const onRequestOptions: PagesFunction<AiEnv> = async ({ request, env }) => optionsResponse(request, env, 'GET, POST, OPTIONS');
