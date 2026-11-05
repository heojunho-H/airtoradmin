-- 홈 '오늘의 할 일' 완료 기록. 바인딩 이름 AI_DB
-- 적용: Cloudflare 대시보드 > D1 > (airtoradmin-ai / airtoradmin-ai-preview) > Console
--   (콘솔 입력칸은 한 줄 — 주석을 지우고 한 줄로 합쳐 넣는다) 또는 wrangler d1 execute --file
-- IF NOT EXISTS 라 여러 번 실행해도 안전하다.

-- 진행중 목록은 화면이 고객 데이터에서 매번 계산하고(src/lib/home/metrics.ts), 여기에는 완료한 것만 남는다.
-- todo_key = renewal:{고객ID}:{관리일} — 고객이 다시 작업하면 관리일이 바뀌어 다음 회차는 새 키가 된다.
--            winback:{딜ID}:{작년 문의일 1년} — 작년실패 연락(2026-11 추가, 표 변경 없음, customer_id 비움).
-- company 는 완료 당시 이름(고객이 지워져도 완료 목록에 보이게). 되돌리기는 행을 지운다.
CREATE TABLE IF NOT EXISTS home_todos (
  todo_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'renewal',                 -- renewal(재계약 연락) · winback(작년실패 연락)
  customer_id INTEGER,
  company TEXT NOT NULL,
  due_date TEXT,                                        -- 관리일 / 작년 문의일 1년 YYYY-MM-DD
  done_by TEXT NOT NULL,
  done_at TEXT NOT NULL                                 -- ISO 시각
);
CREATE INDEX IF NOT EXISTS idx_home_todos_done ON home_todos (done_at DESC);
