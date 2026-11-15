// 리마인드 메일 '보내지 않기'(취소)와 실제 실행 기록 — D1 AI_DB
// 고객 상세 '리마인드 메일'(src/app/components/RemindMailPanel.tsx)에서 회차마다 또는 고객 전체를 끈다.
//   - job_key '*' = 이 고객의 모든 작업, stage 0 = 모든 회차 → '*'·0 이 '이 고객 리마인드 모두 끄기'
//   - 되돌려도 지우지 않고 restored_by·restored_at 을 채워 기록으로 남긴다 (보내지 않기로 한 메일을 다시 켠 사람이 남게)
//   - 작업 키가 workDate·projectName 으로 만들어지는 항목은 그 값을 고치면 키가 바뀐다 → 취소에 사본을 남겨
//     화면에서 '연결이 끊긴 취소'로 보인다
// 표는 처음 쓸 때 만든다(운영 D1 손으로 쓰지 않음). 같은 내용: d1/migrations/0008_remind_cancels.sql
// 발송기(functions/api/newsletter.ts run-followups)는 시작할 때 activeCancelKeys 로 computeDue 에 넘긴다.

import { cancelKeyOf } from './followups';

const TABLE_SQL = [
  `CREATE TABLE IF NOT EXISTS remind_cancels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    job_key TEXT NOT NULL,
    stage INTEGER NOT NULL,
    work_date TEXT,
    project_name TEXT,
    set_by TEXT,
    set_at TEXT NOT NULL,
    restored_by TEXT,
    restored_at TEXT
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS remind_cancels_active ON remind_cancels (customer_id, job_key, stage) WHERE restored_at IS NULL',
  'CREATE INDEX IF NOT EXISTS remind_cancels_customer ON remind_cancels (customer_id)',
  `CREATE TABLE IF NOT EXISTS remind_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at TEXT NOT NULL,
    targets INTEGER NOT NULL,
    sent INTEGER NOT NULL,
    failed INTEGER NOT NULL,
    customer_ids TEXT
  )`,
];
let tablesReady = false;

export async function ensureRemindTables(db: D1Database): Promise<void> {
  if (tablesReady) return;
  await db.batch(TABLE_SQL.map((s) => db.prepare(s)));
  tablesReady = true;
}

export interface CancelRow {
  id: number;
  customerId: number;
  jobKey: string;
  stage: number;
  workDate: string;
  projectName: string;
  setBy: string;
  setAt: string;
  restoredBy: string | null;
  restoredAt: string | null;
}

type Raw = Record<string, unknown>;
const toRow = (r: Raw): CancelRow => ({
  id: Number(r.id),
  customerId: Number(r.customer_id),
  jobKey: String(r.job_key ?? ''),
  stage: Number(r.stage),
  workDate: String(r.work_date ?? ''),
  projectName: String(r.project_name ?? ''),
  setBy: String(r.set_by ?? ''),
  setAt: String(r.set_at ?? ''),
  restoredBy: r.restored_by == null ? null : String(r.restored_by),
  restoredAt: r.restored_at == null ? null : String(r.restored_at),
});

/** 살아 있는 취소 전부 — 발송기용 (cancelKeyOf 키) */
export async function activeCancelKeys(db: D1Database): Promise<Set<string>> {
  await ensureRemindTables(db);
  const { results } = await db.prepare('SELECT customer_id, job_key, stage FROM remind_cancels WHERE restored_at IS NULL').all<Raw>();
  return new Set((results || []).map((r) => cancelKeyOf(Number(r.customer_id), String(r.job_key), Number(r.stage))));
}

/** 한 고객의 취소 기록 — 살아 있는 것과 되돌린 것 (최근 것부터) */
export async function listCustomerCancels(db: D1Database, customerId: number): Promise<CancelRow[]> {
  await ensureRemindTables(db);
  const { results } = await db
    .prepare('SELECT * FROM remind_cancels WHERE customer_id = ? ORDER BY id DESC LIMIT 50')
    .bind(customerId)
    .all<Raw>();
  return (results || []).map(toRow);
}

export interface CancelInput {
  customerId: number;
  jobKey: string;
  stage: number;
  workDate: string;
  projectName: string;
  by: string;
  at: string;
}

/** 취소 — 이미 살아 있는 취소가 있으면 그대로 둔다 */
export async function addCancel(db: D1Database, x: CancelInput): Promise<void> {
  await ensureRemindTables(db);
  await db
    .prepare(
      `INSERT INTO remind_cancels (customer_id, job_key, stage, work_date, project_name, set_by, set_at)
       SELECT ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM remind_cancels WHERE customer_id = ? AND job_key = ? AND stage = ? AND restored_at IS NULL)`,
    )
    .bind(x.customerId, x.jobKey, x.stage, x.workDate, x.projectName, x.by, x.at, x.customerId, x.jobKey, x.stage)
    .run();
}

/** 되돌리기 — 행을 지우지 않고 되돌린 사람·시각을 남긴다. 되돌린 행 수를 돌려준다 */
export async function restoreCancel(db: D1Database, x: { customerId: number; jobKey: string; stage: number; by: string; at: string }): Promise<number> {
  await ensureRemindTables(db);
  const r = await db
    .prepare('UPDATE remind_cancels SET restored_by = ?, restored_at = ? WHERE customer_id = ? AND job_key = ? AND stage = ? AND restored_at IS NULL')
    .bind(x.by, x.at, x.customerId, x.jobKey, x.stage)
    .run();
  return Number(r.meta?.changes ?? 0);
}

export interface RunRecord {
  runAt: string;
  targets: number;
  sent: number;
  failed: number;
}

/** 실제 실행 한 번 — 고객 id 만 남긴다(메일·회사명 X) */
export async function recordRun(db: D1Database, x: RunRecord & { customerIds: number[] }): Promise<void> {
  await ensureRemindTables(db);
  await db
    .prepare('INSERT INTO remind_runs (run_at, targets, sent, failed, customer_ids) VALUES (?, ?, ?, ?, ?)')
    .bind(x.runAt, x.targets, x.sent, x.failed, JSON.stringify(x.customerIds.slice(0, 200)))
    .run();
}

export async function lastRun(db: D1Database): Promise<RunRecord | null> {
  await ensureRemindTables(db);
  const r = await db.prepare('SELECT run_at, targets, sent, failed FROM remind_runs ORDER BY id DESC LIMIT 1').first<Raw>();
  if (!r) return null;
  return { runAt: String(r.run_at), targets: Number(r.targets), sent: Number(r.sent), failed: Number(r.failed) };
}
