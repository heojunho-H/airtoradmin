-- ============================================================
-- airtoradmin — Phase 8 보정 마이그레이션
--
-- 목적:
--   airtor_projects의 labor_cost_ratio / profit_ratio 저장 단위를
--   percent (45.32) → fraction (0.4532) 으로 변경.
--
-- 이유:
--   Phase 8 명세(AI staffing 응답의 estimatedProfitRatio: 0~1, 프론트 UI의
--   buildProfitContext가 ratio*100 으로 표시)와 단위 일관성 확보.
--
-- 적용 후 규칙:
--   - 0.4532 = 45.32%
--   - 적자 프로젝트는 음수 (예: -0.10 = -10%)
--   - UI는 (ratio * 100).toFixed(N) 로 퍼센트 변환
--
-- 실행 순서:
--   1) ALTER (DECIMAL(6,2) → DECIMAL(6,4)) — 소수점 4자리 확보
--   2) UPDATE (기존 percent 값 / 100) — 멱등 가드 포함
--
-- 멱등성:
--   - ALTER MODIFY는 동일 정의로 반복 호출 가능
--   - UPDATE는 |ratio| > 1 가드로 이미 fraction인 행은 재변환 방지
--     (정상 percent: 거의 항상 |r| > 1 / 정상 fraction: |r| ≤ 1)
--   - 예외: percent로 |r| ≤ 1 인 행(예: 0.5% 손익률)은 변환 안 됨 — 운영 데이터에서 사실상 없음
--
-- 환경: 카페24 MySQL 5.x — phpMyAdmin에 그대로 붙여넣어 실행
-- ============================================================

SET NAMES utf8;

-- 1) 컬럼 정밀도 확장 — fraction은 소수점 4자리 필요 (예: 0.4532)
ALTER TABLE airtor_projects
  MODIFY COLUMN labor_cost_ratio DECIMAL(6,4) NOT NULL DEFAULT 0.0000,
  MODIFY COLUMN profit_ratio     DECIMAL(6,4) NOT NULL DEFAULT 0.0000;

-- 2) 기존 percent 값을 fraction으로 변환 (멱등 가드)
UPDATE airtor_projects
SET labor_cost_ratio = labor_cost_ratio / 100
WHERE labor_cost_ratio > 1 OR labor_cost_ratio < -1;

UPDATE airtor_projects
SET profit_ratio = profit_ratio / 100
WHERE profit_ratio > 1 OR profit_ratio < -1;

-- 검증용 (phpMyAdmin에서 별도로 한 번 더 SELECT)
-- SELECT id, project_name, labor_cost_ratio, profit_ratio FROM airtor_projects ORDER BY id DESC LIMIT 20;
