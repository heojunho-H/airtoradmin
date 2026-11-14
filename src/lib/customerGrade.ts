// 고객 등급 자동 분류 — 누적 거래 금액(작업이력 견적 합계, VAT 포함) 기준.
// 2026-11-14 사용자 결정: 1,000만원 이상 S · 400만원 이상 A · 100만원 이상 B · 그 미만 '그 외'.
// 손으로 바꾼 고객은 '수동 고정'(D1 customer_grade_locks, src/lib/gradeLocks.ts)으로 자동 분류에서 빠진다.
// 고객 표(카페24)의 grade 칸은 App.tsx 가 이 규칙으로 계산한 값과 다를 때만 저장한다.

export type GradeClass = 'S' | 'A' | 'B' | '그 외';

export const GRADE_NONE = '그 외' as const;

/** 금액 큰 순. 기준 금액을 바꿀 때는 여기만 고친다 */
export const GRADE_THRESHOLDS: ReadonlyArray<{ grade: 'S' | 'A' | 'B'; min: number }> = [
  { grade: 'S', min: 10_000_000 },
  { grade: 'A', min: 4_000_000 },
  { grade: 'B', min: 1_000_000 },
];

export const GRADE_RULE_TEXT = '누적 거래 금액으로 자동 분류 — 1,000만원 이상 S · 400만원 이상 A · 100만원 이상 B · 그 미만 그 외';

/**
 * 고객의 누적 거래 금액(원, VAT 포함) — 작업이력 견적 합계. 작업이력이 없으면 저장된 totalAmount.
 * 저장된 totalAmount 는 예전 누적 잔재로 작업이력과 어긋난 고객이 있어, 표·등급·매출 비중·AI 스냅샷이 모두 이 값을 쓴다.
 */
export function customerTotalAmount(c: { workHistory?: unknown; totalAmount?: unknown } | null | undefined): number {
  const wh = Array.isArray(c?.workHistory) ? (c.workHistory as Array<{ quotationAmount?: unknown } | null>) : [];
  if (wh.length > 0) return wh.reduce((sum, w) => sum + (Number(w?.quotationAmount) || 0), 0);
  return Number(c?.totalAmount) || 0;
}

/** 금액 → 등급 */
export function autoGrade(amount: number): GradeClass {
  for (const t of GRADE_THRESHOLDS) if (amount >= t.min) return t.grade;
  return GRADE_NONE;
}

/** 저장된 값의 등급 구분 — S/A/B 가 아니면('미설정'·빈 값 포함) 모두 '그 외' */
export function gradeClass(v: unknown): GradeClass {
  return v === 'S' || v === 'A' || v === 'B' ? v : GRADE_NONE;
}

/** 최종 등급 — 수동 고정이 있으면 그 등급, 없으면 금액 기준 */
export function effectiveGrade(c: { workHistory?: unknown; totalAmount?: unknown } | null | undefined, lockedGrade?: string | null): GradeClass {
  return lockedGrade != null ? gradeClass(lockedGrade) : autoGrade(customerTotalAmount(c));
}

/**
 * 고객책임자 자동 지정 (2026-11-14 사용자 결정) — 책임자가 비어 있고 등급이 S·A·B 인 고객에게만 등급별 책임자를 지정한다.
 * 이미 책임자가 있으면 등급이 바뀌어도 바꾸지 않는다(B → A 승급, '그 외' → B 포함). '그 외' 고객은 지정하지 않는다.
 * byGrade = 등급별 책임자 이름(D1 customer_grade_managers — 직원 이름은 코드에 두지 않는다),
 * validNames = 지금 지정할 수 있는 고객책임자 이름. 지정할 것이 없으면 null.
 */
export function managerToAssign(
  currentManager: unknown,
  grade: GradeClass,
  byGrade: Partial<Record<'S' | 'A' | 'B', string>>,
  validNames: ReadonlySet<string>,
): string | null {
  if (String(currentManager ?? '').trim()) return null;
  if (grade === GRADE_NONE) return null;
  const name = byGrade[grade];
  return name && validNames.has(name) ? name : null;
}

/** 'S등급' · '그 외' */
export function gradeLabel(v: unknown): string {
  const g = gradeClass(v);
  return g === GRADE_NONE ? GRADE_NONE : `${g}등급`;
}
