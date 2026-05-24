-- ============================================================
-- airtoradmin — Phase 1.5 마이그레이션 (역할 체계 변경)
--   lead/member/support 3개 → a_grade/b_grade/pin_wash/dely/parts_wash 5개
--
-- 실행 시점: 001/002/003 모두 적용된 환경에서 한 번 실행.
--
-- 영향 범위:
--   1) airtor_labor_rates.role (ENUM) — 기존 데이터 모두 폐기 후 5행 신규 INSERT
--   2) airtor_projects.worker_assignments / labor_breakdown (JSON TEXT)
--      — 기존 lead/member/support 키 JSON은 신규 코드와 매칭되지 않아 의미 없음 → NULL 처리
--
-- 카페24 phpMyAdmin에 그대로 붙여넣어 한 번에 실행.
--
-- ALTER MODIFY ENUM 주의:
--   기존 role 컬럼에 lead/member/support 값이 남아있으면 ALTER가 실패한다.
--   → DELETE를 먼저 하고 ALTER를 적용한다.
-- ============================================================

SET NAMES utf8;

-- ============================================================
-- 1) labor_rates: 기존 행 삭제 → ENUM 교체 → 신규 5행 INSERT
-- ============================================================

-- 기존 단가는 새 역할 체계와 의미가 다르므로 폐기
DELETE FROM airtor_labor_rates;

-- ENUM 재정의 (5개 신규 코드)
ALTER TABLE airtor_labor_rates
  MODIFY COLUMN role ENUM('a_grade','b_grade','pin_wash','dely','parts_wash') NOT NULL;

-- 현재 월에 5개 역할 초기 단가 INSERT (합리적 시작점, 사용자가 UI에서 ▲/▼로 조정)
INSERT IGNORE INTO airtor_labor_rates (`year_month`, role, daily_rate, updated_by) VALUES
  (DATE_FORMAT(NOW(), '%Y-%m'), 'a_grade',    250000, 'migration'),
  (DATE_FORMAT(NOW(), '%Y-%m'), 'b_grade',    200000, 'migration'),
  (DATE_FORMAT(NOW(), '%Y-%m'), 'pin_wash',   180000, 'migration'),
  (DATE_FORMAT(NOW(), '%Y-%m'), 'dely',       150000, 'migration'),
  (DATE_FORMAT(NOW(), '%Y-%m'), 'parts_wash', 170000, 'migration');

-- ============================================================
-- 2) projects: 옛 키(lead/member/support) JSON 무효화
--    파생지표(labor_cost, labor_cost_ratio, net_profit, profit_ratio)도 함께 리셋
--    → 사용자가 신규 5역할로 다시 입력하면 손익 계산이 새로 산정됨
-- ============================================================
UPDATE airtor_projects
SET
  worker_assignments = NULL,
  labor_breakdown    = NULL,
  labor_cost         = 0,
  labor_cost_ratio   = 0.0000,
  total_cost         = meal_cost + transport_cost + other_cost,
  net_profit         = net_revenue - (meal_cost + transport_cost + other_cost),
  profit_ratio       = CASE
                         WHEN net_revenue > 0
                         THEN (net_revenue - (meal_cost + transport_cost + other_cost)) / net_revenue
                         ELSE 0
                       END
WHERE worker_assignments IS NOT NULL OR labor_breakdown IS NOT NULL;
