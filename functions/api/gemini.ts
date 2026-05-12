// Cloudflare Pages Function — /api/gemini 프록시
// 프론트엔드 → 같은 도메인(/api/gemini) → Gemini API로 전달 (API 키 보호).
//
// 모델 선택: 요청 본문에 `_model` 필드가 있고 ALLOWED_MODELS에 포함되면 그 모델을
// 사용한다. allowlist 외 값은 무시하고 DEFAULT_MODEL로 폴백 (모델 ID 조작 차단).
// `_model`은 Google로 전달하기 전 본문에서 제거된다.

interface Env {
  GEMINI_API_KEY: string;
  ALLOWED_ORIGIN?: string;
}

const ALLOWED_MODELS = [
  'gemini-3.1-pro-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
];
const DEFAULT_MODEL = 'gemini-3.1-pro-preview';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const allowedOrigin = context.env.ALLOWED_ORIGIN || 'https://airtoradmin.pages.dev';
  const rawBody = await context.request.text();

  // _model 추출 및 본문에서 제거 (Google API는 _model을 모름)
  let model = DEFAULT_MODEL;
  let forwardBody = rawBody;
  try {
    const parsed = JSON.parse(rawBody);
    if (typeof parsed._model === 'string' && ALLOWED_MODELS.includes(parsed._model)) {
      model = parsed._model;
    }
    if ('_model' in parsed) {
      delete parsed._model;
      forwardBody = JSON.stringify(parsed);
    }
  } catch {
    // 본문이 JSON이 아니면 그대로 전달 (Google이 에러로 응답할 것)
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: forwardBody,
    }
  );

  const data = await response.text();

  return new Response(data, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedOrigin,
    },
  });
};

// OPTIONS preflight 처리
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
