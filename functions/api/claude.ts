// Cloudflare Pages Function — /api/claude 프록시
// 프론트엔드 → 같은 도메인(/api/claude) → Anthropic Messages API로 전달 (API 키 보호).
//
// 모델 선택: 요청 본문에 `_model` 필드가 있고 ALLOWED_MODELS에 포함되면 그 모델을
// 사용한다. allowlist 외 값은 무시하고 DEFAULT_MODEL로 폴백 (모델 ID 조작 차단).
// `_model`은 Anthropic으로 전달하기 전 본문에서 제거되고, 대신 `model` 필드로 주입된다.
//
// 분리 사유 (gemini.ts와 별도 파일):
//   - 엔드포인트/인증 헤더/요청·응답 스키마가 Google과 전부 다름
//   - staffing(suggestProjectStaffing)을 Claude로 이관하면서 신설 (Phase 1.8)

interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN?: string;
}

const ALLOWED_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-7',
  'claude-haiku-4-5-20251001',
];
const DEFAULT_MODEL = 'claude-sonnet-4-6';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const allowedOrigin = context.env.ALLOWED_ORIGIN || 'https://airtoradmin.pages.dev';
  const rawBody = await context.request.text();

  // _model을 model 필드로 치환. allowlist에 없으면 DEFAULT_MODEL로 강제.
  let model = DEFAULT_MODEL;
  let forwardBody = rawBody;
  try {
    const parsed = JSON.parse(rawBody);
    if (typeof parsed._model === 'string' && ALLOWED_MODELS.includes(parsed._model)) {
      model = parsed._model;
    }
    delete parsed._model;
    parsed.model = model;
    forwardBody = JSON.stringify(parsed);
  } catch {
    // body가 JSON 아니면 그대로 전달 (Anthropic이 400으로 응답)
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: forwardBody,
  });

  const data = await response.text();

  return new Response(data, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedOrigin,
    },
  });
};

export const onRequestOptions: PagesFunction<Env> = async (context) => {
  const allowedOrigin = context.env.ALLOWED_ORIGIN || 'https://airtoradmin.pages.dev';
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
