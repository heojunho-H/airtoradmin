// 네이버웍스 메일 API — 리마인드 메일을 담당 매니저 본인 계정으로 보낸다 (보낸메일함·수신확인에 남고 회신도 담당자에게 간다)
//
// 공식 문서: https://developers.worksmobile.com/kr/docs/mail-create
//   POST https://www.worksapis.com/v1.0/users/{userId}/mail   scope `mail` (Standard 이상)
//   메일 API 는 구성원 OAuth 토큰으로만 쓸 수 있다(서비스 계정 JWT 불가) → 담당자마다 한 번 /api/works/connect 에서 로그인·허용.
//   Refresh Token 90일 — 개발자 콘솔에서 Refresh Token Rotation 을 켜 두면 갱신할 때마다 새로 받는다. 매일 실행에서 갱신해 만료를 막는다.
//
// 환경변수 (Cloudflare Pages):
//   WORKS_CLIENT_ID      개발자 콘솔 앱의 Client ID (Text)
//   WORKS_CLIENT_SECRET  Client Secret (Secret — 사용자가 직접 넣는다). 토큰 암호화 키도 여기서 뽑는다(HKDF)
//   WORKS_REDIRECT_URI   (선택) 기본 https://airtoradmin.co.kr/api/works/callback — 콘솔 Redirect URL 과 같아야 한다
// 토큰은 D1 AI_DB `works_tokens` 에 AES-GCM 으로 암호화해 둔다. 표는 처음 쓸 때 만든다.

export interface WorksEnv {
  AI_DB?: D1Database;
  WORKS_CLIENT_ID?: string;
  WORKS_CLIENT_SECRET?: string;
  WORKS_REDIRECT_URI?: string;
}

export const WORKS_AUTH_URL = 'https://auth.worksmobile.com/oauth2/v2.0/authorize';
export const WORKS_TOKEN_URL = 'https://auth.worksmobile.com/oauth2/v2.0/token';
export const WORKS_API_BASE = 'https://www.worksapis.com/v1.0';
export const WORKS_SCOPE = 'mail user.read';
export const WORKS_DOMAIN = 'airtor.co.kr';
export const DEFAULT_WORKS_REDIRECT = 'https://airtoradmin.co.kr/api/works/callback';
/** 시험 발송 받는 주소 — 이 주소 말고는 시험 발송을 못 한다 */
export const TEST_RECIPIENT = 'relation@airtor.co.kr';
export const TEST_DAILY_MAX = 20;

const TABLE_SQL = [
  `CREATE TABLE IF NOT EXISTS works_tokens (
    email TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT,
    refresh_enc TEXT NOT NULL,
    access_enc TEXT,
    access_exp INTEGER,
    scope TEXT,
    connected_at TEXT NOT NULL,
    refreshed_at TEXT,
    last_error TEXT
  )`,
  'CREATE TABLE IF NOT EXISTS works_test_sends (day TEXT PRIMARY KEY, count INTEGER NOT NULL)',
];
let tablesReady = false;

export async function ensureWorksTables(db: D1Database): Promise<void> {
  if (tablesReady) return;
  await db.batch(TABLE_SQL.map((s) => db.prepare(s)));
  tablesReady = true;
}

export function worksConfigured(env: WorksEnv): boolean {
  return Boolean(env.WORKS_CLIENT_ID && env.WORKS_CLIENT_SECRET && env.AI_DB);
}

export function redirectUri(env: WorksEnv): string {
  return env.WORKS_REDIRECT_URI || DEFAULT_WORKS_REDIRECT;
}

/** 'manager@airtor.co.kr' → 'm***@airtor.co.kr' (로그·공개 응답용) */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  return at <= 0 ? '***' : `${email[0]}***${email.slice(at)}`;
}

// ── 암호화·서명 (Web Crypto) ──

const te = new TextEncoder();
const td = new TextDecoder();

export function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function derive(secret: string, info: string, alg: 'AES-GCM' | 'HMAC'): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', te.encode(secret), 'HKDF', false, ['deriveKey']);
  const params = { name: 'HKDF', hash: 'SHA-256', salt: te.encode('airtoradmin-works-v1'), info: te.encode(info) };
  return alg === 'AES-GCM'
    ? crypto.subtle.deriveKey(params, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    : crypto.subtle.deriveKey(params, base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify']);
}

export async function sealText(secret: string, plain: string): Promise<string> {
  const key = await derive(secret, 'token', 'AES-GCM');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64url(out);
}

export async function openText(secret: string, sealed: string): Promise<string> {
  const key = await derive(secret, 'token', 'AES-GCM');
  const all = fromB64url(sealed);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, key, all.slice(12));
  return td.decode(pt);
}

/** 문자열 서명 (HMAC-SHA256, 16바이트) — OAuth state·수신거부 링크 */
export async function signValue(secret: string, purpose: string, value: string): Promise<string> {
  const key = await derive(secret, purpose, 'HMAC');
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, te.encode(value)));
  return b64url(sig.slice(0, 16));
}

export async function verifyValue(secret: string, purpose: string, value: string, sig: string): Promise<boolean> {
  const want = await signValue(secret, purpose, value);
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

// ── OAuth ──

const STATE_TTL_MS = 15 * 60 * 1000;

/** state = 시각.nonce.서명 — nonce 는 브라우저 쿠키(works_state)와도 맞춰 본다 */
export async function makeState(secret: string, now = Date.now()): Promise<{ state: string; nonce: string }> {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const body = `${now}.${nonce}`;
  return { state: `${body}.${await signValue(secret, 'oauth-state', body)}`, nonce };
}

export async function checkState(secret: string, state: string, cookieNonce: string | null, now = Date.now()): Promise<boolean> {
  const parts = state.split('.');
  if (parts.length !== 3) return false;
  const [ts, nonce, sig] = parts;
  if (!cookieNonce || cookieNonce !== nonce) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || now - t > STATE_TTL_MS || t - now > 60_000) return false;
  return verifyValue(secret, 'oauth-state', `${ts}.${nonce}`, sig);
}

export function authorizeUrl(env: WorksEnv, state: string): string {
  const u = new URL(WORKS_AUTH_URL);
  u.searchParams.set('client_id', env.WORKS_CLIENT_ID || '');
  u.searchParams.set('redirect_uri', redirectUri(env));
  u.searchParams.set('scope', WORKS_SCOPE);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('state', state);
  return u.toString();
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function tokenRequest(env: WorksEnv, params: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(WORKS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, client_id: env.WORKS_CLIENT_ID || '', client_secret: env.WORKS_CLIENT_SECRET || '' }).toString(),
  });
  const text = await res.text();
  let j: Record<string, unknown> = {};
  try {
    j = JSON.parse(text);
  } catch {
    // 아래에서 오류로 처리
  }
  if (!res.ok || typeof j.access_token !== 'string') {
    const why = String(j.error_description || j.error || text).replace(/\s+/g, ' ').slice(0, 160);
    throw new Error(`토큰 HTTP ${res.status} ${why}`.trim());
  }
  return {
    access_token: j.access_token,
    refresh_token: typeof j.refresh_token === 'string' ? j.refresh_token : undefined,
    expires_in: Number(j.expires_in) || 3600,
    scope: typeof j.scope === 'string' ? j.scope : undefined,
  };
}

export function exchangeCode(env: WorksEnv, code: string): Promise<TokenSet> {
  return tokenRequest(env, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(env) });
}

export interface WorksMe {
  userId: string;
  email: string;
  name: string;
}

export async function fetchMe(accessToken: string): Promise<WorksMe> {
  const res = await fetch(`${WORKS_API_BASE}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`구성원 조회 HTTP ${res.status}`);
  const un = j.userName as Record<string, unknown> | string | undefined;
  const name = typeof un === 'string' ? un : un ? `${String(un.lastName ?? '')}${String(un.firstName ?? '')}` : '';
  return { userId: String(j.userId ?? ''), email: String(j.email ?? '').trim().toLowerCase(), name: name.trim() };
}

export async function saveConnection(env: WorksEnv, me: WorksMe, tokens: TokenSet, now = Date.now()): Promise<void> {
  const db = env.AI_DB;
  const secret = env.WORKS_CLIENT_SECRET;
  if (!db || !secret) throw new Error('네이버웍스 연동 설정이 없습니다');
  if (!tokens.refresh_token) throw new Error('Refresh Token 을 받지 못했습니다');
  await ensureWorksTables(db);
  const iso = new Date(now).toISOString();
  await db
    .prepare(
      `INSERT INTO works_tokens (email, user_id, name, refresh_enc, access_enc, access_exp, scope, connected_at, refreshed_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id, name = excluded.name, refresh_enc = excluded.refresh_enc,
         access_enc = excluded.access_enc, access_exp = excluded.access_exp, scope = excluded.scope,
         connected_at = excluded.connected_at, refreshed_at = excluded.refreshed_at, last_error = NULL`,
    )
    .bind(
      me.email, me.userId, me.name, await sealText(secret, tokens.refresh_token), await sealText(secret, tokens.access_token),
      now + tokens.expires_in * 1000, tokens.scope ?? WORKS_SCOPE, iso, iso,
    )
    .run();
}

export interface WorksConnection {
  email: string;
  name: string;
  connectedAt: string;
  refreshedAt: string | null;
  lastError: string | null;
}

export async function listConnections(env: WorksEnv): Promise<WorksConnection[]> {
  const db = env.AI_DB;
  if (!db) return [];
  await ensureWorksTables(db);
  const { results } = await db
    .prepare('SELECT email, name, connected_at, refreshed_at, last_error FROM works_tokens ORDER BY email')
    .all<{ email: string; name: string | null; connected_at: string; refreshed_at: string | null; last_error: string | null }>();
  return (results || []).map((r) => ({ email: r.email, name: r.name || '', connectedAt: r.connected_at, refreshedAt: r.refreshed_at, lastError: r.last_error }));
}

/** 지금 보낼 수 있는 계정 (토큰이 있고 마지막 갱신이 실패하지 않은 것) */
export async function connectedEmails(env: WorksEnv): Promise<Set<string>> {
  if (!worksConfigured(env)) return new Set();
  return new Set((await listConnections(env)).filter((c) => !c.lastError).map((c) => c.email));
}

export class WorksNotConnectedError extends Error {}

interface TokenRow {
  refresh_enc: string;
  access_enc: string | null;
  access_exp: number | null;
}

/** 보낼 때 쓸 Access Token — 만료가 가까우면(또는 force) Refresh Token 으로 새로 받고 저장한다 */
export async function accessTokenFor(env: WorksEnv, email: string, force = false, now = Date.now()): Promise<string> {
  const db = env.AI_DB;
  const secret = env.WORKS_CLIENT_SECRET;
  if (!db || !secret || !env.WORKS_CLIENT_ID) throw new WorksNotConnectedError('네이버웍스 연동 설정이 없습니다');
  await ensureWorksTables(db);
  const row = await db.prepare('SELECT refresh_enc, access_enc, access_exp FROM works_tokens WHERE email = ?').bind(email).first<TokenRow>();
  if (!row) throw new WorksNotConnectedError(`${maskEmail(email)} 은 아직 연결되지 않았습니다`);
  if (!force && row.access_enc && (row.access_exp ?? 0) > now + 120_000) return openText(secret, row.access_enc);

  let tokens: TokenSet;
  try {
    tokens = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: await openText(secret, row.refresh_enc) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.prepare('UPDATE works_tokens SET last_error = ? WHERE email = ?').bind(msg.slice(0, 300), email).run();
    throw new WorksNotConnectedError(`${maskEmail(email)} 토큰 갱신 실패 — 다시 연결해야 합니다 (${msg})`);
  }
  const refreshEnc = tokens.refresh_token ? await sealText(secret, tokens.refresh_token) : row.refresh_enc;
  await db
    .prepare('UPDATE works_tokens SET access_enc = ?, access_exp = ?, refresh_enc = ?, refreshed_at = ?, last_error = NULL WHERE email = ?')
    .bind(await sealText(secret, tokens.access_token), now + tokens.expires_in * 1000, refreshEnc, new Date(now).toISOString(), email)
    .run();
  return tokens.access_token;
}

export interface WorksMail {
  to: string;
  subject: string;
  html: string;
}

export type SendResult = { ok: true } | { ok: false; error: string; notConnected?: boolean };

/** 메일 한 통 — senderEmail 계정의 보낸메일함에 남는다. 202 Accepted 면 성공 */
export async function sendWorksMail(env: WorksEnv, senderEmail: string, mail: WorksMail): Promise<SendResult> {
  const post = (token: string) =>
    fetch(`${WORKS_API_BASE}/users/${encodeURIComponent(senderEmail)}/mail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: mail.to, subject: mail.subject, body: mail.html, contentType: 'html', isSaveSentMail: true, isSaveTracking: true }),
    });
  try {
    let res = await post(await accessTokenFor(env, senderEmail));
    if (res.status === 401) res = await post(await accessTokenFor(env, senderEmail, true));
    if (res.status >= 200 && res.status < 300) return { ok: true };
    const text = (await res.text()).replace(/\s+/g, ' ').slice(0, 200);
    return { ok: false, error: `메일 API HTTP ${res.status} ${text}`.trim() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), notConnected: err instanceof WorksNotConnectedError };
  }
}

/** 매일 실행 때 — 하루 넘게 갱신하지 않은 토큰을 새로 받아 90일 만료를 막는다 */
export async function refreshStaleTokens(env: WorksEnv, now = Date.now()): Promise<{ refreshed: number; failed: string[] }> {
  const out = { refreshed: 0, failed: [] as string[] };
  if (!worksConfigured(env)) return out;
  for (const c of await listConnections(env)) {
    const last = c.refreshedAt ? Date.parse(c.refreshedAt) : 0;
    if (now - last < 20 * 3600 * 1000) continue;
    try {
      await accessTokenFor(env, c.email, true, now);
      out.refreshed++;
    } catch {
      out.failed.push(maskEmail(c.email));
    }
  }
  return out;
}

/** 시험 발송 하루 상한 — 넘으면 false */
export async function takeTestQuota(env: WorksEnv, day: string, max = TEST_DAILY_MAX): Promise<boolean> {
  const db = env.AI_DB;
  if (!db) return false;
  await ensureWorksTables(db);
  const res = await db
    .prepare('INSERT INTO works_test_sends (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1 WHERE count < ?')
    .bind(day, max)
    .run();
  return Boolean(res.meta.changes);
}
