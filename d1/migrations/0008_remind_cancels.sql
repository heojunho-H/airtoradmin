-- 리마인드 메일 '보내지 않기'(취소)와 실제 실행 기록. 바인딩 이름 AI_DB — docs/remind-mails.md '고객 상세에서 관리'
-- 고객 상세 '리마인드 메일'에서 회차마다(job_key·stage) 또는 고객 전체('*'·0)를 끈다. 발송기는 살아 있는 취소를 건너뛴다.
-- 코드(functions/_lib/remind-cancels.ts ensureRemindTables)가 처음 쓸 때 같은 문장으로 표를 만들므로 따로 실행하지 않아도 된다.
-- 수동 적용: npx wrangler d1 execute airtoradmin-ai --remote --file=d1/migrations/0008_remind_cancels.sql
-- IF NOT EXISTS 라 여러 번 실행해도 안전하다. 되돌리기: DROP TABLE remind_cancels; DROP TABLE remind_runs;
CREATE TABLE IF NOT EXISTS remind_cancels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  job_key TEXT NOT NULL,              -- functions/_lib/followups.ts jobKeyOf, '*' = 모든 작업
  stage INTEGER NOT NULL,             -- 1~4, 0 = 모든 회차
  work_date TEXT,                     -- 취소할 때의 작업일·작업명 사본 (작업 키가 바뀌면 '연결이 끊긴 취소'로 보인다)
  project_name TEXT,
  set_by TEXT,                        -- 관리 앱 로그인 이름
  set_at TEXT NOT NULL,
  restored_by TEXT,                   -- 되돌려도 행은 남긴다
  restored_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS remind_cancels_active ON remind_cancels (customer_id, job_key, stage) WHERE restored_at IS NULL;
CREATE INDEX IF NOT EXISTS remind_cancels_customer ON remind_cancels (customer_id);

-- 실제 실행 한 번에 한 줄 — 고객 상세의 '마지막 자동 실행'과 멈춤 경고에 쓴다 (고객 id 만, 메일·회사명 X)
CREATE TABLE IF NOT EXISTS remind_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at TEXT NOT NULL,
  targets INTEGER NOT NULL,
  sent INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  customer_ids TEXT                   -- JSON 배열
);
