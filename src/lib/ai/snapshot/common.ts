// AI 전문가 스냅샷 공통 도구 — 값 정리, 금액·날짜·지역 파싱, 개인정보 제거, 표 형식과 분량 예산.
// 목록은 "열:" 머리를 한 번만 쓰고 행을 " · " 로 구분한다 — 반복 라벨보다 토큰이 적다.

export const SNAPSHOT_MAX_CHARS = 100_000;

// 화면 라벨과 같게 (SalesPage · SupplyChainPage)
export const STAGE_LABELS: Record<string, string> = {
  new: '신규',
  call: '유선상담',
  'quote-sent': '견적서 발송',
  'quote-call': '유선견적상담',
  'price-negotiation': '가격조율',
  schedule: '일정조율',
  confirmed: '수주확정',
};
export const STAGE_ORDER = ['new', 'call', 'quote-sent', 'quote-call', 'price-negotiation', 'schedule', 'confirmed'];
export const RESULT_LABELS: Record<string, string> = {
  'in-progress': '진행중',
  success: '계약 성공',
  failed: '계약 실패',
  'no-quote': '미견적',
};
export const MANAGER_STATUS: Record<string, string> = { active: '근무중', vacation: '휴가', leave: '퇴사' };
export const SUB_STATUS: Record<string, string> = { available: '투입가능', busy: '업무중', unavailable: '휴가' };

// ─── 값 ────────────────────────────────────────────────────────────────

export function cell(v: unknown, max = 40): string {
  if (v === null || v === undefined || v === '') return '-';
  const s = String(v).replace(/\s+/g, ' ').replace(/·/g, ',').trim();
  if (!s) return '-';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 견적 금액(자유 입력) → 원. "₩12,500만", "₩1억", "₩1억 2,000만", "7900000".
 * 서버(deals_api.php parseQuotationAmount)는 '억'·'만' 중 하나만 있는 형태를 읽는다 — 여기서는 둘이 섞인 형태도 읽는다.
 */
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

export function manwon(won: number): string {
  if (!won) return '0원';
  const v = Math.round(won / 10_000);
  return v === 0 ? `${Math.round(won).toLocaleString('ko-KR')}원` : `${v.toLocaleString('ko-KR')}만원`;
}

export function eok(won: number): string {
  return `${(won / 100_000_000).toFixed(2)}억원`;
}

export function pct(ratio: number | null | undefined, digits = 0): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '-';
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function ratio(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

export function countBy<T>(items: T[], key: (t: T) => string, unit = '건'): string {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return (
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}${unit}`)
      .join(', ') || '없음'
  );
}

export function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return m;
}

// ─── 날짜 ──────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' 또는 'YYYY.MM.DD' → 'YYYY-MM-DD' (형식이 틀리면 '') */
export function ymd(v: unknown): string {
  if (!v || typeof v !== 'string') return '';
  const m = v.trim().match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}

function utc(ymdStr: string): Date {
  return new Date(`${ymdStr}T00:00:00Z`);
}

export function addDays(ymdStr: string, days: number): string {
  const d = utc(ymdStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** JS Date.setMonth 와 같은 넘침 규칙 (1/31 + 1개월 → 3/3) — 고객 화면 계산과 같게 */
export function addMonths(ymdStr: string, months: number): string {
  const d = utc(ymdStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function monthOf(ymdStr: string): string {
  return ymdStr.slice(0, 7);
}

/** 'YYYY-MM' 에서 n개월 전/후 */
export function shiftMonth(ym: string, n: number): string {
  const d = new Date(`${ym}-15T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

// ─── 지역 ──────────────────────────────────────────────────────────────

const SIDO: [RegExp, string][] = [
  [/^서울/, '서울'],
  [/^경기/, '경기'],
  [/^인천/, '인천'],
  [/^부산/, '부산'],
  [/^대구/, '대구'],
  [/^광주/, '광주'],
  [/^대전/, '대전'],
  [/^울산/, '울산'],
  [/^세종/, '세종'],
  [/^강원/, '강원'],
  [/^(충북|충청북)/, '충북'],
  [/^(충남|충청남)/, '충남'],
  [/^(전북|전라북|전북특별)/, '전북'],
  [/^(전남|전라남)/, '전남'],
  [/^(경북|경상북)/, '경북'],
  [/^(경남|경상남)/, '경남'],
  [/^제주/, '제주'],
];

/** 운영 권역 (작업팀장·고객책임자의 담당 지역과 같은 이름) */
export function areaOfSido(sido: string): string {
  if (['서울', '경기', '인천'].includes(sido)) return '서울 수도권';
  if (['대전', '세종', '충북', '충남'].includes(sido)) return '충청권';
  if (['부산', '대구', '울산', '경북', '경남'].includes(sido)) return '경상권';
  return sido ? '기타' : '';
}

/** 주소 → 시/도. 주소 전체는 개인정보라 시/도만 쓴다. */
export function sidoOf(address: unknown): string {
  if (!address || typeof address !== 'string') return '';
  const a = address.trim().replace(/^\(?\d{5}\)?\s*/, '');
  for (const [re, name] of SIDO) if (re.test(a)) return name;
  return '';
}

// ─── 개인정보 제거 ──────────────────────────────────────────────────────

const PHONE = /(\+?82[-.\s]?)?0\d{1,2}[-.\s)]?\d{3,4}[-.\s]?\d{4}/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** 자유 입력 메모 — 전화·이메일을 지우고 자른다 (대화는 팀 전체에 공유된다) */
export function scrub(text: unknown, max = 60): string {
  if (!text || typeof text !== 'string') return '-';
  const s = text.replace(PHONE, '[연락처]').replace(EMAIL, '[이메일]').replace(/\s+/g, ' ').trim();
  if (!s) return '-';
  return cell(s, max);
}

// ─── 수량 ──────────────────────────────────────────────────────────────

/** 장비 구성 한 줄 — 딜 JSON {"categories":{..},"others":[..]} / 고객 [{item,quantity}] 두 형태 모두 */
export function equipmentMix(detailed: unknown, max = 50): string {
  if (!detailed) return '-';
  let data: unknown = detailed;
  if (typeof detailed === 'string') {
    const t = detailed.trim();
    if (!t) return '-';
    if (t[0] !== '{' && t[0] !== '[') return cell(t, max);
    try {
      data = JSON.parse(t);
    } catch {
      return '-';
    }
  }
  const parts: string[] = [];
  if (Array.isArray(data)) {
    for (const it of data) {
      const q = num((it as { quantity?: unknown })?.quantity);
      const name = (it as { item?: unknown })?.item;
      if (name && q > 0) parts.push(`${name} ${q}`);
    }
  } else if (data && typeof data === 'object') {
    const cats = (data as { categories?: Record<string, unknown> }).categories;
    if (cats && typeof cats === 'object') for (const [k, v] of Object.entries(cats)) if (num(v) > 0) parts.push(`${k} ${num(v)}`);
    const others = (data as { others?: unknown }).others;
    if (Array.isArray(others)) {
      for (const o of others) {
        if (typeof o === 'string' && o.trim()) parts.push(o.trim());
        else if (o && typeof o === 'object') {
          const name = (o as { name?: unknown }).name;
          const q = num((o as { quantity?: unknown }).quantity);
          if (name) parts.push(q > 0 ? `${name} ${q}` : String(name));
        }
      }
    }
  }
  return parts.length ? cell(parts.join(', ').replace(/,/g, '/'), max) : '-';
}

// ─── 섹션·표·예산 ───────────────────────────────────────────────────────

export interface Table {
  label: string;
  /** 정렬 기준 설명 (예: '최근 등록순') */
  order: string;
  columns: string[];
  rows: string[][];
  limit: number;
  minRows: number;
}

export interface Section {
  title: string;
  lines: string[];
  tables: Table[];
}

export function table(label: string, order: string, columns: string[], rows: string[][], minRows = 20): Table {
  return { label, order, columns, rows, limit: rows.length, minRows: Math.min(minRows, rows.length) };
}

export function section(title: string, lines: string[], tables: Table[] = []): Section {
  return { title, lines, tables };
}

function renderTable(t: Table): string {
  if (t.rows.length === 0) return `### ${t.label}\n(없음)`;
  const shown = t.rows.slice(0, t.limit);
  const scope = shown.length < t.rows.length ? `${t.order}, 전체 ${t.rows.length}건 중 ${shown.length}건` : `${t.order}, ${t.rows.length}건`;
  return [`### ${t.label} (${scope})`, `열: ${t.columns.join(' · ')}`, ...shown.map((r) => r.join(' · '))].join('\n');
}

function renderSections(header: string, sections: Section[]): string {
  return [header, ...sections.map((s) => [`## ${s.title}`, ...s.lines, ...s.tables.map(renderTable)].join('\n'))].join('\n\n');
}

/** 예산을 넘으면 가장 긴 표부터 30%씩 줄인다 (minRows 아래로는 줄이지 않음). */
export function fitToBudget(header: string, sections: Section[], maxChars: number): { text: string; truncated: string[] } {
  let text = renderSections(header, sections);
  for (let guard = 0; guard < 40 && text.length > maxChars; guard++) {
    const tables = sections.flatMap((s) => s.tables).filter((t) => t.limit > t.minRows);
    if (tables.length === 0) break;
    const biggest = tables.reduce((a, b) => (b.limit > a.limit ? b : a));
    biggest.limit = Math.max(biggest.minRows, Math.floor(biggest.limit * 0.7));
    text = renderSections(header, sections);
  }
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n…(분량 제한으로 이후 생략)`;
  const truncated = sections
    .flatMap((s) => s.tables)
    .filter((t) => t.limit < t.rows.length)
    .map((t) => `${t.label}: 전체 ${t.rows.length}건 중 ${t.limit}건`);
  return { text, truncated };
}
