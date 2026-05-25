// detailedQuantity JSON 문자열을 사람 읽기 좋은 한 줄로 변환.
//
// 입력 예: '{"categories":{"1way 천정형":22,"4way 천정형":2},"others":[]}'
// 출력 예: '1way 천정형 22, 4way 천정형 2'
//
// categories가 비어 있고 others만 있으면 others 항목을 콤마로 이어 붙임.
// JSON 파싱 실패 시: 80자 이내 원본 그대로(이미 사람 읽기 좋은 형태일 수 있음), 초과면 빈 문자열.

export function formatDetailedQuantity(detailedQuantity: string | null | undefined): string {
  if (!detailedQuantity) return '';
  const trimmed = detailedQuantity.trim();
  if (!trimmed) return '';

  // JSON 형태가 아닌 경우 빠른 패스 — 그대로(짧으면) 반환
  if (trimmed[0] !== '{' && trimmed[0] !== '[') {
    return trimmed.length > 80 ? '' : trimmed;
  }

  try {
    const parsed = JSON.parse(trimmed);
    const parts: string[] = [];

    if (parsed && typeof parsed === 'object' && 'categories' in parsed) {
      const cats = (parsed as { categories?: Record<string, unknown> }).categories;
      if (cats && typeof cats === 'object') {
        for (const [key, raw] of Object.entries(cats)) {
          const n = Number(raw);
          if (Number.isFinite(n) && n > 0) parts.push(`${key} ${n}`);
        }
      }
    }

    if (parsed && typeof parsed === 'object' && 'others' in parsed) {
      const others = (parsed as { others?: unknown }).others;
      if (Array.isArray(others)) {
        for (const item of others) {
          if (typeof item === 'string' && item.trim()) parts.push(item.trim());
          else if (typeof item === 'number' && Number.isFinite(item)) parts.push(String(item));
        }
      }
    }

    return parts.join(', ');
  } catch {
    return trimmed.length > 80 ? '' : trimmed;
  }
}
