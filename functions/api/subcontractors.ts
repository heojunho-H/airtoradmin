// Cloudflare Pages Function — /api/subcontractors 프록시

const TARGET = 'https://airtor.co.kr/api/subcontractors_api.php';

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
