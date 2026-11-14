// Cloudflare Pages Function — /mou (ID 없이 열린 협약서 주소)
// 스티비 필드 mou_url 이 비었을 때의 기본값이 이 주소다 — 회신 안내만 보여 준다 (docs/mou.md)

import { htmlHeaders, renderMouError } from '../_lib/mou';

export const onRequest: PagesFunction = async (context) => {
  const method = context.request.method;
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } });
  }
  return new Response(method === 'HEAD' ? null : renderMouError('missing'), { status: 404, headers: htmlHeaders() });
};
