-- 고객 상태 '수동 고정'. 바인딩 이름 AI_DB
-- 적용: wrangler d1 execute (airtoradmin-ai / airtoradmin-ai-preview) --remote --file=이 파일
-- IF NOT EXISTS 라 여러 번 실행해도 안전하다.

-- 고객 상태는 마지막 작업일로부터 지난 날수로 자동으로 바뀐다(src/lib/customerStatus.ts: 365일 넘으면 이탈위험, 450일 넘으면 이탈).
-- 담당자가 손으로 고른 고객만 여기에 남고 자동 변경에서 빠진다. '자동'으로 되돌리면 행을 지운다.
-- last_work 는 고정할 때의 마지막 작업일이다. 새 작업이 들어와 마지막 작업일이 바뀌면 고정은 끝나고(화면이 행을 지운다) 다시 자동이 된다.
-- status 는 고정한 상태이고, 고객 표(카페24 airtor_customers.customer_status)는 화면이 이 값에 맞춰 저장하는 사본이다.
-- company 는 고정 당시 이름(기록용).
CREATE TABLE IF NOT EXISTS customer_status_locks (
  customer_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL,                                 -- 신규 / 재구매 / 충성고객 (+ ' 이탈위험' · ' 이탈') / 고객이탈
  last_work TEXT NOT NULL,                              -- YYYY-MM-DD (고정할 때의 마지막 작업일)
  company TEXT NOT NULL,
  set_by TEXT NOT NULL,
  set_at TEXT NOT NULL                                  -- ISO 시각
);
