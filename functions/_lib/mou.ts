// 단가보장 협약서 링크 — B1(200일) 광고판 메일의 '단가보장 협약서 보기' (docs/mou.md)
//
// 흐름: 팔로업 실제 실행에서 mou 단계(NEWSLETTER_FOLLOWUPS 의 "mou": true) 대상마다 협약서 내용을
// D1 mou_links 에 얼려 두고(추측할 수 없는 128비트 ID), 메일에는 {MOU_BASE_URL}/mou/<id> 를 개인화 값
// mou_url 로 싣는다. 고객이 열면 functions/mou/[id].ts 가 이 스냅숏으로 화면을 그리고, <id>.pdf 는
// Cloudflare Browser Run REST(/pdf)로 만들어 R2 에 한 번 저장한 뒤 내려보낸다.
//
// 표: 작업 항목 dealId → ai_files(견적서 도우미로 반영한 견적, applied_json.role='values' 1건) → 품목별 단가.
//     판독이 없거나 금액이 딜과 맞지 않으면 설비별 대수 + 지난 작업 금액(VAT 포함), 금액도 없으면 대수만.
// 직인: R2 brand/mou-seal.png 에만 둔다(공개 저장소에 두지 않는다). 없으면 (인) 만 찍는다.

import { addDays, isYmd } from './followups';
import { LOGO_COLOR_PNG } from './mou-assets';

export const DEFAULT_MOU_BASE_URL = 'https://docs.airtor.co.kr';
/** 서식을 바꾸면 올린다 — R2 의 PDF 캐시 키가 바뀌어 새 서식으로 다시 만든다 */
export const MOU_VERSION = 'v2';
export const SEAL_R2_KEY = 'brand/mou-seal.png';
/** 적용 기간이 끝난 뒤에도 링크를 여는 날 수 */
export const MOU_GRACE_DAYS = 30;
const ID_RE = /^[A-Za-z0-9_-]{22}$/;

export interface MouEnv {
  AI_DB?: D1Database;
  FILES?: R2Bucket;
  /** Cloudflare API 토큰 (권한: Account · Browser Run · Edit) — PDF 만들기 */
  BROWSER_RUN_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  /** 메일에 싣는 링크의 앞부분 (기본 https://docs.airtor.co.kr) */
  MOU_BASE_URL?: string;
}

export interface MouRow {
  name: string;
  quantity: number;
  unitPrice?: number;
  supply?: number;
  tax?: number;
  total?: number;
}

export interface MouDoc {
  v: 1;
  company: string;
  workDate: string;
  /** 작업일 + 365일 — 메일의 due_date_kr 과 같은 날 */
  validUntil: string;
  issuedAt: string;
  manager: { name: string; position: string } | null;
  /** items: 견적서 품목별 단가 · total: 설비별 대수 + 지난 작업 금액 · same: 대수만(금액 기록 없음) */
  mode: 'items' | 'total' | 'same';
  rows: MouRow[];
  /** items: 품목 합계 − 견적 총액(천 원 단위 절사 등). 0보다 크면 '단수 정리' 줄 */
  rounding: number;
  /** items: 견적 총액 · total: 지난 작업 금액 (모두 VAT 포함) · same: 0 */
  amount: number;
  /** items: 견적서 날짜 YYYY-MM-DD, 없으면 '' */
  quoteDate: string;
  /** 협약번호 MOU-YYYYMMDD-고객번호 (발행 때 붙인다) */
  no?: string;
}

// ─── 표 만들기 ──────────────────────────────────────────────────────────

// 영업 화면 상세 수량 키 순서 (src/lib/ai/intake.ts EQUIPMENT_KEYS 와 같게 유지)
const EQUIPMENT_ORDER = ['벽걸이형', '스탠드 일반형', '스탠드 대형', '1way 천정형', '2way 천정형', '4way 천정형', '원형 천정형', 'FCU형', '매립덕트형', '실외기'];
const EQUIPMENT_ALIASES: Record<string, string> = { 스탠드형: '스탠드 일반형' };

function toInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** 작업 항목 detailedQuantity(JSON 문자열·[{item, quantity}]·짧은 글) → 설비별 대수 줄 */
export function equipmentRows(dq: unknown): MouRow[] {
  let cats: Record<string, unknown> = {};
  let others: unknown[] = [];
  if (typeof dq === 'string') {
    const t = dq.trim();
    if (!t) return [];
    if (t[0] !== '{' && t[0] !== '[') return t.length <= 80 ? [{ name: t, quantity: 0 }] : [];
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) others = parsed;
      else {
        cats = parsed?.categories && typeof parsed.categories === 'object' ? parsed.categories : {};
        others = Array.isArray(parsed?.others) ? parsed.others : [];
      }
    } catch {
      return [];
    }
  } else if (Array.isArray(dq)) {
    others = dq;
  }
  const merged: Record<string, number> = {};
  for (const [k, v] of Object.entries(cats)) {
    const key = EQUIPMENT_ALIASES[k] ?? k;
    merged[key] = (merged[key] ?? 0) + Math.max(0, toInt(v));
  }
  const keys = [...EQUIPMENT_ORDER.filter((k) => k in merged), ...Object.keys(merged).filter((k) => !EQUIPMENT_ORDER.includes(k))];
  const rows: MouRow[] = keys.filter((k) => merged[k] > 0).map((k) => ({ name: k, quantity: merged[k] }));
  for (const o of others) {
    if (typeof o === 'string' && o.trim()) rows.push({ name: o.trim().slice(0, 60), quantity: 0 });
    else if (o && typeof o === 'object') {
      const r = o as { name?: unknown; item?: unknown; quantity?: unknown };
      const name = String(r.name ?? r.item ?? '').trim();
      if (name) rows.push({ name: name.slice(0, 60), quantity: Math.max(0, toInt(r.quantity)) });
    }
  }
  return rows;
}

export interface QuoteFileRow {
  extraction_json: string | null;
  applied_json: string | null;
}

export interface QuoteTable {
  rows: MouRow[];
  amount: number;
  rounding: number;
  quoteDate: string;
}

function roleOf(appliedJson: string | null): string {
  try {
    const a = appliedJson ? JSON.parse(appliedJson) : null;
    return a && typeof a.role === 'string' ? a.role : '';
  } catch {
    return '';
  }
}

/**
 * 견적서 판독으로 품목별 단가표를 만든다. 아래를 모두 만족할 때만 쓰고, 아니면 null(→ 대수와 총액).
 * - 이 딜에 수치를 반영한 견적(applied_json.role='values')이 딱 1건 (여러 장을 합산한 딜은 쓰지 않는다)
 * - 에어터 발행 견적서 1장, 1회 작업 금액, VAT 포함
 * - 줄마다 1대 단가 × 수량 = 공급가액, 공급가액 + 세액 = 합계
 * - 품목 합계 − 총 견적 금액 = 0 ~ max(1만 원, 1%) (천 원 단위 절사까지는 '단수 정리' 줄로 보인다)
 * - 딜 금액이 있으면 총 견적 금액과 max(1만 원, 1%) 안에서 같음 (협상으로 금액을 고친 딜은 쓰지 않는다)
 */
export function pickQuoteTable(files: QuoteFileRow[], dealAmount: number): QuoteTable | null {
  const values = files.filter((f) => roleOf(f.applied_json) === 'values');
  if (values.length !== 1) return null;
  let ex: Record<string, unknown>;
  try {
    ex = JSON.parse(values[0].extraction_json || '');
  } catch {
    return null;
  }
  if (!ex || typeof ex !== 'object') return null;
  if (ex.documentType !== 'quote' || ex.issuedByAirtor !== true || ex.vatIncluded !== true) return null;
  if (ex.pricingBasis !== undefined && ex.pricingBasis !== 'one_off') return null;
  if (toInt(ex.quoteCount) > 1) return null;
  const items = Array.isArray(ex.lineItems) ? (ex.lineItems as Record<string, unknown>[]) : [];
  if (items.length === 0 || items.length > 40) return null;

  const rows: MouRow[] = [];
  for (const it of items) {
    const name = typeof it?.name === 'string' ? it.name.trim() : '';
    const unitPrice = toInt(it?.unitPrice);
    const quantity = toInt(it?.quantity);
    const supply = toInt(it?.supplyAmount);
    const tax = toInt(it?.taxAmount);
    const total = toInt(it?.total);
    if (!name || unitPrice <= 0 || quantity <= 0 || supply <= 0 || tax < 0 || total <= 0) return null;
    if (Math.abs(unitPrice * quantity - supply) > quantity) return null;
    if (Math.abs(supply + tax - total) > 1) return null;
    rows.push({ name: name.slice(0, 60), unitPrice, quantity, supply, tax, total });
  }
  const linesTotal = rows.reduce((s, r) => s + (r.total || 0), 0);
  const quoted = toInt(ex.quotedTotal);
  if (quoted <= 0) return null;
  const rounding = linesTotal - quoted;
  if (rounding < 0 || rounding > Math.max(10_000, Math.round(linesTotal * 0.01))) return null;
  if (dealAmount > 0 && Math.abs(quoted - dealAmount) > Math.max(10_000, Math.round(quoted * 0.01))) return null;
  return { rows, amount: quoted, rounding, quoteDate: isYmd(ex.quoteDate) ? (ex.quoteDate as string) : '' };
}

export interface MouSource {
  company: string;
  workDate: string;
  dealId: number | null;
  detailedQuantity: unknown;
  totalQuantity: number;
  quotationAmount: number;
  manager: { name: string; position: string } | null;
}

export function buildMouDoc(src: MouSource, quote: QuoteTable | null, today: string): MouDoc {
  const base = {
    v: 1 as const,
    company: src.company.trim() || '귀사',
    workDate: src.workDate,
    validUntil: addDays(src.workDate, 365),
    issuedAt: today,
    manager: src.manager,
  };
  if (quote) return { ...base, mode: 'items', rows: quote.rows, rounding: quote.rounding, amount: quote.amount, quoteDate: quote.quoteDate };
  let rows = equipmentRows(src.detailedQuantity);
  if (rows.length === 0 && src.totalQuantity > 0) rows = [{ name: '에어컨', quantity: src.totalQuantity }];
  const amount = src.quotationAmount > 0 ? Math.round(src.quotationAmount) : 0;
  return { ...base, mode: amount > 0 ? 'total' : 'same', rows, rounding: 0, amount, quoteDate: '' };
}

// ─── D1 mou_links ───────────────────────────────────────────────────────

// d1/migrations/0007_mou_links.sql 과 같은 문장. 폐기(revoked_at)한 행은 같은 작업의 새 링크를 막지 않는다.
const MOU_TABLE_SQL = [
  `CREATE TABLE IF NOT EXISTS mou_links (
    id TEXT PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    job_key TEXT NOT NULL,
    deal_id INTEGER,
    doc_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_on TEXT NOT NULL,
    pdf_key TEXT,
    revoked_at TEXT
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS mou_links_job ON mou_links (customer_id, job_key) WHERE revoked_at IS NULL',
];
let mouTableReady = false;

export async function ensureMouTable(db: D1Database): Promise<void> {
  if (mouTableReady) return;
  await db.batch(MOU_TABLE_SQL.map((s) => db.prepare(s)));
  mouTableReady = true;
}

export function isMouId(s: string): boolean {
  return ID_RE.test(s);
}

export function newMouId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function mouBaseUrl(env: MouEnv): string {
  return (env.MOU_BASE_URL || DEFAULT_MOU_BASE_URL).trim().replace(/\/+$/, '');
}

export function mouUrl(env: MouEnv, id: string): string {
  return `${mouBaseUrl(env)}/mou/${id}`;
}

export interface MouLinkRow {
  id: string;
  doc_json: string;
  expires_on: string;
  pdf_key: string | null;
  revoked_at: string | null;
}

export async function getMou(db: D1Database, id: string): Promise<MouLinkRow | null> {
  try {
    return await db.prepare('SELECT id, doc_json, expires_on, pdf_key, revoked_at FROM mou_links WHERE id = ?').bind(id).first<MouLinkRow>();
  } catch (err) {
    // 첫 발급 전에는 표가 없다 — 없는 링크와 같다
    if (err instanceof Error && /no such table/i.test(err.message)) return null;
    throw err;
  }
}

export function parseMouDoc(json: string): MouDoc | null {
  try {
    const d = JSON.parse(json);
    if (!d || d.v !== 1 || !isYmd(d.workDate) || !Array.isArray(d.rows)) return null;
    return d as MouDoc;
  } catch {
    return null;
  }
}

export async function setMouPdfKey(db: D1Database, id: string, key: string): Promise<void> {
  await db.prepare('UPDATE mou_links SET pdf_key = ? WHERE id = ? AND pdf_key IS NULL').bind(key, id).run();
}

async function loadQuoteFiles(db: D1Database, dealId: number): Promise<QuoteFileRow[]> {
  const res = await db
    .prepare(
      "SELECT extraction_json, applied_json FROM ai_files WHERE deal_id = ? AND kind = 'quote' AND status = 'linked' AND deleted_at IS NULL AND extraction_json IS NOT NULL ORDER BY linked_at DESC LIMIT 20",
    )
    .bind(dealId)
    .all<QuoteFileRow>();
  return res.results || [];
}

export interface MouIssueInput extends MouSource {
  customerId: number;
  jobKey: string;
}

/** 협약번호 — 발행일과 고객 번호 (예: MOU-20270414-0005) */
export function mouNumber(issuedAt: string, customerId: number): string {
  return `MOU-${issuedAt.replace(/-/g, '')}-${String(Math.max(0, Math.trunc(customerId))).padStart(4, '0')}`;
}

/** 이 작업의 협약서 링크 — 이미 있으면 그 링크, 없으면 지금 내용으로 얼려 새로 만든다 */
export async function issueMouLink(env: MouEnv, input: MouIssueInput, today: string): Promise<{ id: string; url: string; reused: boolean; mode: MouDoc['mode'] }> {
  const db = env.AI_DB;
  if (!db) throw new Error('AI_DB 바인딩이 없습니다');
  await ensureMouTable(db);
  const findSql = 'SELECT id, doc_json FROM mou_links WHERE customer_id = ? AND job_key = ? AND revoked_at IS NULL';
  const existing = await db.prepare(findSql).bind(input.customerId, input.jobKey).first<{ id: string; doc_json: string }>();
  if (existing) return { id: existing.id, url: mouUrl(env, existing.id), reused: true, mode: parseMouDoc(existing.doc_json)?.mode ?? 'same' };

  const files = input.dealId ? await loadQuoteFiles(db, input.dealId) : [];
  const doc: MouDoc = { ...buildMouDoc(input, pickQuoteTable(files, input.quotationAmount), today), no: mouNumber(today, input.customerId) };
  const id = newMouId();
  const res = await db
    .prepare('INSERT OR IGNORE INTO mou_links (id, customer_id, job_key, deal_id, doc_json, created_at, expires_on) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, input.customerId, input.jobKey, input.dealId, JSON.stringify(doc), new Date().toISOString(), addDays(doc.validUntil, MOU_GRACE_DAYS))
    .run();
  if (!res.meta.changes) {
    // 같은 작업의 행을 그사이 다른 실행이 만들었다 — 그 링크를 쓴다
    const again = await db.prepare(findSql).bind(input.customerId, input.jobKey).first<{ id: string; doc_json: string }>();
    if (again) return { id: again.id, url: mouUrl(env, again.id), reused: true, mode: parseMouDoc(again.doc_json)?.mode ?? 'same' };
    throw new Error('mou_links 저장 실패');
  }
  return { id, url: mouUrl(env, id), reused: false, mode: doc.mode };
}

// ─── 화면 ────────────────────────────────────────────────────────────────

/** 공개 견본 (/mou/sample) — 단가는 00,000 으로 가리고 직인 자리는 회색 점선 */
export const SAMPLE_DOC: MouDoc = {
  v: 1,
  company: '한빛초등학교',
  workDate: '2026-09-26',
  validUntil: '2027-09-26',
  issuedAt: '2027-04-14',
  manager: { name: 'OOO', position: '팀장' },
  mode: 'items',
  rows: [
    { name: '1way 천정형', unitPrice: 10_000, quantity: 22, supply: 220_000, tax: 22_000, total: 242_000 },
    { name: '4way 천정형', unitPrice: 10_000, quantity: 2, supply: 20_000, tax: 2_000, total: 22_000 },
  ],
  rounding: 0,
  amount: 264_000,
  quoteDate: '',
  no: 'MOU-20270414-0005',
};

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** 'YYYY-MM-DD' → '2026. 9. 26.' */
export function dotDate(ymd: string): string {
  if (!isYmd(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return `${y}. ${m}. ${d}.`;
}

function longDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

/** 견본은 숫자를 0 으로 가린다 (가격 비공개) */
function money(n: number | undefined, sample: boolean): string {
  const s = (n ?? 0).toLocaleString('ko-KR');
  return sample ? s.replace(/\d/g, '0') : s;
}

export function mouFileName(doc: MouDoc): string {
  return `${doc.company.replace(/[\\/:*?"<>|]+/g, ' ').trim() || '에어터'} 단가보장 협약서.pdf`;
}

export interface RenderOptions {
  /** screen: 고객 화면(버튼·안내 포함, 인쇄는 A4) · pdf: Browser Run 에 보내는 인쇄용(외부 글꼴 없음) */
  mode: 'screen' | 'pdf';
  /** 링크 ID 또는 'sample' — 화면의 PDF 버튼 주소 */
  id: string;
  sample: boolean;
  /** data: URI. 없으면 (인) 만 */
  sealUri: string | null;
  /** screen 의 인쇄 버튼 스크립트 nonce */
  nonce?: string;
  /** PDF 만들기에 실패해 돌아왔을 때 */
  pdfFailed?: boolean;
  /** 링크가 열리는 마지막 날 */
  expiresOn?: string;
}

// 표 줄(품목 + 단수 정리 + 합계)이 이보다 많으면 인쇄 간격을 줄인다 — 장수 점검으로 정한 값
const COMPACT_FROM = 6;

// 협약서에 적는 회사 정보 — 홈페이지 맨 아래(foot.php)와 같은 공개 정보
const COMPANY = {
  name: '주식회사 에어터',
  short: '㈜에어터',
  bizNo: '691-86-02152',
  address: '서울특별시 강남구 논현로10길 30',
  phone: '1644-1295',
  web: 'www.airtor.co.kr',
};

const STYLE = `
:root{--ink:#1f2329;--sub:#3a4250;--muted:#6b7480;--hair:#dde2e8;--rule:#1f2329;--blue:#1a4c9c;--bg:#eef1f5}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Noto Sans KR','Noto Sans CJK KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif}
.serif{font-family:'Noto Serif KR','Noto Serif CJK KR','AppleMyungjo','Batang',serif}
.title,.pre,.art p,.closing,.terms dd,.top-title,.top-meta,.doc-foot{word-break:keep-all;overflow-wrap:anywhere}
.top{max-width:826px;margin:0 auto;padding:24px 16px 16px;display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px}
.top-text{flex:1 1 260px;min-width:0}
.top-title{margin:0;font-size:20px;font-weight:700;letter-spacing:-0.3px}
.top-meta{margin:4px 0 0;font-size:14px;color:var(--sub)}
.top-actions{display:flex;gap:8px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:8px;border:1px solid #c4ccd6;background:#fff;color:var(--ink);font:inherit;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer}
.btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}
.btn:focus-visible{outline:3px solid #8fb3e8;outline-offset:2px}
.notice{flex-basis:100%;margin:0;font-size:14px;line-height:1.6;color:#8a3b12}
.sheet-wrap{padding:0 16px 24px}
.sheet{position:relative;max-width:794px;min-height:1123px;margin:0 auto;padding:52px 64px 104px;background:#fff;box-shadow:0 1px 3px rgba(16,24,40,.12)}
.lh{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding-bottom:14px;border-bottom:1.5px solid var(--blue)}
.lh-brand{display:flex;align-items:center;gap:12px}
.lh-brand img{display:block;height:26px;width:auto}
.lh-div{width:1px;height:18px;background:#c8ced6}
.lh-tag{font-size:13px;font-weight:500;color:var(--sub);letter-spacing:.02em;white-space:nowrap}
.lh-meta{margin:0;display:grid;grid-template-columns:auto auto;gap:2px 10px;font-size:12px;line-height:1.5;text-align:right}
.lh-meta dt{color:var(--muted)}
.lh-meta dd{margin:0;color:var(--ink);font-variant-numeric:tabular-nums}
.stamp{display:inline-block;margin:0 0 6px;border:1.5px solid #e5484d;color:#e5484d;font-size:12px;font-weight:700;letter-spacing:.3em;padding:1px 4px 1px 8px}
.lh-right{text-align:right}
.title{margin:44px 0 0;text-align:center;font-weight:600;font-size:28px;letter-spacing:.06em}
.subtitle{margin:8px 0 0;text-align:center;font-size:11px;letter-spacing:.28em;color:var(--muted)}
.pre{margin:34px 0 0;font-size:15px;line-height:1.85}
.terms{margin:22px 0 0;display:grid;grid-template-columns:auto 1fr auto 1fr;border-top:1.2px solid var(--rule)}
.terms dt,.terms dd{margin:0;padding:10px 0;border-bottom:1px solid var(--hair)}
.terms dt{padding-right:18px;font-size:13px;font-weight:700;color:var(--sub);white-space:nowrap}
.terms dd{padding-right:22px;font-size:14px}
.terms small{display:block;margin-top:2px;font-size:12px;color:var(--muted)}
.sec-h{display:flex;justify-content:space-between;align-items:baseline;margin:32px 0 8px}
.sec-h h3{margin:0;font-size:14.5px;font-weight:700}
.sec-h span{font-size:12px;color:var(--muted)}
.tbl{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums;border-top:1.6px solid var(--rule);border-bottom:1.6px solid var(--rule)}
th{padding:9px 8px;border-bottom:1px solid var(--rule);font-size:12px;font-weight:700;color:var(--sub);text-align:right;white-space:nowrap}
td{padding:10px 8px;border-bottom:1px solid var(--hair);text-align:right;white-space:nowrap}
th.l,td.l{text-align:left;padding-left:2px}
td.l{font-weight:500;white-space:normal;word-break:keep-all}
tr.adj td{color:var(--muted)}
tr.sum td{font-weight:700;border-top:1px solid var(--rule);border-bottom:0}
tr.sum + tr.sum td{border-top:1px solid var(--hair)}
.src{margin:7px 0 0;font-size:11.5px;color:var(--muted);text-align:right}
.arts{margin:32px 0 0}
.art + .art{margin-top:18px}
.art h3{margin:0;font-size:14.5px;font-weight:700}
.art h3 .no{color:var(--blue);margin-right:6px}
.art p{margin:7px 0 0;font-size:14.5px;line-height:1.8}
.art p.cl{margin-top:4px;padding-left:1.4em;text-indent:-1.4em}
.closing{margin:34px 0 0;text-align:center;font-size:14.5px;line-height:1.8}
.issuer{margin:26px 0 0;text-align:center}
.issuer .date{font-size:16px;letter-spacing:.04em}
.issuer .ceo{margin-top:26px;font-size:18px;letter-spacing:.04em}
.issuer .ceo b{font-weight:600;letter-spacing:.06em;margin-right:10px}
.issuer .mgr{margin-top:24px;font-size:13px;color:var(--sub)}
.seal{position:relative;display:inline-block;margin-left:14px;color:#8a929c;font-size:15px;letter-spacing:0}
.seal img{position:absolute;left:50%;top:50%;width:64px;height:64px;transform:translate(-35%,-50%) rotate(-4deg)}
.seal.ph::after{content:'';position:absolute;left:50%;top:50%;width:54px;height:54px;border:1.5px dashed #c0c6ce;border-radius:50%;transform:translate(-50%,-50%)}
.doc-foot{position:absolute;left:64px;right:64px;bottom:34px;margin:0;padding-top:10px;border-top:1px solid var(--hair);font-size:11px;line-height:1.6;color:var(--muted);text-align:center;word-break:keep-all}
.foot{max-width:826px;margin:0 auto;padding:0 16px 40px;font-size:13px;color:var(--muted);line-height:1.7}
.foot p{margin:0}
.foot a{color:inherit}
@media screen and (max-width:640px){
  .top-actions{width:100%}
  .top-actions .btn{flex:1}
  .sheet{min-height:0;padding:26px 20px 24px}
  .lh{flex-direction:column;align-items:flex-start;gap:12px}
  .lh-brand img{height:22px}
  .lh-right,.lh-meta{text-align:left}
  .title{margin-top:30px;font-size:21px;letter-spacing:.03em}
  .subtitle{font-size:9.5px;letter-spacing:.2em}
  .pre{margin-top:24px;font-size:14px}
  .terms{grid-template-columns:auto 1fr}
  .terms dd{padding-right:0}
  table{font-size:13px}
  th.opt,td.opt{display:none}
  .art p{font-size:14px}
  .closing{font-size:14px}
  .doc-foot{position:static;margin-top:32px}
}
@page{size:A4;margin:14mm 0 16mm}
@page :first{margin:0}
@media print{
  body{background:#fff}
  .top,.foot{display:none!important}
  .sheet-wrap{padding:0}
  .sheet{width:210mm;max-width:none;min-height:297mm;margin:0;padding:11mm 20mm 19mm;box-shadow:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .lh{padding-bottom:3.4mm;border-bottom-width:.9pt;gap:6mm}
  .lh-brand{gap:3mm}
  .lh-brand img{height:7mm}
  .lh-div{height:4.6mm}
  .lh-tag{font-size:8.6pt}
  .lh-meta{font-size:7.6pt;gap:.4mm 2.6mm}
  .stamp{font-size:8pt;padding:.3mm 1mm .3mm 2mm;margin-bottom:1.6mm}
  .title{margin-top:7mm;font-size:20pt}
  .subtitle{margin-top:1.6mm;font-size:6.8pt}
  .pre{margin-top:5.5mm;font-size:10pt;line-height:1.7}
  .terms{margin-top:5mm;border-top-width:.9pt}
  .terms dt,.terms dd{padding:1.7mm 0;border-bottom-width:.5pt}
  .terms dt{padding-right:4mm;font-size:8pt}
  .terms dd{padding-right:5mm;font-size:9pt}
  .terms small{margin-top:.4mm;font-size:7.4pt}
  .sec-h{margin:5.5mm 0 1.8mm}
  .sec-h h3{font-size:9.6pt}
  .sec-h span{font-size:7.4pt}
  .tbl{overflow:visible}
  table{font-size:8.8pt;border-top-width:1.1pt;border-bottom-width:1.1pt}
  th{padding:1.9mm 1.8mm;font-size:7.8pt;border-bottom-width:.6pt}
  td{padding:1.9mm 1.8mm;border-bottom-width:.5pt}
  tr.sum td{border-top-width:.6pt}
  .src{margin-top:1.5mm;font-size:7.2pt}
  .arts{margin-top:5.5mm}
  .art + .art{margin-top:3.2mm}
  .art h3{font-size:9.6pt}
  .art p{margin-top:1.1mm;font-size:9.8pt;line-height:1.6}
  .art p.cl{margin-top:.8mm}
  .closing{margin-top:5mm;font-size:9.8pt}
  .issuer{margin-top:4.5mm}
  .issuer .date{font-size:10.5pt}
  .issuer .ceo{margin-top:4.6mm;font-size:11.5pt}
  .issuer .ceo b{margin-right:2.6mm}
  .issuer .mgr{margin-top:3.6mm;font-size:8.6pt}
  .seal{margin-left:3.4mm;font-size:10pt}
  .seal img{width:16.5mm;height:16.5mm}
  .seal.ph::after{width:13.5mm;height:13.5mm}
  .doc-foot{left:20mm;right:20mm;bottom:9mm;padding-top:2mm;border-top-width:.5pt;font-size:7pt}
  .compact .title{margin-top:5mm;font-size:18pt}
  .compact .subtitle{margin-top:1.2mm}
  .compact .pre{margin-top:4mm;line-height:1.6}
  .compact .terms{margin-top:3.6mm}
  .compact .terms dt,.compact .terms dd{padding:1.3mm 0}
  .compact .terms small{display:none}
  .compact .sec-h{margin:4mm 0 1.4mm}
  .compact th{padding:1.2mm 1.8mm}
  .compact td{padding:1.1mm 1.8mm}
  .compact .src{margin-top:1.2mm}
  .compact .arts{margin-top:4mm}
  .compact .art + .art{margin-top:2.4mm}
  .compact .art p{margin-top:.8mm;font-size:9.4pt;line-height:1.5}
  .compact .art p.cl{margin-top:.4mm}
  .compact .closing{margin-top:4mm;font-size:9.4pt}
  .compact .issuer{margin-top:3mm}
  .compact .issuer .ceo{margin-top:3.6mm}
  .compact .issuer .mgr{margin-top:3mm}
}`;

function tableHtml(doc: MouDoc, sample: boolean): string {
  if (doc.mode === 'items') {
    const head = '<tr><th class="l" style="width:26%">품명</th><th>1대 단가</th><th style="width:10%">수량</th><th class="opt">공급가액</th><th class="opt">세액</th><th>합계</th></tr>';
    const body = doc.rows
      .map(
        (r) =>
          `<tr><td class="l">${escapeHtml(r.name)}</td><td>${money(r.unitPrice, sample)}</td><td>${r.quantity}</td>` +
          `<td class="opt">${money(r.supply, sample)}</td><td class="opt">${money(r.tax, sample)}</td><td>${money(r.total, sample)}</td></tr>`,
      )
      .join('');
    const qty = doc.rows.reduce((s, r) => s + r.quantity, 0);
    const supply = doc.rows.reduce((s, r) => s + (r.supply || 0), 0);
    const tax = doc.rows.reduce((s, r) => s + (r.tax || 0), 0);
    const adj = doc.rounding > 0
      ? `<tr class="adj"><td class="l">단수 정리</td><td></td><td></td><td class="opt"></td><td class="opt"></td><td>−${money(doc.rounding, sample)}</td></tr>`
      : '';
    const sum = `<tr class="sum"><td class="l">합계</td><td></td><td>${qty}</td><td class="opt">${money(supply, sample)}</td><td class="opt">${money(tax, sample)}</td><td>${money(doc.amount, sample)}</td></tr>`;
    return `<table><thead>${head}</thead><tbody>${body}${adj}${sum}</tbody></table>`;
  }
  const rows = doc.rows.length > 0 ? doc.rows : [{ name: '에어컨 전문세척', quantity: 0 }];
  const body = rows.map((r) => `<tr><td class="l">${escapeHtml(r.name)}</td><td>${r.quantity > 0 ? r.quantity : '-'}</td></tr>`).join('');
  const qty = rows.reduce((s, r) => s + r.quantity, 0);
  const sum = qty > 0 ? `<tr class="sum"><td class="l">합계</td><td>${qty}</td></tr>` : '';
  const last = doc.mode === 'total'
    ? `<tr class="sum"><td class="l">지난 작업 금액 (VAT 포함)</td><td>${money(doc.amount, sample)}원</td></tr>`
    : '<tr class="sum"><td class="l">보장 단가</td><td>지난 작업 견적과 같은 단가</td></tr>';
  return `<table><thead><tr><th class="l">품명</th><th style="width:30%">수량</th></tr></thead><tbody>${body}${sum}${last}</tbody></table>`;
}

function sourceText(doc: MouDoc, sample: boolean): string {
  if (sample) return '견본 — 실제 협약서에는 지난 견적서의 품목별 1대 단가가 들어갑니다.';
  if (doc.mode === 'items') return doc.quoteDate ? `${dotDate(doc.quoteDate)} 견적서 기준` : '지난 견적서 기준';
  if (doc.mode === 'total') return '지난 작업의 설비·수량과 금액 기준';
  return '지난 작업의 설비·수량 기준';
}

// 조항 — 원래 협약서의 뜻 그대로, 계약서 문체로 다듬은 문구 (11-14 사용자 승인)
function articlesHtml(doc: MouDoc): string {
  const first =
    doc.mode === 'items'
      ? '보장 단가는 위 표와 같으며, 작업일부터 1년간 적용한다.'
      : doc.mode === 'total'
        ? '보장 단가는 위 표의 설비·수량 기준 지난 작업 금액과 같으며, 작업일부터 1년간 적용한다.'
        : '보장 단가는 지난 작업의 견적 단가와 같으며, 작업일부터 1년간 적용한다.';
  const art = (no: number, title: string, body: string) =>
    `<section class="art"><h3><span class="no">제${no}조</span>(${title})</h3>${body}</section>`;
  const cl = (mark: string, text: string) => `<p class="cl serif">${mark} ${text}</p>`;
  return `<div class="arts">
${art(1, '목적', '<p class="serif">본 협약은 회사와 고객 간 에어컨 전문세척 서비스의 단가를 일정 기간 유지함으로써 상호 신뢰를 높이고 안정적인 시설 관리를 돕는 것을 목적으로 한다.</p>')}
${art(2, '보장 단가와 적용 범위', cl('①', first) + cl('②', '에어컨 수량이 15% 이상 달라지면 별도로 견적한다.'))}
${art(3, '기간과 효력', cl('①', '본 협약은 보장 기간 동안 유효하며, 끝나기 1개월 전에 협의하여 연장할 수 있다.') + cl('②', '본 협약은 상호 신뢰에 기초한 양해각서로, 법적 구속력은 없다.'))}
</div>`;
}

function sheetHtml(doc: MouDoc, opts: RenderOptions): string {
  // 표 줄이 많으면 간격을 줄인다 — A4 한 장에 품목 10줄까지 (그보다 많으면 두 장)
  const tableRows = doc.mode === 'items'
    ? doc.rows.length + (doc.rounding > 0 ? 1 : 0) + 1
    : Math.max(doc.rows.length, 1) + (doc.rows.some((r) => r.quantity > 0) ? 1 : 0) + 1;
  const compact = tableRows > COMPACT_FROM;
  const seal = opts.sealUri
    ? `<span class="seal">(인)<img src="${opts.sealUri}" alt=""></span>`
    : `<span class="seal${opts.sample ? ' ph' : ''}">(인)</span>`;
  const mgr = doc.manager && doc.manager.name
    ? `담당 ${escapeHtml(doc.manager.name)}${doc.manager.position ? ` ${escapeHtml(doc.manager.position)}` : ''}`
    : `대표전화 ${COMPANY.phone}`;
  const meta = [
    doc.no ? `<dt>협약번호</dt><dd>${escapeHtml(doc.no)}</dd>` : '',
    `<dt>발행일</dt><dd>${dotDate(doc.issuedAt)}</dd>`,
  ].join('');
  const unit = doc.mode === 'items' ? '단위: 원 · VAT 포함' : '수량 단위: 대';
  return `<article class="sheet${compact ? ' compact' : ''}">
<header class="lh">
<div class="lh-brand"><img src="data:image/png;base64,${LOGO_COLOR_PNG}" alt="AIRTOR 에어터"><span class="lh-div"></span><span class="lh-tag">에어컨 위생파트너</span></div>
<div class="lh-right">${opts.sample ? '<span class="stamp">견본</span>' : ''}<dl class="lh-meta">${meta}</dl></div>
</header>
<h2 class="title serif">에어컨 전문세척 단가보장 협약서</h2>
<p class="subtitle">PRICE GUARANTEE AGREEMENT · MOU</p>
<p class="pre serif">${COMPANY.short}(이하 “회사”)는 ${escapeHtml(doc.company)}(이하 “고객”)의 쾌적한 업무환경과 비용 안정을 위하여 다음과 같이 에어컨 전문세척 단가를 보장한다.</p>
<dl class="terms">
<dt>공급자</dt><dd>${COMPANY.name}<small>사업자등록번호 ${COMPANY.bizNo}</small></dd>
<dt>고객</dt><dd>${escapeHtml(doc.company)}</dd>
<dt>작업일</dt><dd>${dotDate(doc.workDate)}</dd>
<dt>보장 기간</dt><dd>${dotDate(doc.workDate)} ~ ${dotDate(doc.validUntil)}<small>작업일부터 1년</small></dd>
</dl>
<div class="sec-h"><h3>보장 단가표</h3><span>${unit}</span></div>
<div class="tbl">${tableHtml(doc, opts.sample)}</div>
<p class="src">${escapeHtml(sourceText(doc, opts.sample))}</p>
${articlesHtml(doc)}
<p class="closing serif">회사는 위 내용을 성실히 이행할 것을 확인하며 본 협약서를 발행한다.</p>
<div class="issuer serif">
<div class="date">${longDate(doc.issuedAt)}</div>
<div class="ceo"><b>${COMPANY.name}</b>대표이사${seal}</div>
<div class="mgr">${mgr}</div>
</div>
<p class="doc-foot">${COMPANY.name} · ${COMPANY.address} · 사업자등록번호 ${COMPANY.bizNo} · 대표전화 ${COMPANY.phone} · ${COMPANY.web}</p>
</article>`;
}

export function renderMouHtml(doc: MouDoc, opts: RenderOptions): string {
  const title = `${escapeHtml(doc.company)} 단가보장 협약서${opts.sample ? ' (견본)' : ''} · 에어터`;
  const head = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${title}</title>
${opts.mode === 'screen' ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Noto+Serif+KR:wght@400;600&display=swap">' : ''}
<style>${STYLE}</style>
</head>`;
  if (opts.mode === 'pdf') return `${head}\n<body>\n${sheetHtml(doc, opts)}\n</body>\n</html>`;

  const pdfHref = `/mou/${encodeURIComponent(opts.id)}.pdf`;
  const notice = opts.pdfFailed
    ? `<p class="notice" role="status">PDF 파일을 바로 만들지 못했습니다. [인쇄]를 누른 뒤 인쇄 창에서 'PDF로 저장'을 고르시면 같은 협약서를 받으실 수 있습니다.</p>`
    : '';
  const expires = opts.expiresOn && isYmd(opts.expiresOn) ? `<p>이 주소는 ${dotDate(opts.expiresOn)}까지 열립니다. 내부 보고에 쓰시도록 다른 분께 전달하셔도 됩니다.</p>` : '';
  return `${head}
<body>
<header class="top">
<div class="top-text"><h1 class="top-title">단가보장 협약서${opts.sample ? ' (견본)' : ''}</h1><p class="top-meta">${escapeHtml(doc.company)} · 적용 기간 ${dotDate(doc.workDate)} ~ ${dotDate(doc.validUntil)}</p></div>
<div class="top-actions"><a class="btn primary" href="${pdfHref}">PDF 내려받기</a><button class="btn" type="button" id="print-btn">인쇄</button></div>
${notice}
</header>
<main class="sheet-wrap">
${sheetHtml(doc, opts)}
</main>
<footer class="foot">
<p>문의 1644-1295 · <a href="mailto:relation@airtor.co.kr">relation@airtor.co.kr</a></p>
${expires}
<p>에어컨 위생파트너 ㈜에어터</p>
</footer>
<script nonce="${opts.nonce || ''}">document.getElementById('print-btn').addEventListener('click',function(){window.print();});</script>
</body>
</html>`;
}

export type MouErrorKind = 'notfound' | 'expired' | 'missing';

export function renderMouError(kind: MouErrorKind): string {
  const reason =
    kind === 'expired'
      ? '열람 기간이 지난 협약서입니다.'
      : kind === 'missing'
        ? '메일에 협약서 주소가 제대로 들어가지 않았습니다.'
        : '주소가 올바르지 않거나 더 이상 열 수 없는 협약서입니다.';
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>협약서를 열 수 없습니다 · 에어터</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#eef1f5;color:#1f2329;font-family:'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR','Noto Sans CJK KR',sans-serif}
main{max-width:560px;margin:0 auto;padding:56px 16px}
img{display:block;height:26px;width:auto}
h1{margin:28px 0 0;font-size:22px;letter-spacing:-0.3px}
p{margin:12px 0 0;font-size:15px;line-height:1.7;color:#3a4250}
</style>
</head>
<body>
<main>
<img src="data:image/png;base64,${LOGO_COLOR_PNG}" alt="AIRTOR 에어터">
<h1>협약서를 열 수 없습니다</h1>
<p>${reason}</p>
<p>받으신 메일에 '협약서'라고 회신하시거나 1644-1295로 연락 주시면 1영업일 안에 다시 보내 드립니다.</p>
</main>
</body>
</html>`;
}

export function htmlHeaders(nonce?: string): Record<string, string> {
  const csp = [
    "default-src 'none'",
    'img-src data:',
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    nonce ? `script-src 'nonce-${nonce}'` : "script-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': csp,
  };
}

export function pdfHeaders(doc: MouDoc, size?: number): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="airtor-mou.pdf"; filename*=UTF-8''${encodeURIComponent(mouFileName(doc))}`,
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
  if (size !== undefined) h['Content-Length'] = String(size);
  return h;
}

// ─── 직인·PDF ───────────────────────────────────────────────────────────

let sealCache: { uri: string | null; at: number } | null = null;

/** R2 의 직인 그림 → data: URI (isolate 안에서 10분 캐시). 없거나 못 읽으면 null → (인) 만 */
export async function loadSealUri(env: MouEnv): Promise<string | null> {
  if (sealCache && Date.now() - sealCache.at < 600_000) return sealCache.uri;
  let uri: string | null = null;
  try {
    const obj = env.FILES ? await env.FILES.get(SEAL_R2_KEY) : null;
    if (obj) {
      const bytes = new Uint8Array(await obj.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      uri = `data:image/png;base64,${btoa(bin)}`;
    }
  } catch {
    uri = null;
  }
  sealCache = { uri, at: Date.now() };
  return uri;
}

/** Cloudflare Browser Run REST /pdf — 인쇄용 HTML 을 A4 PDF 로. 실패하면 예외 */
export async function renderPdf(env: MouEnv, html: string): Promise<ArrayBuffer> {
  if (!env.BROWSER_RUN_TOKEN || !env.CF_ACCOUNT_ID) throw new Error('BROWSER_RUN_TOKEN·CF_ACCOUNT_ID 미설정');
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/browser-run/pdf`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.BROWSER_RUN_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html,
      pdfOptions: { format: 'a4', printBackground: true, preferCSSPageSize: true },
      gotoOptions: { waitUntil: 'load', timeout: 30_000 },
    }),
  });
  const buf = await res.arrayBuffer();
  const magic = String.fromCharCode(...new Uint8Array(buf.slice(0, 5)));
  if (!res.ok || magic !== '%PDF-') {
    const detail = magic === '%PDF-' ? '' : new TextDecoder().decode(buf.slice(0, 300)).replace(/\s+/g, ' ');
    throw new Error(`Browser Run HTTP ${res.status} ${detail}`.trim());
  }
  return buf;
}

export function pdfR2Key(id: string): string {
  return `mou/${MOU_VERSION}/${id}.pdf`;
}

export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
