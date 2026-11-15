// 리마인드 메일 바닥글의 수신거부 링크 — {MOU_BASE_URL}/optout?c=고객번호&e=메일(base64url)&s=서명
// 서명 키는 NEWSLETTER_CRON_SECRET(없으면 WORKS_CLIENT_SECRET). 키를 바꾸면 이미 보낸 링크는 열리지 않는다.
// c=0 은 시험 발송용 견본 링크 — 확인 화면만 보이고 아무것도 처리하지 않는다 (functions/optout/index.ts)

import { b64url, fromB64url, signValue, verifyValue } from './works';

export interface OptoutEnv {
  NEWSLETTER_CRON_SECRET?: string;
  WORKS_CLIENT_SECRET?: string;
  MOU_BASE_URL?: string;
}

const PURPOSE = 'optout';

function secretOf(env: OptoutEnv): string {
  const s = env.NEWSLETTER_CRON_SECRET || env.WORKS_CLIENT_SECRET;
  if (!s) throw new Error('수신거부 링크 서명 키가 없습니다 (NEWSLETTER_CRON_SECRET)');
  return s;
}

function baseOf(env: OptoutEnv): string {
  return (env.MOU_BASE_URL || 'https://docs.airtor.co.kr').replace(/\/+$/, '');
}

export async function optoutUrl(env: OptoutEnv, customerId: number, email: string): Promise<string> {
  const e = b64url(new TextEncoder().encode(email.trim().toLowerCase()));
  const s = await signValue(secretOf(env), PURPOSE, `${customerId}|${e}`);
  return `${baseOf(env)}/optout?c=${customerId}&e=${e}&s=${s}`;
}

/** 링크 값 확인 — 맞으면 { customerId, email }, 아니면 null */
export async function readOptout(env: OptoutEnv, c: string | null, e: string | null, s: string | null): Promise<{ customerId: number; email: string } | null> {
  if (!c || !e || !s || !/^\d{1,9}$/.test(c) || !/^[A-Za-z0-9_-]{1,120}$/.test(e)) return null;
  if (!(await verifyValue(secretOf(env), PURPOSE, `${c}|${e}`, s))) return null;
  let email = '';
  try {
    email = new TextDecoder().decode(fromB64url(e));
  } catch {
    return null;
  }
  return { customerId: Number(c), email };
}
