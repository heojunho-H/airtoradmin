// 스티비(Stibee) API v2 공용 헬퍼 — Cloudflare Pages Functions 전용.
// `_lib` 디렉터리는 언더스코어 접두사라 Pages 라우팅 대상에서 제외된다.
//
// 참고: https://developers.stibee.com/ (OpenAPI 3.1, Base URL https://api.stibee.com/v2)
//   - 인증: 모든 요청에 `AccessToken` 헤더 (워크스페이스 설정 > API 키, 2025-01-21 이후 생성분만 유효)
//   - 구독자 대량 추가: POST /lists/{id}/subscribers/batch — 최대 1,000명/요청, 10회/분
//   - 오류 형식: { code: 'Errors.Data.InvalidRequest', httpStatusCode: 400, message: '...' }
//   - 요금제: 구독자 API는 스탠다드부터 사용 가능 (그룹/이메일 API는 프로 이상 — 여기서는 사용 안 함)

export const STIBEE_BASE_URL = 'https://api.stibee.com/v2';
// 자동 이메일(트리거) API — v1. 자동 이메일의 "API 직접 요청" 트리거 URL: {STIBEE_AUTO_URL}/{autoEmailId}
// 본문 { subscriber: email, ...개인화 키 }. 3회/초, 256KB. 200이어도 발송 보장 아님.
export const STIBEE_AUTO_URL = 'https://stibee.com/api/v1.0/auto';
export const BATCH_MAX = 1000;
// 고객 데이터 원본 (cafe24 PHP). Functions는 /api/customers 프록시가 아니라 원본을 직접 호출한다.
export const CUSTOMERS_API = 'https://airtor.co.kr/api/customers_api.php';

export interface StibeeEnv {
  STIBEE_API_KEY: string;
  STIBEE_LIST_ID: string;
  NEWSLETTER_WEBHOOK_SECRET?: string;
  // 팔로업 자동 발송 — functions/_lib/followups.ts 참조
  NEWSLETTER_FOLLOWUPS?: string; // JSON: {"grace":7,"stages":[{"stage":1,"days":30,"autoEmailId":"..."}]}
  NEWSLETTER_CRON_SECRET?: string; // run-followups 실제 실행 토큰 (GitHub Secrets와 동일)
  ALLOWED_ORIGIN?: string;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface StibeeSubscriberInput {
  email: string;
  status: 'subscribed' | 'unsubscribed';
  marketingAllowed?: boolean;
  fields?: Record<string, string | number>;
}

// POST /lists/{id}/subscribers/batch 응답
export interface StibeeBatchResult {
  createdSubscribers?: string[];
  updatedSubscribers?: string[];
  failAlreadyExists?: string[] | null;
  failNoEmails?: string[] | null;
  failInvalidEmails?: string[] | null;
  failDuplicatedEmails?: string[] | null;
  failInvalidFields?: string[] | null;
  failInvalidSubscriberStatus?: string[] | null;
}

export function jsonResponse(body: unknown, status: number, allowedOrigin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedOrigin,
    },
  });
}

export function stibeeHeaders(apiKey: string): Record<string, string> {
  return {
    AccessToken: apiKey,
    'Content-Type': 'application/json',
  };
}

// 스티비 응답을 그대로 JSON으로 풀되, 본문이 JSON이 아니면 raw 텍스트를 감싼다.
export async function parseStibeeResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// 두 배치 결과를 합산 (1,000명 초과 시 청크별 응답을 하나로)
export function mergeBatchResults(a: StibeeBatchResult, b: StibeeBatchResult): StibeeBatchResult {
  const keys: (keyof StibeeBatchResult)[] = [
    'createdSubscribers',
    'updatedSubscribers',
    'failAlreadyExists',
    'failNoEmails',
    'failInvalidEmails',
    'failDuplicatedEmails',
    'failInvalidFields',
    'failInvalidSubscriberStatus',
  ];
  const merged: StibeeBatchResult = {};
  for (const k of keys) {
    const list = [...(a[k] || []), ...(b[k] || [])];
    if (list.length > 0) merged[k] = list;
  }
  return merged;
}
