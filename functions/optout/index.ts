// Cloudflare Pages Function — /optout ('수신거부' 확인 화면 — 11-15부터 리마인드 메일에는 링크를 넣지 않는다)
// GET 은 확인 화면만 보인다 — 메일 보안 검사기가 링크를 미리 열어도 처리되지 않게, 버튼(POST)을 눌러야 처리한다.
// 처리: 고객 newsletterStatus = 'unsubscribed' (팔로업 러너가 건너뛴다) + 스티비 주소록에서도 수신거부(되면).

import { readOptout, type OptoutEnv } from '../_lib/optout';
import { CUSTOMERS_API, STIBEE_BASE_URL, stibeeHeaders } from '../_lib/stibee';
import { escapeHtml } from '../_lib/remind-mails';

interface Env extends OptoutEnv {
  STIBEE_API_KEY?: string;
  STIBEE_LIST_ID?: string;
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} | 에어터</title>
<style>body{margin:0;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#222;background:#fff}
main{max-width:520px;margin:0 auto;padding:48px 20px;line-height:1.7;word-break:keep-all}h1{font-size:20px;margin:0 0 12px}
p{margin:0 0 14px}button{font:inherit;font-weight:700;padding:12px 20px;border:1px solid #194c9b;background:#194c9b;color:#fff;border-radius:6px;cursor:pointer}
small{color:#666}</style></head><body><main><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    },
  });
}

const BAD = () => page('링크를 확인할 수 없습니다', '<p>주소가 끝까지 들어가지 않았거나 바뀌었습니다. 메일에 회신해 주시면 바로 처리해 드리겠습니다.</p>', 400);

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const q = new URL(request.url).searchParams;
  const c = q.get('c');
  if (c === '0') return page('수신거부 (견본)', '<p>시험 발송 메일의 견본 링크입니다. 실제 메일에서는 이 화면의 버튼을 누르면 수신거부가 처리됩니다.</p>');
  const v = await readOptout(env, c, q.get('e'), q.get('s')).catch(() => null);
  if (!v) return BAD();
  const hidden = ['c', 'e', 's'].map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(q.get(k) || '')}">`).join('');
  return page(
    '에어터 안내 메일 수신거부',
    `<p>${escapeHtml(v.email)} 주소로 보내 드리는 작업 후 안내 메일을 더 받지 않으시려면 아래 버튼을 눌러 주세요.</p>
<form method="post" action="/optout">${hidden}<button type="submit">수신거부하기</button></form>
<p><small>세척 일정이나 서류가 필요하시면 언제든 1644-1295로 연락 주세요.</small></p>`,
  );
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const form = await request.formData().catch(() => null);
  const get = (k: string) => (form ? String(form.get(k) ?? '') : '');
  if (get('c') === '0') return page('수신거부 (견본)', '<p>견본 링크라 처리하지 않았습니다.</p>');
  const v = await readOptout(env, get('c'), get('e'), get('s')).catch(() => null);
  if (!v) return BAD();
  const res = await fetch(CUSTOMERS_API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: v.customerId, newsletterStatus: 'unsubscribed' }),
  }).catch(() => null);
  if (!res || !res.ok) {
    return page('잠시 뒤 다시 눌러 주세요', '<p>처리 중 문제가 생겼습니다. 메일에 회신해 주셔도 바로 처리해 드립니다.</p>', 502);
  }
  // 스티비 주소록도 맞춘다 — 실패해도 우리 쪽 수신거부는 이미 처리됨
  if (env.STIBEE_API_KEY && env.STIBEE_LIST_ID) {
    await fetch(`${STIBEE_BASE_URL}/lists/${encodeURIComponent(env.STIBEE_LIST_ID)}/subscribers/${encodeURIComponent(v.email)}/unsubscribe`, {
      method: 'POST',
      headers: stibeeHeaders(env.STIBEE_API_KEY),
    }).catch(() => null);
  }
  return page('수신거부되었습니다', '<p>앞으로 작업 후 안내 메일을 보내 드리지 않습니다. 필요하실 때는 언제든 1644-1295로 연락 주세요.</p>');
};
