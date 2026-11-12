// 구글 광고 '계약 성공(CRM)' 업로드 — 리드용 향상된 전환 (2026-11-12)
//
// 흐름
//  1) 홈페이지 문의 폼에서 '광고 성과 측정 동의(선택)'에 체크한 문의만 요청사항 끝에 [광고측정동의] 가 붙는다
//     (airtor-homepage site/inc/ads_lib.php). 같은 문의의 이메일·전화는 구글 태그가 해시해 문의 전환과 함께 보낸다.
//  2) CRM 에서 딜이 '계약 성공'으로 바뀌는 순간 /api/deals 프록시가 PHP 응답의 transition:'won' 을 보고
//     D1 ads_deal_won 에 계약 시각을 남긴다 (PHP·DB 구조 변경 없음 — 프로젝트 created_at 은 운영 DB 에서 비어 있다).
//  3) /api/ads_conversions 가 [광고측정동의] 딜 중 최근 90일 안에 계약된 건을 CSV 로 만든다.
//     구글 데이터 관리 도구(HTTPS, Basic 인증)가 매일 가져가고, CRM 설정 화면에서 같은 파일을 받을 수도 있다.
//
// 이메일·전화는 SHA-256 해시로만 내보낸다(구글 정규화 규칙: 이메일 소문자·공백 제거, 전화 E.164).
// 금액은 공급가액(부가세 제외) — 프로젝트 netRevenue, 없으면 딜 견적에서 서버와 같은 식(q − round(q×10/110))으로 계산.

export const CONSENT_MARK = '[광고측정동의]';
export const CONVERSION_NAME = '계약 성공(CRM)';
export const DEALS_API_URL = 'https://airtor.co.kr/api/deals_api_v2.php';
export const PROJECTS_API_URL = 'https://airtor.co.kr/api/projects_api_v2.php';
export const MAX_DAYS = 90;

export const CSV_HEADER = ['Email', 'Phone Number', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency', 'Order ID'];

export interface FeedDeal {
  id: number;
  successStatus?: string;
  requirements?: string;
  email?: string;
  phone?: string;
  quotationAmount?: string | number;
}

export interface FeedProject {
  dealId: number;
  netRevenue?: number;
}

export interface FeedRow {
  emailHash: string;
  phoneHash: string;
  time: string; // yyyy-MM-dd HH:mm:ss+0900
  value: number; // 공급가액(원), 0 이면 빈칸
  orderId: string;
}

export interface FeedSummary {
  days: number;
  won: number; // 지금 계약 성공 상태인 딜
  wonRecorded: number; // 그중 계약 시각 기록이 있는 딜 (기록은 2026-11-12 배포 뒤 계약부터)
  wonInWindow: number; // 그중 최근 N일 안에 계약된 딜
  consented: number; // 그중 [광고측정동의] 딜
  withContact: number; // 그중 이메일·전화가 있는 딜 = 업로드 행
  rows: number;
}

// ─── 정규화·해시 ───────────────────────────────────────────────────────

/** 이메일: 앞뒤 공백 제거·소문자. 형식이 아니면 빈 문자열 */
export function normalizeEmail(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : '';
}

/** 전화: 국제 형식(E.164, +82…). 0 으로 시작하는 국내 번호와 82 로 시작하는 번호만 — 그 밖(1644 등)은 빈 문자열 */
export function toE164(v: unknown): string {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  let d = String(v).replace(/[^0-9]/g, '');
  if (d.startsWith('82')) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  else return '';
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length < 8 || d.length > 10) return '';
  return '+82' + d;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 견적(자유 입력, 부가세 포함) → 원. "₩12,500만", "₩1억 2,000만", "7900000" (src/lib/ai/snapshot/common.ts parseAmount 와 같은 규칙) */
export function parseAmount(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (!v || typeof v !== 'string') return 0;
  const s = v.replace(/[,\s₩원]/g, '');
  if (!/[억만]/.test(s)) {
    const n = parseFloat(s.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  let total = 0;
  const eok = s.match(/([0-9.]+)억/);
  if (eok) total += parseFloat(eok[1]) * 100_000_000;
  const man = s.match(/([0-9.]+)만/);
  if (man) total += parseFloat(man[1]) * 10_000;
  return Number.isFinite(total) ? total : 0;
}

/** 부가세 포함 금액 → 공급가액 (api/sync_lib.php sl_project_amounts 와 같은 식) */
export function netOf(gross: number): number {
  const q = Math.round(gross);
  return q > 0 ? q - Math.round((q * 10) / 110) : 0;
}

/** ISO(UTC) → 'yyyy-MM-dd HH:mm:ss+0900' (한국 시각) */
export function kstTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const k = new Date(t + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}:${p(k.getUTCSeconds())}+0900`;
}

// ─── 계약 시각 기록 (D1) ───────────────────────────────────────────────

const WON_TABLE_SQL = 'CREATE TABLE IF NOT EXISTS ads_deal_won (deal_id INTEGER PRIMARY KEY, won_at TEXT NOT NULL)';
let wonTableReady = false;

async function ensureWonTable(db: D1Database): Promise<void> {
  if (wonTableReady) return;
  await db.prepare(WON_TABLE_SQL).run();
  wonTableReady = true;
}

/** 처음 계약된 시각만 남긴다(계약 취소 뒤 다시 계약돼도 첫 시각 유지) */
export async function recordWon(db: D1Database, dealId: number, at: Date = new Date()): Promise<void> {
  if (!Number.isInteger(dealId) || dealId <= 0) return;
  await ensureWonTable(db);
  await db.prepare('INSERT OR IGNORE INTO ads_deal_won (deal_id, won_at) VALUES (?, ?)').bind(dealId, at.toISOString()).run();
}

export async function loadWon(db: D1Database): Promise<Map<number, string>> {
  await ensureWonTable(db);
  const { results } = await db.prepare('SELECT deal_id, won_at FROM ads_deal_won').all<{ deal_id: number; won_at: string }>();
  return new Map((results || []).map((r) => [Number(r.deal_id), String(r.won_at)]));
}

/**
 * /api/deals 프록시 응답 본문에서 이번 저장으로 '계약 성공'이 된 딜 ID (POST: id, PUT: deal.id). 아니면 null.
 * 고객·프로젝트 동기화만 실패한 500 응답도 딜은 저장됐으므로(deal_persisted) 기록한다.
 */
export function wonDealIdFromResponse(text: string): number | null {
  if (!text.includes('"transition":"won"')) return null;
  try {
    const j = JSON.parse(text) as { transition?: unknown; success?: unknown; deal_persisted?: unknown; id?: unknown; deal?: { id?: unknown } | null };
    if (j.transition !== 'won' || (j.success !== true && j.deal_persisted !== true)) return null;
    const id = Number(j.deal?.id ?? j.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

// ─── 업로드 행 ─────────────────────────────────────────────────────────

export async function buildConversionRows(
  deals: FeedDeal[],
  projects: FeedProject[],
  won: Map<number, string>,
  now: Date,
  days = MAX_DAYS,
): Promise<{ rows: FeedRow[]; summary: FeedSummary }> {
  const span = Math.min(Math.max(Math.floor(days) || MAX_DAYS, 1), MAX_DAYS);
  const since = now.getTime() - span * 86_400_000;
  const netByDeal = new Map<number, number>();
  for (const p of projects) {
    const id = Number(p.dealId);
    const net = Number(p.netRevenue);
    if (Number.isInteger(id) && id > 0 && Number.isFinite(net) && net > 0 && !netByDeal.has(id)) netByDeal.set(id, Math.round(net));
  }

  const summary: FeedSummary = { days: span, won: 0, wonRecorded: 0, wonInWindow: 0, consented: 0, withContact: 0, rows: 0 };
  const rows: FeedRow[] = [];
  for (const d of deals) {
    if (d.successStatus !== 'success') continue;
    summary.won++;
    const id = Number(d.id);
    const wonAt = won.get(id);
    if (!wonAt) continue;
    summary.wonRecorded++;
    const t = Date.parse(wonAt);
    if (!Number.isFinite(t) || t < since || t > now.getTime()) continue;
    summary.wonInWindow++;
    if (typeof d.requirements !== 'string' || !d.requirements.includes(CONSENT_MARK)) continue;
    summary.consented++;
    const email = normalizeEmail(d.email);
    const phone = toE164(d.phone);
    if (!email && !phone) continue;
    summary.withContact++;
    rows.push({
      emailHash: email ? await sha256Hex(email) : '',
      phoneHash: phone ? await sha256Hex(phone) : '',
      time: kstTime(wonAt),
      value: netByDeal.get(id) ?? netOf(parseAmount(d.quotationAmount)),
      orderId: `deal-${id}`,
    });
  }
  rows.sort((a, b) => a.time.localeCompare(b.time));
  summary.rows = rows.length;
  return { rows, summary };
}

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: FeedRow[]): string {
  const lines = [CSV_HEADER.join(',')];
  for (const r of rows) {
    lines.push(
      [r.emailHash, r.phoneHash, CONVERSION_NAME, r.time, r.value > 0 ? String(r.value) : '', 'KRW', r.orderId].map(csvCell).join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

// ─── PHP API ───────────────────────────────────────────────────────────

/** 카페24 PHP API 를 서버에서 읽는다. 호스팅 만료 리디렉트(302→HTML 200)도 실패로 본다 */
export async function fetchCrmList<T>(url: string): Promise<T[]> {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, redirect: 'manual' });
  if (res.status !== 200) throw new Error(`CRM API ${res.status}`);
  const text = await res.text();
  let body: { success?: unknown; data?: unknown };
  try {
    body = JSON.parse(text) as { success?: unknown; data?: unknown };
  } catch {
    throw new Error('CRM API 응답이 JSON 이 아닙니다');
  }
  if (body.success !== true || !Array.isArray(body.data)) throw new Error('CRM API 응답 형식 오류');
  return body.data as T[];
}
