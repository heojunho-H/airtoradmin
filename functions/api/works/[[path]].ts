// Cloudflare Pages Function — /api/works/* (담당 매니저 네이버웍스 계정 연결)
//   GET /api/works/connect   담당자용 안내 화면 → 네이버웍스 로그인·허용으로 넘긴다 (state 서명 + 쿠키 nonce)
//   GET /api/works/callback  code → 토큰, /users/me 로 실제 메일 확인(@airtor.co.kr 만), D1 에 암호화해 저장
//   GET /api/works/status    연결된 계정 목록 (메일은 가림, 토큰은 내지 않음)
// 리마인드 메일은 연결된 담당자 계정으로만 나간다 — functions/_lib/works.ts, docs/remind-mails.md

import {
  WORKS_DOMAIN,
  authorizeUrl,
  checkState,
  exchangeCode,
  fetchMe,
  listConnections,
  makeState,
  maskEmail,
  saveConnection,
  worksConfigured,
  type WorksEnv,
} from '../../_lib/works';
import { escapeHtml } from '../../_lib/remind-mails';

type Env = WorksEnv;

const COOKIE = 'works_state';

function page(title: string, body: string, status = 200, extra: Record<string, string> = {}): Response {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} | 에어터</title>
<style>body{margin:0;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#222;background:#fff}
main{max-width:560px;margin:0 auto;padding:48px 20px;line-height:1.7;word-break:keep-all}h1{font-size:20px;margin:0 0 12px}
p{margin:0 0 14px}a.btn{display:inline-block;font-weight:700;padding:12px 20px;background:#194c9b;color:#fff;border-radius:6px;text-decoration:none}
small{color:#666}</style></head><body><main><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      ...extra,
    },
  });
}

function cookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=') || null;
  }
  return null;
}

const CLEAR_COOKIE = `${COOKIE}=; Path=/api/works; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

async function connect(env: Env): Promise<Response> {
  if (!worksConfigured(env)) {
    return page('아직 준비 중입니다', '<p>네이버웍스 연동 설정(관리자)이 끝나지 않았습니다. 설정이 끝나면 이 주소를 다시 열어 주세요.</p>', 503);
  }
  const { state, nonce } = await makeState(env.WORKS_CLIENT_SECRET as string);
  const link = authorizeUrl(env, state);
  return page(
    '리마인드 메일 — 내 네이버웍스 메일 연결',
    `<p>세척 고객에게 가는 리마인드 메일(작업 후 45·200·335·395일)을 <b>담당자님 메일 계정으로</b> 보내기 위한 연결입니다.
보낸 메일은 담당자님 보낸메일함에 남고, 고객 회신도 담당자님께 바로 갑니다.</p>
<p><a class="btn" href="${escapeHtml(link)}">네이버웍스로 로그인해 연결하기</a></p>
<p><small>로그인 뒤 나오는 화면에서 '메일'과 '프로필 정보 조회' 권한을 허용해 주세요. 에어터 계정(@${WORKS_DOMAIN})만 연결됩니다.
연결을 끊고 싶으시면 관리자에게 말씀해 주세요.</small></p>`,
    200,
    { 'Set-Cookie': `${COOKIE}=${nonce}; Path=/api/works; Max-Age=900; HttpOnly; Secure; SameSite=Lax` },
  );
}

async function callback(request: Request, env: Env): Promise<Response> {
  if (!worksConfigured(env)) return page('아직 준비 중입니다', '<p>네이버웍스 연동 설정이 끝나지 않았습니다.</p>', 503);
  const q = new URL(request.url).searchParams;
  if (q.get('error')) {
    return page('연결하지 않았습니다', '<p>권한 허용이 취소되었습니다. 다시 하시려면 연결 주소를 처음부터 열어 주세요.</p>', 400, { 'Set-Cookie': CLEAR_COOKIE });
  }
  const code = q.get('code');
  const state = q.get('state') || '';
  if (!code || !(await checkState(env.WORKS_CLIENT_SECRET as string, state, cookieValue(request, COOKIE)))) {
    return page('연결을 마치지 못했습니다', '<p>연결 화면을 연 브라우저에서 15분 안에 다시 시도해 주세요.</p>', 400, { 'Set-Cookie': CLEAR_COOKIE });
  }
  try {
    const tokens = await exchangeCode(env, code);
    if (!(tokens.scope || 'mail').split(/[\s,]+/).includes('mail')) throw new Error('메일 보내기 권한이 허용되지 않았습니다');
    const me = await fetchMe(tokens.access_token);
    if (!me.email.endsWith(`@${WORKS_DOMAIN}`)) {
      return page('에어터 계정만 연결할 수 있습니다', `<p>@${WORKS_DOMAIN} 계정으로 로그인해 주세요.</p>`, 403, { 'Set-Cookie': CLEAR_COOKIE });
    }
    await saveConnection(env, me, tokens);
    return page(
      '연결되었습니다',
      `<p><b>${escapeHtml(me.name || me.email)}</b> (${escapeHtml(me.email)}) 계정이 연결되었습니다. 이제 담당 고객의 리마인드 메일이 이 계정으로 나갑니다.</p><p>창을 닫으셔도 됩니다.</p>`,
      200,
      { 'Set-Cookie': CLEAR_COOKIE },
    );
  } catch (err) {
    // 토큰·코드는 화면·로그에 남기지 않는다
    console.log(`works callback failed: ${err instanceof Error ? err.message.slice(0, 120) : 'error'}`);
    return page('연결을 마치지 못했습니다', '<p>잠시 뒤 연결 주소를 처음부터 다시 열어 주세요. 계속 안 되면 관리자에게 알려 주세요.</p>', 502, { 'Set-Cookie': CLEAR_COOKIE });
  }
}

async function status(env: Env): Promise<Response> {
  const connections = worksConfigured(env) ? await listConnections(env) : [];
  return new Response(
    JSON.stringify({
      ok: true,
      configured: worksConfigured(env),
      connections: connections.map((c) => ({ email: maskEmail(c.email), name: c.name, connectedAt: c.connectedAt, refreshedAt: c.refreshedAt, needsReconnect: Boolean(c.lastError) })),
    }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
  );
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const seg = params.path;
  const path = Array.isArray(seg) ? seg.join('/') : String(seg || '');
  if (path === 'connect') return connect(env);
  if (path === 'callback') return callback(request, env);
  if (path === 'status') return status(env);
  return page('찾을 수 없습니다', '<p>주소를 확인해 주세요.</p>', 404);
};
