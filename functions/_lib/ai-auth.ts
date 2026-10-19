// 공통 권한 확인 — D1 준비 상태, 관리자 PIN, "본인 또는 PIN". (/api/assistant · /api/files 가 함께 쓴다)
// 앱에 로그인 토큰이 없어 작성자 이름은 자기 신고 값이다 — 실수 방지용이지 보안 경계는 아니다.

import { AiError, ipHash, nowIso, safeEqual, type AiEnv } from './ai-http';
import { audit, dbState, recordPinAttempt } from './ai-store';

// IP 당 15분에 10번까지 PIN 을 확인한다 (성공 포함 — 동시 요청으로 대량 추측하는 것을 막기 위해 시도 자체를 센다)
export const PIN_MAX_ATTEMPTS = 10;
export const PIN_WINDOW_MS = 15 * 60 * 1000;

export async function requireDb(env: AiEnv): Promise<D1Database> {
  const state = await dbState(env.AI_DB);
  if (state === 'unbound' || !env.AI_DB) throw new AiError(503, 'not_configured', 'AI 저장소(D1)가 연결되지 않았습니다(관리자 확인 필요).');
  if (state === 'no_tables') throw new AiError(503, 'db_not_initialized', 'AI 저장소 테이블이 아직 만들어지지 않았습니다(관리자 확인 필요).');
  return env.AI_DB;
}

/**
 * PIN 확인 — 미설정이면 503. 시도 횟수 제한(D1)을 쓸 수 없으면 확인 자체를 거부한다(무제한 추측 방지).
 * IP 당 15분 10회를 넘으면 429. 실패는 감사 로그에 남긴다.
 */
export async function verifyPin(request: Request, env: AiEnv, pin: unknown, actor: string): Promise<void> {
  if (!env.AI_ADMIN_PIN) {
    throw new AiError(503, 'pin_not_configured', '관리자 PIN이 설정되지 않아 변경할 수 없습니다(Cloudflare 환경변수 AI_ADMIN_PIN).');
  }
  const db = await requireDb(env);
  const hash = await ipHash(request);
  const now = nowIso();
  const attempts = await recordPinAttempt(db, hash, actor, now, new Date(Date.now() - PIN_WINDOW_MS).toISOString());
  if (attempts > PIN_MAX_ATTEMPTS) {
    throw new AiError(429, 'pin_locked', 'PIN 확인 시도가 너무 많아 잠시 잠겼습니다. 15분 후 다시 시도하세요.');
  }
  if (typeof pin !== 'string' || !pin || !(await safeEqual(pin, env.AI_ADMIN_PIN))) {
    await audit(db, 'pin_fail', actor, null, hash, now).catch(() => {});
    throw new AiError(401, 'bad_pin', 'PIN이 올바르지 않습니다.');
  }
}

/** 만든 사람이면 통과, 아니면 PIN 이 있어야 한다 */
export async function ownerOrPin(
  request: Request,
  env: AiEnv,
  body: Record<string, unknown>,
  createdBy: string,
  actor: string,
  notOwnerMessage = '본인이 만든 대화만 바꿀 수 있습니다.',
): Promise<void> {
  if (createdBy === actor && actor !== '익명') return;
  if (typeof body.pin === 'string' && body.pin) {
    await verifyPin(request, env, body.pin, actor);
    return;
  }
  throw new AiError(403, 'not_owner', notOwnerMessage);
}
