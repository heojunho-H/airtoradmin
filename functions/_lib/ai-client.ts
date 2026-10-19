// Anthropic SDK 클라이언트 팩토리 + 에러/사용량/응답 블록 헬퍼.
// 공식 SDK(@anthropic-ai/sdk)만 사용한다 — Cloudflare Workers 런타임 공식 지원.

import Anthropic from '@anthropic-ai/sdk';
import { AiError, type AiEnv } from './ai-http';
import type { NormalizedUsage } from './ai-models';

type BetaContentBlock = Anthropic.Beta.BetaContentBlock;

export function createClient(env: AiEnv, opts: { timeoutMs?: number; maxRetries?: number } = {}): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AiError(503, 'not_configured', 'AI API 키가 설정되지 않았습니다(관리자 확인 필요).');
  }
  return new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    timeout: opts.timeoutMs ?? 10 * 60 * 1000,
    maxRetries: opts.maxRetries ?? 1,
  });
}

function retryAfter(headers: Headers | undefined): number | undefined {
  const v = Number(headers?.get('retry-after'));
  return Number.isFinite(v) && v > 0 ? Math.ceil(v) : undefined;
}

/**
 * SDK 예외 → 사용자에게 보여줄 한국어 AiError.
 * 구체적인 클래스부터 검사한다 (APIUserAbortError·APIConnectionError 는 APIError 의 하위 클래스).
 * 400 의 세부 원인(프롬프트 초과·지출 한도·웹 검색 비활성)은 별도 코드가 없어 메시지로만 구분된다.
 */
export function mapError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.APIUserAbortError) {
    return new AiError(499, 'aborted', '요청이 취소되었습니다.');
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiError(504, 'timeout', 'AI 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도하세요.', { retryable: true });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiError(502, 'network', 'AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.', { retryable: true });
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return new AiError(502, 'auth', 'AI API 키 오류입니다(관리자 확인 필요).');
  }
  if (err instanceof Anthropic.PermissionDeniedError || err instanceof Anthropic.NotFoundError) {
    return new AiError(502, 'model_unavailable', '선택한 모델을 사용할 수 없습니다. 설정에서 다른 모델을 선택하세요.');
  }
  if (err instanceof Anthropic.RateLimitError) {
    const body = err.error as { error?: { details?: { error_code?: string } } } | undefined;
    if (body?.error?.details?.error_code === 'enforced_spend_limit_reached') {
      return new AiError(429, 'spend_limit', '이번 달 AI 사용 한도에 도달했습니다(관리자 확인 필요).');
    }
    return new AiError(429, 'rate_limited', '요청이 많아 잠시 제한되었습니다. 잠시 후 다시 시도하세요.', {
      retryable: true,
      retryAfterSec: retryAfter(err.headers),
    });
  }
  if (err instanceof Anthropic.BadRequestError) {
    const msg = err.message || '';
    if (/prompt is too long|context window/i.test(msg)) {
      return new AiError(413, 'context_too_long', '대화가 너무 길어졌습니다. 새 대화를 시작하세요.');
    }
    if (/specified .*limit|spend limit|usage limit/i.test(msg)) {
      return new AiError(429, 'spend_limit', '이번 달 AI 사용 한도에 도달했습니다(관리자 확인 필요).');
    }
    if (/web.?search/i.test(msg) && /disabled|not enabled|not available/i.test(msg)) {
      return new AiError(502, 'web_search_disabled', '웹 검색이 비활성화되어 있습니다(Anthropic Console 확인 필요).');
    }
    if (/retention/i.test(msg)) {
      return new AiError(502, 'model_unavailable', '이 조직 설정으로는 선택한 모델을 쓸 수 없습니다. 다른 모델을 선택하세요.');
    }
    return new AiError(400, 'bad_request', 'AI 요청이 거부되었습니다.', { detail: msg.slice(0, 300) });
  }
  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === 'number' ? err.status : 500;
    if (status === 529 || err.type === 'overloaded_error' || status >= 500) {
      return new AiError(503, 'overloaded', 'AI 서버가 혼잡합니다. 잠시 후 다시 시도하세요.', { retryable: true });
    }
    return new AiError(502, 'internal', 'AI 처리 중 오류가 발생했습니다.', { detail: (err.message || '').slice(0, 300) });
  }
  return new AiError(500, 'internal', 'AI 처리 중 알 수 없는 오류가 발생했습니다.', { retryable: true });
}

export function normalizeUsage(u: Anthropic.Beta.BetaUsage | null | undefined): NormalizedUsage {
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
    webSearches: u?.server_tool_use?.web_search_requests ?? 0,
  };
}

/** 응답의 모든 text 블록을 이어 붙인 화면 표시용 텍스트 */
export function visibleText(content: BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** 웹 검색 응답에서 마지막 도구 블록 뒤의 text 만 — "검색해 보겠습니다" 같은 서두 제외 */
export function finalAnswerText(content: BetaContentBlock[]): string {
  let lastTool = -1;
  content.forEach((b, i) => {
    if (b.type === 'server_tool_use' || b.type === 'web_search_tool_result' || b.type === 'tool_use') lastTool = i;
  });
  const tail = visibleText(content.slice(lastTool + 1));
  return tail.trim() ? tail : visibleText(content);
}

export function hasFallbackBlock(contents: unknown[]): boolean {
  return contents.some((c) => Array.isArray(c) && c.some((b) => b && typeof b === 'object' && (b as { type?: string }).type === 'fallback'));
}

export interface Source {
  url: string;
  title: string;
}

/** 출처: 본문 인용(web_search_result_location) 우선, 다음으로 검색 결과 목록. http(s)만, 중복 제거. */
export function collectSources(contents: BetaContentBlock[][], limit = 10): Source[] {
  const out: Source[] = [];
  const seen = new Set<string>();
  const push = (url: string | undefined, title: string | null | undefined) => {
    if (!url || seen.has(url) || !/^https?:\/\//i.test(url) || out.length >= limit) return;
    seen.add(url);
    out.push({ url, title: (title || url).slice(0, 200) });
  };
  for (const content of contents) {
    for (const b of content) {
      if (b.type !== 'text' || !b.citations) continue;
      for (const c of b.citations) {
        if (c.type === 'web_search_result_location') push(c.url, c.title);
      }
    }
  }
  for (const content of contents) {
    for (const b of content) {
      // 검색 오류 시 content 는 배열이 아니라 오류 객체 — 건너뛴다
      if (b.type !== 'web_search_tool_result' || !Array.isArray(b.content)) continue;
      for (const r of b.content) push(r.url, r.title);
    }
  }
  return out;
}
