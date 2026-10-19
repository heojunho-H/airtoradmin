// AI 엔드포인트 공용 HTTP 헬퍼 — Env 타입, Origin 검사, JSON/에러 응답, SSE 채널.
// 플랫폼 중립(Request/Response/TransformStream)으로 작성해 다른 런타임으로 옮기기 쉽게 둔다.

export interface AiEnv {
  ANTHROPIC_API_KEY?: string;
  AI_DB?: D1Database;
  /** 설정 변경용 관리자 PIN (8자 이상 권장). 미설정이면 설정은 읽기 전용. */
  AI_ADMIN_PIN?: string;
  /** 쉼표 구분 추가 허용 Origin */
  AI_ALLOWED_ORIGINS?: string;
}

export type AiErrorCode =
  | 'bad_request'
  | 'too_large'
  | 'origin'
  | 'not_found'
  | 'conflict'
  | 'context_too_long'
  | 'model_not_allowed'
  | 'feature_disabled'
  | 'not_configured'
  | 'db_not_initialized'
  | 'bad_pin'
  | 'pin_locked'
  | 'pin_not_configured'
  | 'not_owner'
  | 'auth'
  | 'model_unavailable'
  | 'rate_limited'
  | 'spend_limit'
  | 'overloaded'
  | 'timeout'
  | 'network'
  | 'refusal'
  | 'max_tokens'
  | 'invalid_output'
  | 'web_search_disabled'
  | 'persist_failed'
  | 'aborted'
  | 'internal';

// message 는 사용자에게 그대로 보여줘도 되는 한국어 문장이어야 한다.
export class AiError extends Error {
  status: number;
  code: AiErrorCode;
  retryable: boolean;
  retryAfterSec?: number;
  detail?: string;

  constructor(
    status: number,
    code: AiErrorCode,
    message: string,
    opts: { retryable?: boolean; retryAfterSec?: number; detail?: string } = {},
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.retryAfterSec = opts.retryAfterSec;
    this.detail = opts.detail;
  }

  toJSON() {
    return {
      ok: false,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.retryAfterSec ? { retryAfterSec: this.retryAfterSec } : {}),
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }
}

const DEFAULT_ORIGINS = [
  'https://airtoradmin.co.kr',
  'https://www.airtoradmin.co.kr',
  'https://airtoradmin.pages.dev',
];

export function isAllowedOrigin(origin: string, env: AiEnv): boolean {
  const extra = (env.AI_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (DEFAULT_ORIGINS.includes(origin) || extra.includes(origin)) return true;
  try {
    const u = new URL(origin);
    // 브랜치 프리뷰 배포 (<branch>.airtoradmin.pages.dev)
    if (u.protocol === 'https:' && u.hostname.endsWith('.airtoradmin.pages.dev')) return true;
    // Vite dev 프록시는 Origin 헤더를 바꾸지 않는다
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
  } catch {
    return false;
  }
  return false;
}

/**
 * POST 는 허용된 Origin 필수. 같은 출처 fetch GET 은 Origin 헤더가 없을 수 있어 허용한다.
 * 인증이 아니라 과속 방지턱 — curl 은 Origin 을 위조할 수 있다.
 */
export function checkOrigin(request: Request, env: AiEnv): AiError | null {
  const origin = request.headers.get('Origin');
  if (request.method === 'GET' || request.method === 'HEAD') {
    if (!origin || isAllowedOrigin(origin, env)) return null;
  } else if (origin && isAllowedOrigin(origin, env)) {
    return null;
  }
  return new AiError(403, 'origin', '허용되지 않은 출처의 요청입니다.');
}

function corsHeaders(request: Request, env: AiEnv): Record<string, string> {
  const origin = request.headers.get('Origin');
  return origin && isAllowedOrigin(origin, env) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

export function jsonFor(request: Request, env: AiEnv, body: unknown, status = 200): Response {
  return json(body, status, corsHeaders(request, env));
}

export function errorResponse(request: Request, env: AiEnv, e: AiError): Response {
  return json(e.toJSON(), e.status, corsHeaders(request, env));
}

export function optionsResponse(request: Request, env: AiEnv, methods: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, env),
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/** 본문을 문자 수 상한 안에서 JSON 으로 읽는다. 초과 413, 파싱 실패 400. */
export async function readJsonCapped<T = Record<string, unknown>>(request: Request, maxChars: number): Promise<T> {
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > maxChars * 3) throw new AiError(413, 'too_large', '요청이 너무 큽니다.');
  const text = await request.text();
  if (text.length > maxChars) throw new AiError(413, 'too_large', '요청이 너무 큽니다.');
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    return parsed as T;
  } catch {
    throw new AiError(400, 'bad_request', '요청 형식이 올바르지 않습니다.');
  }
}

// ─── SSE ────────────────────────────────────────────────────────────────
// 이벤트: meta / status / text / done / error, 그리고 15초마다 `: ping` 주석 줄.
// 텍스트 델타는 50ms 단위로 묶어 보낸다 (무료 플랜 CPU 절약 + 브라우저 렌더 부담 감소).
// thinking 중에는 수십 초간 바이트가 없을 수 있어 ping 으로 연결을 유지하고 이탈을 감지한다.

export interface SseChannel {
  response: Response;
  send(event: string, data: unknown): void;
  text(delta: string): void;
  flush(): void;
  close(): Promise<void>;
  /** 실제로 한 번 써 보고 클라이언트가 아직 연결돼 있는지 확인한다 (저장 직전 확인용) */
  probe(): Promise<boolean>;
  /** 클라이언트가 떠났거나 이미 닫힘 */
  readonly closed: boolean;
}

export function openSse(
  request: Request,
  env: AiEnv,
  opts: { heartbeatMs?: number; coalesceMs?: number } = {},
): SseChannel {
  const heartbeatMs = opts.heartbeatMs ?? 15_000;
  const coalesceMs = opts.coalesceMs ?? 50;
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let closed = false;
  let buffer = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  const write = (chunk: string) => {
    if (closed) return;
    writer.write(encoder.encode(chunk)).catch(() => {
      closed = true;
    });
  };

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (buffer) {
      const delta = buffer;
      buffer = '';
      write(`event: text\ndata: ${JSON.stringify({ delta })}\n\n`);
    }
  };

  const heartbeat = setInterval(() => write(': ping\n\n'), heartbeatMs);

  return {
    response: new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        ...corsHeaders(request, env),
      },
    }),
    send(event, data) {
      flush();
      write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    text(delta) {
      if (!delta) return;
      buffer += delta;
      if (!timer) timer = setTimeout(flush, coalesceMs);
    },
    flush,
    async probe() {
      if (closed) return false;
      try {
        await writer.write(encoder.encode(': ping\n\n'));
      } catch {
        closed = true;
      }
      return !closed;
    },
    async close() {
      flush();
      clearInterval(heartbeat);
      if (closed) return;
      closed = true;
      try {
        await writer.close();
      } catch {
        // 클라이언트가 먼저 끊은 경우
      }
    },
    get closed() {
      return closed;
    },
  };
}

// ─── 시간/식별 ──────────────────────────────────────────────────────────

export function nowIso(): string {
  return new Date().toISOString();
}

/** 'YYYY-MM' (KST) */
export function kstMonth(d: Date = new Date()): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 7);
}

export function isMonth(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
}

/** IP 원문은 저장하지 않는다 — 해시 앞 16자만 PIN 실패 횟수 집계에 쓴다. */
export async function ipHash(request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const digest = new Uint8Array(await sha256(`airtor-ai:${ip}`));
  return Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 길이와 무관하게 상수 시간 비교 (SHA-256 다이제스트끼리 비교) */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

/** 사용자 표시 이름 — localStorage 자기신고 값이라 신원 증명은 아니다. */
export function cleanUserName(v: unknown): string {
  if (typeof v !== 'string') return '익명';
  const s = v.trim().slice(0, 50);
  return s || '익명';
}
