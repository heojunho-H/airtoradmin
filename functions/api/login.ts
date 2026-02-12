// Cloudflare Pages Function — /api/login 프록시
// 프론트엔드 → 같은 도메인(/api/login) → Cafe24 서버로 전달 (CORS 우회)

export const onRequestPost: PagesFunction = async (context) => {
  const body = await context.request.text();

  const response = await fetch('https://airtor.co.kr/api/login_api.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });

  const data = await response.text();

  return new Response(data, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
};

// OPTIONS preflight 처리
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
