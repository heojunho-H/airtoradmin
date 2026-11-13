// 구글 광고 '계약 성공(CRM)' 업로드 피드 — 리드용 향상된 전환 (functions/_lib/ads-feed.ts 참고)
//
//  GET  /api/ads_conversions[?days=63][&format=summary]   (63일이 최대 — functions/_lib/ads-feed.ts MAX_DAYS)
//       Basic 인증(ADS_FEED_USER · ADS_FEED_PASS) — 구글 데이터 관리 도구 HTTPS 연결이 매일 가져간다. CSV.
//  POST /api/ads_conversions  { pin, userName, format: 'csv' | 'summary', days? }
//       관리자 PIN(AI_ADMIN_PIN) — CRM 설정 화면 '구글 광고 계약 업로드' 카드. 수동 백업 파일·요약 숫자.
//
// 응답 CSV 에는 이메일·전화가 SHA-256 해시로만 들어간다. 요약(summary)에는 개인정보가 없다.

import { AiError, checkOrigin, cleanUserName, errorResponse, json, jsonFor, optionsResponse, readJsonCapped, safeEqual, type AiEnv } from '../_lib/ai-http';
import { requireDb, verifyPin } from '../_lib/ai-auth';
import { DEALS_API_URL, MAX_DAYS, PROJECTS_API_URL, buildConversionRows, fetchCrmList, loadWon, toCsv, type FeedDeal, type FeedProject } from '../_lib/ads-feed';

interface Env extends AiEnv {
  /** 구글 데이터 관리 도구 HTTPS 연결용 사용자 이름·비밀번호 (Cloudflare Pages 환경변수, 비밀) */
  ADS_FEED_USER?: string;
  ADS_FEED_PASS?: string;
}

async function build(env: Env, days: number) {
  const db = await requireDb(env);
  let deals: FeedDeal[];
  let projects: FeedProject[];
  try {
    [deals, projects] = await Promise.all([fetchCrmList<FeedDeal>(DEALS_API_URL), fetchCrmList<FeedProject>(PROJECTS_API_URL)]);
  } catch (e) {
    console.error('[ads_conversions] CRM fetch failed', String(e).slice(0, 200));
    throw new AiError(502, 'network', '고객 데이터(CRM)를 읽지 못했습니다. 잠시 후 다시 시도하세요.', { retryable: true });
  }
  const won = await loadWon(db);
  return buildConversionRows(deals, projects, won, new Date(), Number.isFinite(days) ? days : MAX_DAYS);
}

function csvResponse(csv: string, extra: Record<string, string> = {}): Response {
  return new Response(csv, {
    status: 200,
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
  });
}

/** Authorization: Basic — 사용자 이름·비밀번호 모두 상수 시간 비교 */
async function basicAuthorized(request: Request, env: Env): Promise<boolean> {
  if (!env.ADS_FEED_USER || !env.ADS_FEED_PASS) {
    throw new AiError(503, 'not_configured', '업로드 피드 계정(ADS_FEED_USER·ADS_FEED_PASS)이 설정되지 않았습니다.');
  }
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(request.headers.get('Authorization') || '');
  if (!m) return false;
  let decoded: string;
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)));
  } catch {
    return false;
  }
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const [userOk, passOk] = await Promise.all([safeEqual(decoded.slice(0, i), env.ADS_FEED_USER), safeEqual(decoded.slice(i + 1), env.ADS_FEED_PASS)]);
  return userOk && passOk;
}

function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  console.error('[ads_conversions] unexpected', String(err).slice(0, 300));
  return new AiError(500, 'internal', '처리 중 오류가 발생했습니다.', { retryable: true });
}

function kstDate(d: Date = new Date()): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!(await basicAuthorized(request, env))) {
      return new Response('unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="airtor-ads", charset="UTF-8"', 'Cache-Control': 'no-store' },
      });
    }
    const url = new URL(request.url);
    const { rows, summary } = await build(env, Number(url.searchParams.get('days') || MAX_DAYS));
    if (url.searchParams.get('format') === 'summary') return json({ ok: true, summary });
    return csvResponse(toCsv(rows));
  } catch (err) {
    return errorResponse(request, env, toAiError(err));
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const originError = checkOrigin(request, env);
    if (originError) throw originError;
    const body = await readJsonCapped<Record<string, unknown>>(request, 2_000);
    await verifyPin(request, env, body.pin, cleanUserName(body.userName));
    const { rows, summary } = await build(env, Number(body.days || MAX_DAYS));
    if (body.format === 'csv') {
      return csvResponse(toCsv(rows), { 'Content-Disposition': `attachment; filename="airtor-ads-contracts-${kstDate()}.csv"` });
    }
    return jsonFor(request, env, { ok: true, summary });
  } catch (err) {
    return errorResponse(request, env, toAiError(err));
  }
};

export const onRequestOptions: PagesFunction<Env> = async ({ request, env }) => optionsResponse(request, env, 'GET, POST, OPTIONS');
