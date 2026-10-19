-- AI(Claude) 기능용 Cloudflare D1 스키마 — 바인딩 이름 AI_DB
-- 적용: Cloudflare 대시보드 > D1 > (airtoradmin-ai / airtoradmin-ai-preview) > Console 에 붙여넣어 실행
--   또는: npx wrangler d1 execute airtoradmin-ai --remote --file=d1/migrations/0001_ai_init.sql
-- IF NOT EXISTS 라 여러 번 실행해도 안전하다. 시드 데이터는 없다(행이 없으면 코드 기본값 사용).

-- 기능별 모델 설정 (chat / company_info / staffing)
CREATE TABLE IF NOT EXISTS ai_settings (
  feature TEXT PRIMARY KEY CHECK (feature IN ('chat', 'company_info', 'staffing')),
  model TEXT NOT NULL,
  effort TEXT CHECK (effort IS NULL OR effort IN ('low', 'medium', 'high', 'xhigh', 'max')),
  enabled INTEGER NOT NULL DEFAULT 1,
  allow_override INTEGER NOT NULL DEFAULT 1,
  override_models TEXT NOT NULL DEFAULT '[]',          -- JSON 배열 (chat 전용: 대화별로 고를 수 있는 모델)
  updated_by TEXT,
  updated_at TEXT NOT NULL
);

-- 대화 (팀 전체 공유)
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,                                  -- crypto.randomUUID()
  persona TEXT NOT NULL,
  title TEXT NOT NULL,
  model_override TEXT,                                  -- 대화별로 고른 모델 (NULL = 관리자 기본값)
  last_model TEXT,                                      -- 마지막으로 실제 응답한 모델
  system_json TEXT NOT NULL,                            -- 대화 시작 시 동결한 system 블록(페르소나 + 데이터 스냅샷). 매 턴 그대로 재전송
  snapshot_chars INTEGER NOT NULL DEFAULT 0,
  snapshot_at TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  context_tokens INTEGER NOT NULL DEFAULT 0,            -- 마지막 턴 기준 컨텍스트 크기 (input + cache_read + cache_write + output)
  total_cost_micros INTEGER NOT NULL DEFAULT 0,         -- 누적 추정 비용 (USD × 1e6)
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_message_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_conv_recent ON ai_conversations (last_message_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ai_conv_author ON ai_conversations (created_by, last_message_at DESC) WHERE deleted_at IS NULL;

-- 메시지 — content_json 은 Anthropic 콘텐츠 블록 원본(thinking 서명 포함). 수정하지 않고 그대로 재전송한다.
CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,                                 -- Anthropic messages[] 내 위치 (0부터)
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content_json TEXT NOT NULL,
  display_text TEXT NOT NULL,
  user_name TEXT,
  has_snapshot INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  requested_model TEXT,
  effort TEXT,
  stop_reason TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  cost_micros INTEGER,
  anthropic_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (conversation_id, seq)                         -- 동시 작성 충돌 방지
);

-- 사용량 (chat / company_info / staffing 공통)
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ym TEXT NOT NULL,                                     -- 'YYYY-MM' (KST)
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  requested_model TEXT,
  effort TEXT,
  status TEXT NOT NULL,                                 -- ok | max_tokens | refusal | error | aborted | invalid_output
  error_code TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  web_searches INTEGER NOT NULL DEFAULT 0,
  cost_micros INTEGER NOT NULL DEFAULT 0,               -- 기록 시점 정가 기준
  duration_ms INTEGER,
  user_name TEXT,
  conversation_id TEXT,
  ref TEXT,                                             -- 인력배치: 프로젝트 ID 또는 'legacy'
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_ym ON ai_usage (ym, feature, model);

-- 감사 로그 (설정 변경 / 대화 삭제 / PIN 실패)
CREATE TABLE IF NOT EXISTS ai_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  actor TEXT,
  ip_hash TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_audit_action ON ai_audit (action, created_at);
