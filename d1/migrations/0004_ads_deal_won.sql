-- 구글 광고 '계약 성공(CRM)' 업로드용 계약 시각 기록. 바인딩 이름 AI_DB
-- /api/deals 프록시가 PHP 응답의 transition:'won' 을 보고 처음 계약된 시각만 남긴다(INSERT OR IGNORE).
-- 코드(functions/_lib/ads-feed.ts)가 처음 쓸 때 같은 문장으로 표를 만들므로 따로 실행하지 않아도 된다.
-- 수동 적용: Cloudflare 대시보드 > D1 > (airtoradmin-ai / airtoradmin-ai-preview) > Console 에 한 줄로,
--   또는 npx wrangler d1 execute airtoradmin-ai --remote --file=d1/migrations/0004_ads_deal_won.sql
-- IF NOT EXISTS 라 여러 번 실행해도 안전하다. 되돌리기: DROP TABLE ads_deal_won;
CREATE TABLE IF NOT EXISTS ads_deal_won (deal_id INTEGER PRIMARY KEY, won_at TEXT NOT NULL);
