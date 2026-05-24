// 5개 역할의 코드/라벨/순서 단일 매핑.
// DB ENUM (airtor_labor_rates.role) 과 일치해야 하므로 변경 시 004 마이그레이션도 함께.

export type RoleCode = 'a_grade' | 'b_grade' | 'pin_wash' | 'dely' | 'parts_wash';

export const ROLE_ORDER: RoleCode[] = [
  'a_grade',
  'b_grade',
  'pin_wash',
  'dely',
  'parts_wash',
];

export const ROLE_LABELS: Record<RoleCode, string> = {
  a_grade: 'A급 분조',
  b_grade: 'B급 분조',
  pin_wash: '핀세척',
  dely: '딜리',
  parts_wash: '부품세척',
};

// 단가 ▲/▼ 1회 클릭 단위
export const RATE_STEP = 5000;

// 단가 범위 제약 (LaborRateCard 가드)
export const RATE_MIN = 0;
export const RATE_MAX = 9_990_000;

export function getRoleLabel(code: RoleCode): string {
  return ROLE_LABELS[code] ?? code;
}

export function isValidRole(code: string): code is RoleCode {
  return (ROLE_ORDER as string[]).includes(code);
}

// 단가표 배열을 항상 ROLE_ORDER 순서로 정렬 (카드형 UI 렌더 시 사용)
export function sortRatesByRole<T extends { role: string }>(rates: T[]): T[] {
  const orderMap = new Map(ROLE_ORDER.map((r, i) => [r, i] as const));
  return [...rates].sort(
    (a, b) => (orderMap.get(a.role) ?? 99) - (orderMap.get(b.role) ?? 99),
  );
}

// 빈 5역할 assignments 객체 (StaffingSuggestion 초기값/디폴트 용도)
export type RoleAssignments = Record<RoleCode, number>;

export function emptyRoleAssignments(): RoleAssignments {
  return ROLE_ORDER.reduce<RoleAssignments>(
    (acc, role) => {
      acc[role] = 0;
      return acc;
    },
    {} as RoleAssignments,
  );
}
