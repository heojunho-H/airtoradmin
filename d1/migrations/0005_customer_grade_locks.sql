-- 고객 등급 '수동 고정'. 바인딩 이름 AI_DB
-- 적용: wrangler d1 execute (airtoradmin-ai / airtoradmin-ai-preview) --remote --file=이 파일
-- IF NOT EXISTS 라 여러 번 실행해도 안전하다.

-- 고객 등급은 누적 거래 금액으로 자동 분류한다(src/lib/customerGrade.ts: 1,000만↑ S · 400만↑ A · 100만↑ B · 그 미만 그 외).
-- 담당자가 손으로 바꾼 고객만 여기에 남고 자동 분류에서 빠진다. '자동'으로 되돌리면 행을 지운다.
-- grade 는 고정한 등급이고, 고객 표(카페24 airtor_customers.grade)는 화면이 이 값에 맞춰 저장하는 사본이다.
-- company 는 고정 당시 이름(기록용).
CREATE TABLE IF NOT EXISTS customer_grade_locks (
  customer_id INTEGER PRIMARY KEY,
  grade TEXT NOT NULL,                                  -- S / A / B / 그 외
  company TEXT NOT NULL,
  set_by TEXT NOT NULL,
  set_at TEXT NOT NULL                                  -- ISO 시각
);
