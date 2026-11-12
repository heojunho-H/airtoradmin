// 문의 유입 경로 — 홈페이지(airtor-homepage site/inc/src_lib.php)가 문의 제출 때 요청사항 끝에 붙이는
// '[유입: 네이버 광고 · 시스템에어컨 청소 · 11-12 방문]' 표시를 읽는다. 2026-11-12 적용 뒤 문의부터 있다.
// 표시 종류: 구글 광고 · 구글 검색 · 네이버 광고 · 네이버 검색 · 네이버 블로그/카페/지도/기타 · 다음 검색 · 빙 검색 ·
// UTM … · 다른 사이트(도메인) · 직접/알 수 없음. 검색어·도메인은 홈페이지가 영문을 대문자로 바꿔 보낸다(방화벽 때문).

export interface Inflow {
  /** 구글 광고, 네이버 검색 … 직접/알 수 없음 */
  label: string;
  /** 검색어, 또는 '다른 사이트'면 도메인(소문자) */
  keyword?: string;
  /** 들어온 날 MM-DD */
  date?: string;
}

const MARK_RE = /\s*\[유입: ([^\]]*)\]/;

export function parseInflow(text: unknown): Inflow | null {
  if (typeof text !== 'string' || !text.includes('[유입: ')) return null;
  const m = MARK_RE.exec(text);
  if (!m) return null;
  const parts = m[1].split(' · ').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const out: Inflow = { label: parts[0] };
  for (const p of parts.slice(1)) {
    const d = /^(\d{2}-\d{2}) 방문$/.exec(p);
    if (d) out.date = d[1];
    else if (!out.keyword) out.keyword = out.label === '다른 사이트' ? p.toLowerCase() : p;
  }
  return out;
}

/** 요청사항에서 유입 표시를 뺀 글 — 상세 '세부 전달사항' 보기용(편집칸에는 원문을 둔다) */
export function stripInflow(text: unknown): string {
  return typeof text === 'string' ? text.replace(MARK_RE, '').trim() : '';
}

/** 한 줄 글 — 엑셀·툴팁용 */
export function inflowText(inflow: Inflow | null): string {
  if (!inflow) return '';
  return [inflow.label, inflow.keyword, inflow.date ? `${inflow.date} 방문` : ''].filter(Boolean).join(' · ');
}
