// Cloudflare Pages Function — /api/projects 프록시
// 프론트엔드 → 같은 도메인(/api/projects) → Cafe24 서버로 전달 (CORS 우회)

// v2: 딜과 겹치는 항목은 딜·고객 작업이력이 정한다 (docs/data-sync.md). 되돌리려면 projects_api.php 로.
const TARGET = 'https://airtor.co.kr/api/projects_api_v2.php';

async function proxyRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const targetUrl = TARGET + url.search;

  const response = await fetch(targetUrl, {
    method: request.method,
    headers: { 'Content-Type': 'application/json' },
    body: request.method !== 'GET' ? await request.text() : undefined,
  });

  const data = await response.text();

  return new Response(data, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export const onRequestGet: PagesFunction = async (context) => proxyRequest(context.request);
export const onRequestPost: PagesFunction = async (context) => proxyRequest(context.request);
export const onRequestPut: PagesFunction = async (context) => proxyRequest(context.request);
export const onRequestDelete: PagesFunction = async (context) => proxyRequest(context.request);

// OPTIONS preflight 처리
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
