-- ============================================================
-- airtoradmin — Phase 1 마이그레이션
--   - airtor_projects: 프로젝트별 손익 본체
--   - airtor_labor_rates: 월별 역할별 일당 단가표
--
-- 카페24 phpMyAdmin에 그대로 붙여넣어 한 번에 실행.
-- 실행 후 `php api/migrations/002_backfill_projects.php` 로 기존 success 딜 백필.
--
-- 환경 가정: 카페24 MySQL 5.x + utf8 + InnoDB
-- 호환 주의:
--   - JSON 컬럼 미사용 (TEXT에 JSON 문자열 저장)
--   - 1 테이블 내 TIMESTAMP는 DEFAULT 1개 + ON UPDATE 1개 패턴 (5.5+)
--   - `year_month` 컬럼은 INTERVAL 키워드와 충돌 가능 → 모든 참조에 백틱 사용
-- ============================================================

SET NAMES utf8;

-- ============================================================
-- airtor_projects
--   deal_id UNIQUE: syncDealToProject가 INSERT IGNORE / ON DUPLICATE KEY UPDATE를
--   사용해 race 없이 멱등 동기화하기 위함.
--   work_history_dealid: customers.workHistory[].dealId와 동일값을 캐시
--                       (조인 헬퍼; 백필 시 deal_id와 같은 값으로 채움)
--   ratios: 퍼센트 단위로 저장 (45.32 = 45.32%). 음수 가능 (적자 프로젝트).
-- ============================================================
CREATE TABLE IF NOT EXISTS airtor_projects (
  id                    INT UNSIGNED      NOT NULL AUTO_INCREMENT,

  -- 식별
  deal_id               INT UNSIGNED      NOT NULL,
  customer_id           INT UNSIGNED      DEFAULT NULL,
  work_history_dealid   INT UNSIGNED      DEFAULT NULL,

  -- 메타
  project_name          VARCHAR(255)      NOT NULL DEFAULT '',
  service_type          VARCHAR(100)      NOT NULL DEFAULT '',
  work_date             DATE              DEFAULT NULL,

  -- 상태
  status                ENUM('in-progress','completed') NOT NULL DEFAULT 'in-progress',
  completed_at          DATETIME          DEFAULT NULL,
  completed_reason      ENUM('manual','report_sent')    DEFAULT NULL,

  -- 매출
  quotation_amount      INT               NOT NULL DEFAULT 0,
  tax_amount            INT               NOT NULL DEFAULT 0,
  net_revenue           INT               NOT NULL DEFAULT 0,

  -- 인력 (JSON TEXT: {"lead":N,"member":M,"support":K,"days":D})
  worker_assignments    TEXT              DEFAULT NULL,

  -- 인건비
  labor_breakdown       TEXT              DEFAULT NULL,
  labor_cost            INT               NOT NULL DEFAULT 0,

  -- 변동비
  meal_cost             INT               NOT NULL DEFAULT 0,
  transport_cost        INT               NOT NULL DEFAULT 0,
  other_cost            INT               NOT NULL DEFAULT 0,

  -- 파생 (저장 형식: 정수 비용은 원 단위, ratio는 fraction 0~1)
  --   예: 0.4532 = 45.32% (UI에서 *100으로 퍼센트 표시)
  --   적자 프로젝트는 음수 (예: -0.10 = -10%)
  --   AI staffing 응답·프론트 UI와 단위 일관성 유지
  total_cost            INT               NOT NULL DEFAULT 0,
  labor_cost_ratio      DECIMAL(6,4)      NOT NULL DEFAULT 0.0000,
  net_profit            INT               NOT NULL DEFAULT 0,
  profit_ratio          DECIMAL(6,4)      NOT NULL DEFAULT 0.0000,

  -- AI
  ai_suggestion         TEXT              DEFAULT NULL,
  ai_applied            TINYINT(1)        NOT NULL DEFAULT 0,

  -- 기타
  memo                  TEXT              DEFAULT NULL,
  created_at            TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP         NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_deal          (deal_id),
  KEY        idx_customer     (customer_id),
  KEY        idx_status_date  (status, work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ============================================================
-- airtor_labor_rates
--   캐스케이드 룰 (조회 시): 당월 → 직전월 → ... → 1년 내 → 없으면 0
--   (이 로직은 api/labor_rates_api.php의 GET 핸들러에서 구현)
-- ============================================================
CREATE TABLE IF NOT EXISTS airtor_labor_rates (
  id            INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  `year_month`  VARCHAR(7)     NOT NULL,
  role          ENUM('lead','member','support') NOT NULL,
  daily_rate    INT            NOT NULL DEFAULT 0,
  updated_by    VARCHAR(100)   NOT NULL DEFAULT '',
  updated_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_month_role (`year_month`, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ============================================================
-- 초기 단가 — 현재 월에 lead/member/support 3행 삽입.
-- 이미 같은 (월, 역할) 행이 있으면 IGNORE 되어 안전하게 재실행 가능.
-- ============================================================
INSERT IGNORE INTO airtor_labor_rates (`year_month`, role, daily_rate, updated_by) VALUES
  (DATE_FORMAT(NOW(), '%Y-%m'), 'lead',    250000, 'migration'),
  (DATE_FORMAT(NOW(), '%Y-%m'), 'member',  180000, 'migration'),
  (DATE_FORMAT(NOW(), '%Y-%m'), 'support', 120000, 'migration');
