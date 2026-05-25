-- ============================================================
-- airtoradmin — Phase 1.7 마이그레이션 (AI 자동 추천 컬럼)
--
-- 추가 컬럼:
--   ai_status         — AI 호출 상태 (pending/generating/success/failed/manual)
--   ai_attempted_at   — 마지막 AI 호출 시각
--   ai_error          — 실패 사유 (failed 상태일 때)
--   ai_influence      — 학습 영향도 (high/medium/low/none)
--
-- 실행 시점: 004 (역할 변경) 이후, AI 자동 추천 기능 배포 전
-- 환경 가정: 카페24 MySQL 5.x + InnoDB
-- 백업 권장: CREATE TABLE airtor_projects_backup_pre_ai AS SELECT * FROM airtor_projects;
-- ============================================================

ALTER TABLE airtor_projects
  ADD COLUMN ai_status ENUM('pending','generating','success','failed','manual')
             NOT NULL DEFAULT 'pending' AFTER ai_applied,
  ADD COLUMN ai_attempted_at DATETIME DEFAULT NULL AFTER ai_status,
  ADD COLUMN ai_error TEXT DEFAULT NULL AFTER ai_attempted_at,
  ADD COLUMN ai_influence ENUM('high','medium','low','none')
             DEFAULT NULL AFTER ai_error;

-- 기존 행들의 ai_status 초기화
-- worker_assignments가 이미 있으면 'manual' (사용자가 수동 입력했다고 간주)
-- worker_assignments가 비어 있으면 'pending' (AI 호출 대상)
UPDATE airtor_projects
SET ai_status = CASE
  WHEN worker_assignments IS NOT NULL AND worker_assignments != '' AND worker_assignments != 'null'
    THEN 'manual'
  ELSE 'pending'
END
WHERE ai_status = 'pending';
