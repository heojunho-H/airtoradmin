-- ============================================================
-- airtoradmin — 스티비(Stibee) 뉴스레터 연동 마이그레이션
--
-- 대상 테이블: airtor_customers (이 테이블에 대한 첫 마이그레이션)
--
-- 추가 컬럼:
--   newsletter_status  — 스티비 주소록 측 상태 캐시
--                        none(미등록) / subscribed(구독중) / unsubscribed(수신거부) / bounced(자동삭제·반송)
--   stibee_synced_at   — 마지막으로 스티비 주소록에 동기화한 시각
--   contacts           — 복수 담당자 JSON TEXT: [{"name","position","phone","email"}, ...]
--                        (프론트 contacts[]가 지금까지 서버에 저장되지 않던 문제 해소.
--                         기존 work_history / email_history와 같은 JSON-in-TEXT 패턴)
--
-- 하위 호환: contact_name / contact_position / phone / email 단일 필드는 그대로 유지하며
--            프론트가 저장 시 contacts[0]을 미러링한다. contacts가 NULL/빈값이면
--            프론트 getContacts()가 단일 필드로 폴백하므로 백필은 선택 사항이지만,
--            스티비 동기화 대상을 명확히 하기 위해 아래에서 1건짜리 배열로 백필한다.
--
-- 환경 가정: 카페24 MySQL 5.x + InnoDB (JSON 컬럼 타입 없음 → TEXT)
-- 백업 권장: CREATE TABLE airtor_customers_backup_pre_newsletter AS SELECT * FROM airtor_customers;
-- ============================================================

SET NAMES utf8;

ALTER TABLE airtor_customers
  ADD COLUMN newsletter_status ENUM('none','subscribed','unsubscribed','bounced')
             NOT NULL DEFAULT 'none' AFTER reminder_status,
  ADD COLUMN stibee_synced_at DATETIME DEFAULT NULL AFTER newsletter_status,
  ADD COLUMN contacts TEXT DEFAULT NULL AFTER email;

-- 기존 행 백필: 단일 담당자 필드 → contacts 1건 배열
-- (담당자명·이메일·전화가 모두 비어 있는 행은 빈 배열 대신 NULL로 두어 프론트 폴백에 맡김)
UPDATE airtor_customers
SET contacts = CONCAT(
  '[{"name":"',     REPLACE(REPLACE(IFNULL(contact_name, ''),     '\\', '\\\\'), '"', '\\"'),
  '","position":"', REPLACE(REPLACE(IFNULL(contact_position, ''), '\\', '\\\\'), '"', '\\"'),
  '","phone":"',    REPLACE(REPLACE(IFNULL(phone, ''),            '\\', '\\\\'), '"', '\\"'),
  '","email":"',    REPLACE(REPLACE(IFNULL(email, ''),            '\\', '\\\\'), '"', '\\"'),
  '"}]'
)
WHERE (contacts IS NULL OR contacts = '')
  AND (IFNULL(contact_name, '') != '' OR IFNULL(email, '') != '' OR IFNULL(phone, '') != '');

-- 검증:
--   SELECT id, company, email, contacts, newsletter_status, stibee_synced_at
--   FROM airtor_customers ORDER BY id DESC LIMIT 10;
