// Cloudflare Pages Function — /api/newsletter/webhook (스티비 주소록 웹훅 수신)
//
// 스티비 [주소록 > 웹훅]에 아래 URL을 등록한다 (이벤트: UNSUBSCRIBED, RESUBSCRIBED, DELETED, PURGED):
//   https://airtoradmin.pages.dev/api/newsletter/webhook?token=<NEWSLETTER_WEBHOOK_SECRET>
//
// 스티비 웹훅은 자체 인증이 없다 (도움말: 필요 시 발신 IP 52.78.132.66 허용 목록 권장).
// 여기서는 URL 쿼리의 token을 환경변수 NEWSLETTER_WEBHOOK_SECRET과 비교해 검증한다.
//
// 페이로드 (POST, JSON) — help.stibee.com/api-webhook/list-webhook 기준:
//   { id: <주소록 ID>, action: 'SUBSCRIBED'|'UPDATED'|'UNSUBSCRIBED'|'RESUBSCRIBED'|'DELETED'|'PURGED',
//     eventOccurredBy: 'MANUAL'|'SUBSCRIBER', subscribers: [ { email, ...사용자정의필드 } ] }
//   UNSUBSCRIBED에는 $unsubscribe_reason, UPDATED에는 old_email 필드가 추가된다.
//
// 처리: 이벤트를 우리 DB의 newsletter_status로 변환해 airtor_customers에 반영한다.
//   UNSUBSCRIBED            → unsubscribed
//   SUBSCRIBED/RESUBSCRIBED → subscribed
//   DELETED (자동삭제=하드바운스) → bounced
//   PURGED (완전 삭제)       → none
//   UPDATED                 → 무시
// 고객 매칭: customers_api.php GET 전체 목록에서 email 또는 contacts[].email 일치 (대소문자 무시).
// 담당자 여럿 중 한 명만 수신거부해도 고객 배지는 그 상태를 따른다 (계획서 Phase C).
//
// 응답은 항상 빠르게 200 — 스티비는 실패 시 3회 재시도하므로, 우리 쪽 DB 반영 실패는
// 로그로 남기고 200을 돌려 재시도 폭주를 막는다 (토큰 불일치만 401).

import { jsonResponse, type StibeeEnv } from '../../_lib/stibee';

type Env = StibeeEnv;

const CUSTOMERS_API = 'https://airtor.co.kr/api/customers_api.php';

type NewsletterStatus = 'none' | 'subscribed' | 'unsubscribed' | 'bounced';

const ACTION_TO_STATUS: Record<string, NewsletterStatus | undefined> = {
  UNSUBSCRIBED: 'unsubscribed',
  SUBSCRIBED: 'subscribed',
  RESUBSCRIBED: 'subscribed',
  DELETED: 'bounced',
  PURGED: 'none',
};

interface CustomerRow {
  id: number;
  email?: string;
  contacts?: { email?: string }[];
}

function extractEmails(subscribers: unknown): string[] {
  if (!Array.isArray(subscribers)) return [];
  const out: string[] = [];
  for (const s of subscribers) {
    if (typeof s === 'string') {
      out.push(s.trim().toLowerCase());
      continue;
    }
    if (s && typeof s === 'object') {
      const rec = s as Record<string, unknown>;
      const email = rec.email ?? rec.subscriber ?? rec.$email;
      if (typeof email === 'string' && email) out.push(email.trim().toLowerCase());
    }
  }
  return out;
}

function customerHasEmail(c: CustomerRow, email: string): boolean {
  if ((c.email || '').trim().toLowerCase() === email) return true;
  if (Array.isArray(c.contacts)) {
    return c.contacts.some((ct) => (ct?.email || '').trim().toLowerCase() === email);
  }
  return false;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const env = context.env;
  const url = new URL(context.request.url);

  if (!env.NEWSLETTER_WEBHOOK_SECRET) {
    return jsonResponse({ ok: false, error: 'NEWSLETTER_WEBHOOK_SECRET not configured' }, 500, '*');
  }
  if (url.searchParams.get('token') !== env.NEWSLETTER_WEBHOOK_SECRET) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401, '*');
  }

  let payload: { action?: unknown; subscribers?: unknown; id?: unknown };
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, '*');
  }

  const action = String(payload.action || '').toUpperCase();
  const status = ACTION_TO_STATUS[action];
  if (!status) {
    // UPDATED 등 관심 없는 이벤트 — 정상 수신으로 응답
    return jsonResponse({ ok: true, ignored: action || '(none)' }, 200, '*');
  }

  const emails = extractEmails(payload.subscribers);
  if (emails.length === 0) {
    return jsonResponse({ ok: true, ignored: 'no subscribers' }, 200, '*');
  }

  const updated: number[] = [];
  const failed: { id: number; error: string }[] = [];
  try {
    const listRes = await fetch(CUSTOMERS_API, { headers: { Accept: 'application/json' } });
    const listJson = (await listRes.json()) as { data?: CustomerRow[] };
    const customers = Array.isArray(listJson.data) ? listJson.data : [];

    const targets = customers.filter((c) => emails.some((e) => customerHasEmail(c, e)));
    for (const c of targets) {
      const putRes = await fetch(CUSTOMERS_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, newsletterStatus: status }),
      });
      if (putRes.ok) updated.push(c.id);
      else failed.push({ id: c.id, error: `HTTP ${putRes.status}` });
    }
  } catch (err) {
    console.error('[newsletter/webhook] customer update failed:', err);
    return jsonResponse({ ok: true, action, status, emails, updated, error: String(err) }, 200, '*');
  }

  if (failed.length > 0) console.error('[newsletter/webhook] partial failure:', failed);
  return jsonResponse({ ok: true, action, status, matched: updated.length, updated, failed }, 200, '*');
};

// 스티비 웹훅 설정 화면의 URL 검증 등 GET 핑에 대비
export const onRequestGet: PagesFunction<Env> = async () => {
  return jsonResponse({ ok: true, service: 'newsletter-webhook' }, 200, '*');
};
