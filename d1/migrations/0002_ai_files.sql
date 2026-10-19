-- 견적서 입력 도우미 — 업로드한 파일(R2)의 메타데이터와 판독 결과. 바인딩 이름 AI_DB
-- 적용: Cloudflare 대시보드 > D1 > (airtoradmin-ai / airtoradmin-ai-preview) > Console
--   (콘솔 입력칸은 한 줄 — 주석을 지우고 한 줄로 합쳐 넣는다) 또는 wrangler d1 execute --file
-- IF NOT EXISTS 라 여러 번 실행해도 안전하다.

-- 파일 본문은 R2(FILES 바인딩)의 r2_key 에 있다. company_key 는 회사명 정규화(src/lib/company.ts) 값으로,
-- 수주 전 딜에 붙은 견적서도 나중에 고객이 생기면 고객 상세에서 찾을 수 있게 한다.
CREATE TABLE IF NOT EXISTS ai_files (
  id TEXT PRIMARY KEY,                                  -- crypto.randomUUID() (추측 불가능한 내려받기 키)
  kind TEXT NOT NULL DEFAULT 'quote',                   -- quote(견적서)
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,                                 -- 같은 파일 재업로드 감지
  r2_key TEXT NOT NULL,
  company TEXT,                                         -- 판독한 수신처 또는 연결한 고객사 이름
  company_key TEXT,                                     -- normalizeCompanyName(company)
  customer_id INTEGER,
  deal_id INTEGER,
  status TEXT NOT NULL DEFAULT 'uploaded',              -- uploaded(판독만) | linked(시스템에 입력됨)
  extraction_json TEXT,                                 -- 판독 결과
  applied_json TEXT,                                    -- 실제로 반영한 변경 요약
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  linked_at TEXT,
  linked_by TEXT,
  deleted_at TEXT,
  deleted_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_files_company ON ai_files (company_key, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ai_files_recent ON ai_files (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ai_files_sha ON ai_files (sha256) WHERE deleted_at IS NULL;
