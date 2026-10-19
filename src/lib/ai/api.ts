// AI(Claude) API 클라이언트 — /api/assistant (Cloudflare Function: functions/api/assistant.ts).
//
// 에러 처리: 서버의 { code, message } 를 우선 쓰고, HTML 응답은 Cloudflare WAF 차단(403)이나
// 호스팅/게이트웨이 문제로 보고 한국어 메시지로 바꾼다 (newsletter.ts postNewsletter 와 같은 방식).

import { createSseParser } from './sse';
import type {
  AiConfig,
  AiSettings,
  AiStatus,
  ConversationDetail,
  ConversationSummary,
  PersonaId,
  ServerMessage,
  UsageReport,
} from './types';

// 경로가 WAF 에 막히면 이 상수만 바꾼다 (functions/api 파일명과 함께).
export const AI_ENDPOINT = '/api/assistant';

export class AiRequestError extends Error {
  code: string;
  status?: number;
  retryable: boolean;
  retryAfterSec?: number;

  constructor(code: string, message: string, opts: { status?: number; retryable?: boolean; retryAfterSec?: number } = {}) {
    super(message);
    this.code = code;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
    this.retryAfterSec = opts.retryAfterSec;
  }
}

async function errorFromResponse(res: Response): Promise<AiRequestError> {
  const text = await res.text().catch(() => '');
  let body: { code?: string; message?: string; retryable?: boolean; retryAfterSec?: number } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (body && typeof body.message === 'string') {
    return new AiRequestError(body.code || 'error', body.message, {
      status: res.status,
      retryable: !!body.retryable,
      retryAfterSec: body.retryAfterSec,
    });
  }
  const isHtml = /<html|<!doctype/i.test(text);
  if (res.status === 403 && isHtml) {
    return new AiRequestError('waf_blocked', '보안 필터(Cloudflare)가 요청을 차단했습니다. 관리자에게 문의하세요.', { status: 403 });
  }
  if (res.status === 429) return new AiRequestError('rate_limited', '요청이 많아 잠시 제한되었습니다. 잠시 후 다시 시도하세요.', { status: 429, retryable: true });
  if (res.status === 503 || res.status === 529) return new AiRequestError('overloaded', 'AI 서버가 혼잡합니다. 잠시 후 다시 시도하세요.', { status: res.status, retryable: true });
  if (res.status === 504 || res.status === 524) return new AiRequestError('timeout', 'AI 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도하세요.', { status: res.status, retryable: true });
  if (isHtml) return new AiRequestError('bad_gateway', `서버 응답이 올바르지 않습니다 (${res.status}).`, { status: res.status, retryable: true });
  return new AiRequestError('http_error', `AI 요청 실패 (${res.status})`, { status: res.status, retryable: res.status >= 500 });
}

export function toAiRequestError(err: unknown): AiRequestError {
  if (err instanceof AiRequestError) return err;
  if (err instanceof DOMException && err.name === 'AbortError') return new AiRequestError('aborted', '요청을 중지했습니다.');
  if (err instanceof TypeError) return new AiRequestError('network', '네트워크 연결을 확인한 뒤 다시 시도하세요.', { retryable: true });
  return new AiRequestError('unknown', '알 수 없는 오류가 발생했습니다.', { retryable: true });
}

export async function getJson<T>(params: Record<string, string | number | null | undefined>, endpoint: string = AI_ENDPOINT): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') qs.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(`${endpoint}?${qs}`, { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw toAiRequestError(err);
  }
  if (!res.ok) throw await errorFromResponse(res);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw await errorFromResponse(res);
  return (await res.json()) as T;
}

export async function postJson<T>(body: Record<string, unknown>, opts: { endpoint?: string; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(opts.endpoint ?? AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    throw toAiRequestError(err);
  }
  if (!res.ok) throw await errorFromResponse(res);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw await errorFromResponse(res);
  return (await res.json()) as T;
}

// ─── 조회 ───────────────────────────────────────────────────────────────

export function getConfig(): Promise<AiConfig & { ok: true }> {
  return getJson({ action: 'config' });
}

export function getStatus(): Promise<AiStatus & { ok: true }> {
  return getJson({ action: 'status' });
}

export function listConversations(q: {
  limit?: number;
  cursor?: string | null;
  persona?: PersonaId | null;
  author?: string | null;
  q?: string | null;
}): Promise<{ items: ConversationSummary[]; nextCursor: string | null }> {
  return getJson({ action: 'conversations', limit: q.limit ?? 30, cursor: q.cursor, persona: q.persona, author: q.author, q: q.q });
}

export function getConversation(id: string): Promise<{ conversation: ConversationDetail; messages: ServerMessage[] }> {
  return getJson({ action: 'conversation', id });
}

export function getUsage(month: string): Promise<UsageReport> {
  return getJson({ action: 'usage', month });
}

// ─── 변경 ───────────────────────────────────────────────────────────────

export function renameConversation(id: string, title: string, userName: string, pin?: string): Promise<{ title: string }> {
  return postJson({ action: 'rename-conversation', id, title, userName, pin });
}

export function deleteConversation(id: string, userName: string, pin?: string): Promise<{ ok: true }> {
  return postJson({ action: 'delete-conversation', id, userName, pin });
}

export function verifyPin(pin: string, userName: string): Promise<{ ok: true }> {
  return postJson({ action: 'verify-pin', pin, userName });
}

export function saveSettings(pin: string, userName: string, settings: Partial<AiSettings>): Promise<{ settings: AiSettings }> {
  return postJson({ action: 'save-settings', pin, userName, settings });
}

// ─── SSE 스트림 ─────────────────────────────────────────────────────────

export type StreamHandler = (event: string, data: any) => void;

/**
 * POST → text/event-stream 을 읽어 이벤트마다 onEvent 를 호출한다.
 * 서버는 15초마다 ping 을 보내므로 idleMs 동안 아무 바이트도 없으면 끊긴 것으로 본다.
 * done/error 중 하나가 정확히 한 번 와야 하며, 없이 끝나면 stream_incomplete 로 던진다.
 */
export function streamSse(
  body: Record<string, unknown>,
  onEvent: StreamHandler,
  signal: AbortSignal,
  opts: { idleMs?: number } = {},
): Promise<void> {
  return streamSseFetch(
    AI_ENDPOINT,
    { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(body) },
    onEvent,
    signal,
    opts,
  );
}

/** SSE 응답을 받는 요청 (JSON 이 아닌 본문 — 예: 파일 업로드 multipart — 도 보낼 수 있다) */
export async function streamSseFetch(
  url: string,
  init: { method: 'POST'; headers?: Record<string, string>; body: BodyInit },
  onEvent: StreamHandler,
  signal: AbortSignal,
  opts: { idleMs?: number } = {},
): Promise<void> {
  const idleMs = opts.idleMs ?? 75_000;
  const inner = new AbortController();
  const onOuterAbort = () => inner.abort();
  signal.addEventListener('abort', onOuterAbort);
  let stalled = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      stalled = true;
      inner.abort();
    }, idleMs);
  };

  let terminal = false;
  try {
    resetIdle();
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: { Accept: 'text/event-stream', ...(init.headers ?? {}) }, signal: inner.signal });
    } catch (err) {
      throw toAiRequestError(err);
    }
    if (!res.ok || !(res.headers.get('content-type') || '').includes('text/event-stream') || !res.body) {
      throw await errorFromResponse(res);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parser = createSseParser(({ event, data }) => {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
      if (event === 'done' || event === 'error') terminal = true;
      onEvent(event, parsed);
    });
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        throw toAiRequestError(err);
      }
      if (chunk.done) break;
      resetIdle();
      // 한글이 청크 경계에서 잘려도 깨지지 않도록 stream:true
      parser.push(decoder.decode(chunk.value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.flush();
    if (!terminal) {
      throw new AiRequestError('stream_incomplete', '응답 도중 연결이 끊겼습니다. 다시 시도해 주세요.', { retryable: true });
    }
  } catch (err) {
    const e = toAiRequestError(err);
    if (e.code === 'aborted' && stalled && !signal.aborted) {
      throw new AiRequestError('stream_stalled', 'AI 응답이 오래 멈춰 연결을 끊었습니다. 다시 시도해 주세요.', { retryable: true });
    }
    throw e;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    signal.removeEventListener('abort', onOuterAbort);
  }
}

export interface ChatRequest {
  conversationId?: string | null;
  expectedCount?: number;
  persona?: PersonaId;
  message: string;
  snapshot?: string;
  /** undefined = 유지, null = 관리자 기본값으로, 문자열 = 이 모델로 */
  model?: string | null;
  userName: string;
}

export function streamChat(req: ChatRequest, onEvent: StreamHandler, signal: AbortSignal): Promise<void> {
  return streamSse({ action: 'chat', ...req }, onEvent, signal);
}

export function streamCompanyInfo(company: string, userName: string, onEvent: StreamHandler, signal: AbortSignal): Promise<void> {
  return streamSse({ action: 'company-info', company, userName }, onEvent, signal, { idleMs: 90_000 });
}
