-- 단가보장 협약서 링크 (B1 메일의 '단가보장 협약서 보기'). 바인딩 이름 AI_DB — docs/mou.md
-- 팔로업 실제 실행이 mou 단계 대상마다 협약서 내용(doc_json)을 얼려 두고, 고객은 /mou/<id> 로 연다.
-- 코드(functions/_lib/mou.ts ensureMouTable)가 처음 쓸 때 같은 문장으로 표를 만들므로 따로 실행하지 않아도 된다.
-- 수동 적용: npx wrangler d1 execute airtoradmin-ai --remote --file=d1/migrations/0007_mou_links.sql
-- IF NOT EXISTS 라 여러 번 실행해도 안전하다. 되돌리기: DROP TABLE mou_links;
-- 링크 하나 폐기: UPDATE mou_links SET revoked_at = '<ISO 시각>' WHERE id = '<id>';  (같은 작업의 새 링크는 막지 않는다)
CREATE TABLE IF NOT EXISTS mou_links (
  id TEXT PRIMARY KEY,                -- 128비트 무작위 base64url 22자 (링크의 열쇠)
  customer_id INTEGER NOT NULL,
  job_key TEXT NOT NULL,              -- functions/_lib/followups.ts jobKeyOf
  deal_id INTEGER,
  doc_json TEXT NOT NULL,             -- 발행 때 얼린 협약서 내용 (MouDoc)
  created_at TEXT NOT NULL,           -- ISO 시각
  expires_on TEXT NOT NULL,           -- 적용 기간 끝 + 30일 (KST 날짜) — 지나면 410
  pdf_key TEXT,                       -- R2 FILES 의 PDF 캐시 키 (처음 내려받을 때)
  revoked_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS mou_links_job ON mou_links (customer_id, job_key) WHERE revoked_at IS NULL;
