// Cloudflare Pages Function — /mou/<id> (단가보장 협약서 화면), /mou/<id>.pdf (PDF), /mou/sample (공개 견본)
// 고객이 B1 메일의 '단가보장 협약서 보기'를 눌러 여는 공개 주소다. 로그인이 없고, 추측할 수 없는 ID 가 곧 열쇠다.
// 내용은 발송 때 D1 mou_links 에 얼려 둔 스냅숏이다 — functions/_lib/mou.ts, docs/mou.md

import { todayKst } from '../_lib/followups';
import {
  SAMPLE_DOC,
  getMou,
  htmlHeaders,
  isMouId,
  loadSealUri,
  newNonce,
  parseMouDoc,
  pdfHeaders,
  pdfR2Key,
  renderMouError,
  renderMouHtml,
  renderPdf,
  setMouPdfKey,
  type MouDoc,
  type MouEnv,
  type MouErrorKind,
} from '../_lib/mou';

type Env = MouEnv;

function errorPage(kind: MouErrorKind, head: boolean): Response {
  const status = kind === 'expired' ? 410 : 404;
  return new Response(head ? null : renderMouError(kind), { status, headers: htmlHeaders() });
}

interface Target {
  id: string;
  doc: MouDoc;
  sample: boolean;
  expiresOn?: string;
  pdfKey?: string | null;
}

async function serveHtml(env: Env, t: Target, url: URL, head: boolean): Promise<Response> {
  const nonce = newNonce();
  if (head) return new Response(null, { status: 200, headers: htmlHeaders(nonce) });
  const sealUri = t.sample ? null : await loadSealUri(env);
  const html = renderMouHtml(t.doc, {
    mode: 'screen', id: t.id, sample: t.sample, sealUri, nonce, pdfFailed: url.searchParams.get('pdf') === 'fail', expiresOn: t.expiresOn,
  });
  return new Response(html, { status: 200, headers: htmlHeaders(nonce) });
}

async function servePdf(env: Env, t: Target, head: boolean): Promise<Response> {
  if (head) return new Response(null, { status: 200, headers: pdfHeaders(t.doc) });
  const key = pdfR2Key(t.id);
  // 견본은 서식을 고치는 동안 늘 새로 만든다. 실제 협약서는 처음 한 번 만들어 R2 에 둔다.
  if (!t.sample && env.FILES) {
    const cached = await env.FILES.get(t.pdfKey || key);
    if (cached) return new Response(cached.body, { status: 200, headers: pdfHeaders(t.doc, cached.size) });
  }
  try {
    const sealUri = t.sample ? null : await loadSealUri(env);
    const pdf = await renderPdf(env, renderMouHtml(t.doc, { mode: 'pdf', id: t.id, sample: t.sample, sealUri }));
    if (!t.sample && env.FILES) {
      await env.FILES.put(key, pdf, { httpMetadata: { contentType: 'application/pdf' } });
      if (env.AI_DB) await setMouPdfKey(env.AI_DB, t.id, key);
    }
    return new Response(pdf, { status: 200, headers: pdfHeaders(t.doc, pdf.byteLength) });
  } catch (err) {
    // 고객 정보는 남기지 않는다 — ID 앞 4자와 원인만
    console.log(`mou pdf failed ${t.id.slice(0, 4)}: ${err instanceof Error ? err.message : String(err)}`);
    return new Response(null, { status: 303, headers: { Location: `/mou/${t.id}?pdf=fail`, 'Cache-Control': 'no-store' } });
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } });
  }
  const head = method === 'HEAD';
  const url = new URL(request.url);
  const raw = String(context.params.id || '');
  const wantPdf = raw.endsWith('.pdf');
  const key = wantPdf ? raw.slice(0, -4) : raw;

  let target: Target;
  if (key === 'sample') {
    target = { id: 'sample', doc: SAMPLE_DOC, sample: true };
  } else {
    if (!isMouId(key) || !env.AI_DB) return errorPage('notfound', head);
    const row = await getMou(env.AI_DB, key);
    const doc = row && !row.revoked_at ? parseMouDoc(row.doc_json) : null;
    if (!row || !doc) return errorPage('notfound', head);
    if (todayKst() > row.expires_on) return errorPage('expired', head);
    target = { id: key, doc, sample: false, expiresOn: row.expires_on, pdfKey: row.pdf_key };
  }
  return wantPdf ? servePdf(env, target, head) : serveHtml(env, target, url, head);
};
