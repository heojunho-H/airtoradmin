-- 등급별 고객책임자. 바인딩 이름 AI_DB
-- 적용: wrangler d1 execute (airtoradmin-ai / airtoradmin-ai-preview) --remote --file=이 파일
-- IF NOT EXISTS 라 여러 번 실행해도 안전하다.

-- 책임자가 비어 있는 S·A·B 고객에게 화면이 이 표의 책임자를 자동으로 지정한다(src/app/App.tsx, 규칙은 src/lib/customerGrade.ts).
-- 이미 책임자가 있는 고객은 등급이 바뀌어도 바꾸지 않는다.
-- 저장소가 공개라 직원 이름은 코드·이 파일에 쓰지 않는다. 값은 배포할 때 명령으로 넣는다:
--   wrangler d1 execute <DB> --remote --command "INSERT OR REPLACE INTO customer_grade_managers (grade, manager, set_by, set_at) VALUES ('S','<이름>','<누가>','<ISO 시각>'), ..."
-- manager 는 공급망 관리 > 고객책임자의 이름과 같아야 한다(목록에 없는 이름이면 화면이 지정하지 않는다). 행이 없는 등급은 자동 지정하지 않는다.
CREATE TABLE IF NOT EXISTS customer_grade_managers (
  grade TEXT PRIMARY KEY,                               -- S / A / B
  manager TEXT NOT NULL,
  set_by TEXT NOT NULL,
  set_at TEXT NOT NULL                                  -- ISO 시각
);
