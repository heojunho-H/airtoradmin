// 회사명 정규화 — 표기 변형 매칭용
// "(주) 플리", "주식회사 플리", " 플리 " → "플리"
// 서버 사본: api/deals_api.php normalizeCompanyName() — 두 곳을 동일하게 유지할 것
export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return '';
  let s = name.trim();
  const patterns: RegExp[] = [
    /주식회사\s*/g, /\(주\)\s*/g,
    /유한회사\s*/g, /\(유\)\s*/g,
    /사단법인\s*/g, /\(사\)\s*/g,
    /재단법인\s*/g, /\(재\)\s*/g,
    /의료법인\s*/g, /\(의\)\s*/g,
    /학교법인\s*/g, /\(학\)\s*/g,
  ];
  for (const p of patterns) s = s.replace(p, '');
  return s.replace(/\s+/g, '');
}

// 두 회사명이 같은 회사를 지칭하는지 (정규화 비교)
export function isSameCompany(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCompanyName(a);
  return na !== '' && na === normalizeCompanyName(b);
}
