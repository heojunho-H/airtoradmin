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
import { LOGO_COLOR_PNG, MOU_BAR_JPG, MOU_BULLET_PNG, MOU_HANDSHAKE_PNG, MOU_LOGO_WHITE_PNG } from './mou-assets';

export const DEFAULT_MOU_BASE_URL = 'https://docs.airtor.co.kr';
/** 서식을 바꾸면 올린다 — R2 의 PDF 캐시 키가 바뀌어 새 서식으로 다시 만든다 */
export const MOU_VERSION = 'v5';
export const SEAL_R2_KEY = 'brand/mou-seal.png';
/** 대표이사 손글씨 서명·작업자 사진 (원래 협약서 그림) — 공개 저장소에 두지 않는다 */
export const SIGN_R2_KEY = 'brand/mou-sign.png';
export const PHOTO_R2_KEY = 'brand/mou-photo.png';
/** 적용 기간이 끝난 뒤에도 링크를 여는 날 수 */
export const MOU_GRACE_DAYS = 30;
const ID_RE = /^[A-Za-z0-9_-]{22}$/;

export interface MouEnv {
  AI_DB?: D1Database;
  FILES?: R2Bucket;
  /** PDF Worker (Service binding → airtoradmin-pdf, workers/pdf-renderer) — 토큰 없이 Browser Run 바인딩으로 PDF 를 만든다 */
  PDF_RENDERER?: Fetcher;
  /** (바인딩이 없을 때만) Cloudflare API 토큰 (권한: Account · Browser Run · Edit) — REST 로 PDF 만들기 */
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
  /** R2 그림(data: URI). 없으면 그 자리만 비운다 — 견본은 사진만 */
  assets: BrandAssets;
  /** screen 의 인쇄 버튼 스크립트 nonce */
  nonce?: string;
  /** PDF 만들기에 실패해 돌아왔을 때 */
  pdfFailed?: boolean;
  /** 링크가 열리는 마지막 날 */
  expiresOn?: string;
}

// 표 줄(머리 + 품목, 대수 표는 + 금액 줄)이 이보다 많으면 조항 간격을 줄인다 — 장수 점검으로 정한 값.
// 품명이 길어 두 줄로 접히는 품목은 두 줄로 센다 (원래 간격으로 짧은 품목 7줄, 긴 품목 4줄까지 한 장)
const COMPACT_FROM = 8;
const rowWeight = (name: string) => (Array.from(name).length > 14 ? 2 : 1);

// 협약서에 적는 회사 정보 — 홈페이지 맨 아래(foot.php)와 같은 공개 정보
const COMPANY = {
  name: '주식회사 에어터',
  short: '㈜에어터',
  bizNo: '691-86-02152',
  address: '서울특별시 강남구 논현로10길 30',
  phone: '1644-1295',
  web: 'www.airtor.co.kr',
};

// 원래 협약서(파워포인트 A4)를 mm 단위로 그대로 옮긴 서식 — 화면(PC)과 PDF 가 같은 A4 를 쓴다.
// 위치·크기는 원본 슬라이드 좌표(EMU/36000)에서, 글꼴은 보낸 PDF 와 같은 맑은 고딕(없으면 Noto Sans), 자간 −1pt.
const STYLE = `
:root{--ink:#000;--line:#000;--head:#dce6f2;--bg:#eef1f5;--blue:#1a4c9c}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Malgun Gothic','맑은 고딕','Noto Sans KR','Noto Sans CJK KR','Apple SD Gothic Neo',sans-serif}
.top{max-width:826px;margin:0 auto;padding:24px 16px 16px;display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px}
.top-text{flex:1 1 260px;min-width:0}
.top-title{margin:0;font-size:20px;font-weight:700;letter-spacing:-0.3px;word-break:keep-all}
.top-meta{margin:4px 0 0;font-size:14px;color:#3a4250;word-break:keep-all}
.top-actions{display:flex;gap:8px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:8px;border:1px solid #c4ccd6;background:#fff;color:#1f2329;font:inherit;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer}
.btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}
.btn:focus-visible{outline:3px solid #8fb3e8;outline-offset:2px}
.notice{flex-basis:100%;margin:0;font-size:14px;line-height:1.6;color:#8a3b12}
.foot{max-width:826px;margin:0 auto;padding:0 16px 40px;font-size:13px;color:#6b7480;line-height:1.7}
.foot p{margin:0}
.foot a{color:inherit}
.sheet-wrap{padding:0 16px 24px}
.sheet{position:relative;display:flex;flex-direction:column;width:210mm;min-height:297mm;margin:0 auto;overflow:hidden;background:#fff;box-shadow:0 1px 3px rgba(16,24,40,.12);font-size:11pt;line-height:1.6;letter-spacing:-1pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bar{position:relative;flex:0 0 auto;height:22.6mm;background:#1b1f2a url("data:image/jpeg;base64,${MOU_BAR_JPG}") center/cover no-repeat}
.bar .logo{position:absolute;left:50%;top:7.2mm;width:36.6mm;height:auto;transform:translateX(-50%)}
.stamp{position:absolute;right:8mm;top:50%;transform:translateY(-50%);border:1.2pt solid #ff6b6b;color:#ff8a8a;font-size:9pt;font-weight:700;letter-spacing:2pt;padding:.6mm 1.6mm .6mm 2.4mm}
.title{margin:11mm 0 0;text-align:center;font-size:20pt;font-weight:400;line-height:1.3}
.title b{font-weight:700}
.intro{margin:3.2mm 22.6mm 0;text-align:center;font-size:11pt;line-height:1.6}
.intro b{display:block;letter-spacing:0}
.rule{flex:0 0 auto;height:.7mm;margin:7.6mm 20.5mm 0 21.2mm;background:linear-gradient(90deg,#15a7a6 0%,#0e85a5 25%,#1e918a 50%,#33a754 75%,#5dd557 100%)}
.cap{display:flex;justify-content:space-between;gap:4mm;margin:4.6mm 15.9mm 1mm 16.2mm;font-size:8pt;letter-spacing:-.3pt;line-height:1.4}
.tbl{margin:0 15.9mm 0 16.2mm}
.price{width:100%;border-collapse:collapse;font-size:8pt;line-height:1.3;letter-spacing:0;font-variant-numeric:tabular-nums}
.price th,.price td{border:.6pt solid var(--line);padding:.75mm 1.6mm;white-space:nowrap}
.price th{background:var(--head);font-size:7.4pt;font-weight:700;text-align:center}
.price td{text-align:center}
.price td.l{font-weight:700;white-space:normal;word-break:keep-all}
.price td.r{text-align:right}
.price td.t{text-align:right;font-weight:700}
.price tr.sum td{background:var(--head);font-weight:700}
.arts{margin:6.2mm 20mm 0 21.2mm}
.art + .art{margin-top:6.4mm}
.art h3{display:flex;align-items:center;gap:2.1mm;margin:0;font-size:12pt;font-weight:700;line-height:1.3}
.art h3 img{flex:0 0 auto;width:3.9mm;height:3.9mm}
.art .body{margin:3.4mm 0 0 6mm}
.art p{margin:0;word-break:keep-all;overflow-wrap:anywhere}
.art p.cl{padding-left:1.3em;text-indent:-1.3em}
.bottom{position:relative;flex:0 0 auto;margin-top:auto;padding:0 0 20.8mm}
.bottom .rule{margin-top:7mm;position:relative;z-index:1}
/* 작업자 사진: 오른쪽 아래 모서리 — 맺음·발행일·서명·직인과 겹치지 않게. 모자 로고는 원본 비율 위치를 따라간다 */
.person{position:absolute;right:0;bottom:0;width:66mm;z-index:0;pointer-events:none}
.person .photo{display:block;width:100%;height:auto;opacity:.3}
.person .cap-logo{position:absolute;left:84.7%;top:18.9%;width:7.2%;height:auto;opacity:.4;transform:translate(-50%,-50%) rotate(50deg)}
.closing{position:relative;z-index:1;margin:9.5mm 16mm 0;text-align:center;word-break:keep-all}
.issued{position:relative;z-index:1;margin:7.8mm 0 0;text-align:center;font-size:12pt}
.sig{position:relative;z-index:1;width:52.9mm;margin:6mm auto 0}
.sig-area{position:relative;height:12mm;border-bottom:.75pt solid var(--ink)}
.sign{position:absolute;left:14.1mm;top:3.6mm;width:20.5mm;height:6.5mm;object-fit:contain}
.sign.ph{border:.6pt dashed #c0c6ce;color:#a0a7b0;font-size:8pt;letter-spacing:0;display:flex;align-items:center;justify-content:center}
.in{position:absolute;left:42.3mm;top:5.3mm;width:13.8mm;text-align:center;font-size:11pt;line-height:1.2;letter-spacing:0;color:#000}
.seal{position:absolute;left:41.6mm;top:1.1mm;width:15.5mm;height:15.5mm}
.seal.ph{border:1.2pt dashed #c0c6ce;border-radius:50%}
.ceo{margin:3.3mm 0 0;text-align:center;font-size:13pt;font-weight:700;line-height:1.3;white-space:nowrap}
.ceo small{font-size:10pt}
.mgr{margin:.6mm 0 0;text-align:center;font-size:11pt;line-height:1.4;white-space:nowrap}
.mgr b{font-weight:700;margin-right:1.2mm}
.mou{position:absolute;left:23.3mm;top:56.4mm;width:43.4mm;text-align:center;z-index:1}
.mou img{display:block;width:15.5mm;height:auto;margin:0 auto}
.mou span{display:block;margin-top:.4mm;font-size:8pt;line-height:1.2}
.mou small{display:block;margin-top:.6mm;font-size:6.5pt;letter-spacing:0;color:#555}
.compact .title{margin-top:8mm}
.compact .rule{margin-top:5.4mm}
.compact .cap{margin-top:3.4mm}
.compact .arts{margin-top:4.4mm}
.compact .art + .art{margin-top:3.6mm}
.compact .art .body{margin-top:1.6mm}
.compact .art p{line-height:1.45}
.compact .bottom .rule{margin-top:5mm}
.compact .closing{margin-top:6mm}
.compact .issued{margin-top:5mm}
.compact .bottom{padding-bottom:15mm}
.compact .mou{top:46mm}
.compact .person{width:58mm}
@media screen and (max-width:860px){
  .sheet-wrap{padding:0 0 24px}
  .sheet{width:auto;min-height:0;font-size:14px;letter-spacing:-.04em}
  .bar{height:64px}
  .bar .logo{top:17px;width:112px}
  .stamp{right:10px;font-size:11px;padding:2px 5px 2px 8px}
  .title{margin:26px 16px 0;font-size:22px}
  .intro{margin:10px 16px 0;font-size:14px}
  .rule{height:2px;margin:22px 16px 0}
  .cap{flex-direction:column;gap:2px;margin:16px 16px 6px;font-size:12px}
  .tbl{margin:0 16px;overflow-x:auto}
  .price{font-size:12.5px}
  .price th{font-size:11.5px}
  .price th,.price td{padding:6px 6px}
  .price .opt{display:none}
  .arts{margin:22px 16px 0}
  .art + .art{margin-top:20px}
  .art h3{font-size:16px;gap:8px}
  .art h3 img{width:14px;height:14px}
  .art .body{margin:8px 0 0 22px}
  .bottom{margin-top:0;padding:0 0 28px}
  .bottom .rule{margin-top:26px}
  .person,.mou{display:none}
  .closing{margin:26px 16px 0}
  .issued{margin-top:20px;font-size:16px}
  .sig{margin-top:18px}
  .ceo{font-size:17px}
  .mgr{font-size:14px}
}
@page{size:A4;margin:14mm 0}
@page :first{margin:0}
@media print{
  body{background:#fff}
  .top,.foot{display:none!important}
  .sheet-wrap{padding:0}
  .sheet{margin:0;box-shadow:none}
}`;

// 원래 협약서에 붙여 넣던 견적서 표와 같은 모양 — 품명 굵게, 단가·수량 가운데, 공급가액·세액 오른쪽, 합계 굵게 오른쪽
function tableHtml(doc: MouDoc, sample: boolean): string {
  if (doc.mode === 'items') {
    const head = '<tr><th style="width:24%">품 명</th><th style="width:22%">1대단가 산출 내역(원)</th><th style="width:9.5%">수량(EA)</th><th class="opt" style="width:13.5%">공급가액</th><th class="opt" style="width:11.5%">세액</th><th>합계</th></tr>';
    const body = doc.rows
      .map(
        (r) =>
          `<tr><td class="l">${escapeHtml(r.name)}</td><td>${money(r.unitPrice, sample)}</td><td>${r.quantity}</td>` +
          `<td class="opt r">${money(r.supply, sample)}</td><td class="opt r">${money(r.tax, sample)}</td><td class="t">${money(r.total, sample)}</td></tr>`,
      )
      .join('');
    return `<table class="price"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }
  const rows = doc.rows.length > 0 ? doc.rows : [{ name: '에어컨 전문세척', quantity: 0 }];
  const body = rows.map((r) => `<tr><td class="l">${escapeHtml(r.name)}</td><td>${r.quantity > 0 ? r.quantity : '-'}</td></tr>`).join('');
  const last = doc.mode === 'total'
    ? `<tr class="sum"><td>지난 작업 금액 (VAT 포함)</td><td class="t">${money(doc.amount, sample)}원</td></tr>`
    : '<tr class="sum"><td>보장 단가</td><td>지난 작업 견적과 같은 단가</td></tr>';
  return `<table class="price"><thead><tr><th>품 명</th><th style="width:34%">수량(EA)</th></tr></thead><tbody>${body}${last}</tbody></table>`;
}

function sourceText(doc: MouDoc, sample: boolean): string {
  if (sample) return '견본 — 실제 협약서에는 지난 견적서의 품목별 1대 단가가 들어갑니다';
  if (doc.mode === 'items') return `${doc.quoteDate ? `${dotDate(doc.quoteDate)} 견적서 기준 · ` : '지난 견적서 기준 · '}단위 : 원, VAT 포함`;
  if (doc.mode === 'total') return '지난 작업의 설비·수량과 금액 기준 · 수량 단위 : 대';
  return '지난 작업의 설비·수량 기준 · 수량 단위 : 대';
}

// 조항 — 원래 협약서의 뜻 그대로, 계약서 문체로 다듬은 문구 (11-14 사용자 승인). 제목 앞 회색 아이콘은 원본 그대로.
function articlesHtml(doc: MouDoc): string {
  const first =
    doc.mode === 'items'
      ? '보장 단가는 위 표와 같으며, 작업일부터 1년간 적용한다.'
      : doc.mode === 'total'
        ? '보장 단가는 위 표의 설비·수량 기준 지난 작업 금액과 같으며, 작업일부터 1년간 적용한다.'
        : '보장 단가는 지난 작업의 견적 단가와 같으며, 작업일부터 1년간 적용한다.';
  const icon = `<img src="data:image/png;base64,${MOU_BULLET_PNG}" alt="">`;
  const art = (no: number, title: string, body: string) => `<section class="art"><h3>${icon}제${no}조 (${title})</h3><div class="body">${body}</div></section>`;
  const cl = (mark: string, text: string) => `<p class="cl">${mark} ${text}</p>`;
  return `<div class="arts">
${art(1, '목적', '<p>본 협약은 회사와 고객 간 에어컨 전문세척 서비스의 단가를 일정 기간 유지함으로써 상호 신뢰를 높이고 안정적인 시설 관리를 돕는 것을 목적으로 한다.</p>')}
${art(2, '보장 단가와 적용 범위', cl('①', first) + cl('②', '에어컨 수량이 15% 이상 달라지면 별도로 견적한다.'))}
${art(3, '기간과 효력', cl('①', '본 협약은 보장 기간 동안 유효하며, 끝나기 1개월 전에 협의하여 연장할 수 있다.') + cl('②', '본 협약은 상호 신뢰에 기초한 양해각서로, 법적 구속력은 없다.'))}
</div>`;
}

function sheetHtml(doc: MouDoc, opts: RenderOptions): string {
  // 표가 길면 조항 간격을 줄인다 — A4 한 장에 품목 10줄까지 (그보다 많으면 두 장)
  const weight = doc.rows.reduce((s, r) => s + rowWeight(r.name), 0);
  // 기관명이 길면 서문이 한 줄 늘어난다 — 표 한 줄만큼 더 센다
  const introExtra = Array.from(doc.company).length > 12 ? 1 : 0;
  const tableRows = (doc.mode === 'items' ? weight + 1 : Math.max(weight, 1) + 2) + introExtra;
  const compact = tableRows > COMPACT_FROM;
  const a = opts.assets;
  const sign = a.sign
    ? `<img class="sign" src="${a.sign}" alt="">`
    : opts.sample ? '<span class="sign ph">서명</span>' : '';
  const seal = a.seal ? `<img class="seal" src="${a.seal}" alt="">` : opts.sample ? '<span class="seal ph"></span>' : '';
  const mgr = doc.manager && doc.manager.name
    ? `<b>담당자</b>${escapeHtml(doc.manager.name)}${doc.manager.position ? ` ${escapeHtml(doc.manager.position)}` : ''}`
    : `<b>대표전화</b>${COMPANY.phone}`;
  return `<article class="sheet${compact ? ' compact' : ''}">
<div class="bar"><img class="logo" src="data:image/png;base64,${MOU_LOGO_WHITE_PNG}" alt="AIRTOR">${opts.sample ? '<span class="stamp">견본</span>' : ''}</div>
<h2 class="title">에어컨 전문세척 <b>단가보장 협약서</b></h2>
<p class="intro">${COMPANY.short}(이하 &quot;회사&quot;)는 ${escapeHtml(doc.company)}(이하 &quot;고객&quot;)의 쾌적한 업무환경과 비용 안정을 위하여 <b>다음과 같이 에어컨 전문세척 단가를 보장한다.</b></p>
<div class="rule"></div>
<div class="cap"><span>적용 기간 ${dotDate(doc.workDate)} ~ ${dotDate(doc.validUntil)} (작업일부터 1년)</span><span>${escapeHtml(sourceText(doc, opts.sample))}</span></div>
<div class="tbl">${tableHtml(doc, opts.sample)}</div>
${articlesHtml(doc)}
<div class="bottom">
${a.photo ? `<div class="person"><img class="photo" src="${a.photo}" alt=""><img class="cap-logo" src="data:image/png;base64,${LOGO_COLOR_PNG}" alt=""></div>` : ''}
<div class="rule"></div>
<p class="closing">회사는 위 내용을 성실히 이행할 것을 확인하며 본 협약서를 발행한다.</p>
<p class="issued">${longDate(doc.issuedAt)} 발행</p>
<div class="sig">
<div class="sig-area">${sign}<span class="in">( 인 )</span>${seal}</div>
<p class="ceo"><small>(주)</small>에어터 대표이사</p>
<p class="mgr">${mgr}</p>
</div>
<div class="mou"><img src="data:image/png;base64,${MOU_HANDSHAKE_PNG}" alt=""><span>MOU</span>${doc.no ? `<small>${escapeHtml(doc.no)}</small>` : ''}</div>
</div>
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
${opts.mode === 'screen' ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap">' : ''}
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

export interface BrandAssets {
  seal: string | null;
  sign: string | null;
  photo: string | null;
}

export const NO_ASSETS: BrandAssets = { seal: null, sign: null, photo: null };

let assetCache: { v: BrandAssets; at: number } | null = null;

async function r2DataUri(env: MouEnv, key: string): Promise<string | null> {
  try {
    const obj = env.FILES ? await env.FILES.get(key) : null;
    if (!obj) return null;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:image/png;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

/** R2 의 직인·대표이사 서명·작업자 사진 → data: URI (isolate 안에서 10분 캐시). 없는 것은 null → 그 자리만 비운다 */
export async function loadBrandAssets(env: MouEnv): Promise<BrandAssets> {
  if (assetCache && Date.now() - assetCache.at < 600_000) return assetCache.v;
  const [seal, sign, photo] = await Promise.all([r2DataUri(env, SEAL_R2_KEY), r2DataUri(env, SIGN_R2_KEY), r2DataUri(env, PHOTO_R2_KEY)]);
  const v = { seal, sign, photo };
  assetCache = { v, at: Date.now() };
  return v;
}

function isPdf(buf: ArrayBuffer): boolean {
  return String.fromCharCode(...new Uint8Array(buf.slice(0, 5))) === '%PDF-';
}

/** 인쇄용 HTML → A4 PDF. PDF Worker(PDF_RENDERER 바인딩)가 있으면 그것으로, 없으면 Browser Run REST(토큰)로. 실패하면 예외 */
export async function renderPdf(env: MouEnv, html: string): Promise<ArrayBuffer> {
  if (env.PDF_RENDERER) {
    const res = await env.PDF_RENDERER.fetch('https://pdf-renderer/render', {
      method: 'POST',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: html,
    });
    const buf = await res.arrayBuffer();
    if (res.ok && isPdf(buf)) return buf;
    throw new Error(`PDF Worker HTTP ${res.status} ${new TextDecoder().decode(buf.slice(0, 200)).replace(/\s+/g, ' ')}`.trim());
  }
  if (!env.BROWSER_RUN_TOKEN || !env.CF_ACCOUNT_ID) throw new Error('PDF_RENDERER 바인딩·BROWSER_RUN_TOKEN 미설정');
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
  if (!res.ok || !isPdf(buf)) {
    const detail = isPdf(buf) ? '' : new TextDecoder().decode(buf.slice(0, 300)).replace(/\s+/g, ' ');
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
