// Cloudflare Pages Function — /api/gemini 프록시
// 프론트엔드 → 같은 도메인(/api/gemini) → Gemini API로 전달 (API 키 보호)

interface Env {
  GEMINI_API_KEY: string;
  ALLOWED_ORIGIN?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  const allowedOrigin = context.env.ALLOWED_ORIGIN || 'https://airtoradmin.pages.dev';

  const body = await context.request.text();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // @ts-ignore
      cf: { colo: 'LAX' },
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
