// AI 추천 정확도 향상을 위한 학습 통계 — 완료 프로젝트로부터 산출.
//
// 입력 타입 메모:
//   Project 자체에는 totalQuantity 필드가 없다 (ProfitPage에서 customer.workHistory와 조인).
//   따라서 호출 측이 사전에 totalQuantity를 채워 ProjectForLearning 으로 전달해야 한다.

import type { Project } from '../app/components/ProfitPage';
import { ROLE_ORDER, type RoleCode } from './roles';

// 호출 측이 enrich해서 넘기는 입력 타입.
// (workHistory 조인은 라이브러리의 책임이 아님 — 단방향 의존 유지)
export type ProjectForLearning = Project & { totalQuantity?: number };

export interface LearningStats {
  service: string;
  quantityRange: { min: number; max: number };
  sampleSize: number;
  avgProfitRatio: number;
  avgAssignments: Record<RoleCode | 'days', number>;

  /** AI 추천 vs 사용자 실제 사용의 차이 (학습 신호) */
  aiVsActual: Array<{
    role: RoleCode | 'days';
    avgDiff: number; // 양수: 사용자가 AI보다 많이, 음수: 적게
  }>;

  /** 순익률 30%+ 우수 사례 (최대 5건) */
  excellentCases: Array<{
    quantity: number;
    assignments: Record<string, number>;
    profitRatio: number;
  }>;
}

const QUANTITY_RANGE_PRIMARY = 0.30;     // ±30% 1차 매칭
const QUANTITY_RANGE_FALLBACK = 0.50;    // 매칭 부족 시 ±50%로 확대
const MIN_SAMPLE_FOR_PRIMARY = 3;        // 1차 매칭 기준 샘플 수
const EXCELLENT_PROFIT_THRESHOLD = 0.30; // 우수 사례 순익률 기준
const MAX_EXCELLENT_CASES = 5;

/**
 * 완료 프로젝트 배열에서 학습 통계 산출.
 *
 * 매칭 로직:
 *   1. 같은 serviceType + 수량 ±30% 필터
 *   2. 결과 < 3건이면 수량 ±50%로 재필터
 *   3. 그래도 0건이면 sampleSize=0으로 반환 (호출 측에서 안내)
 */
export function computeLearningStats(
  completedProjects: ProjectForLearning[],
  targetService: string,
  targetQuantity: number,
): LearningStats {
  // 1차 매칭
  let range = makeRange(targetQuantity, QUANTITY_RANGE_PRIMARY);
  let matched = filterByServiceAndRange(completedProjects, targetService, range);

  // 2차 확대 매칭
  if (matched.length < MIN_SAMPLE_FOR_PRIMARY) {
    range = makeRange(targetQuantity, QUANTITY_RANGE_FALLBACK);
    matched = filterByServiceAndRange(completedProjects, targetService, range);
  }

  const avgAssignments = computeAverageAssignments(matched);

  const avgProfitRatio =
    matched.length > 0
      ? matched.reduce((s, p) => s + (p.profitRatio || 0), 0) / matched.length
      : 0;

  const aiVsActual = computeAiVsActualDiff(matched);

  const excellentCases = matched
    .filter((p) => (p.profitRatio || 0) >= EXCELLENT_PROFIT_THRESHOLD)
    .sort((a, b) => (b.profitRatio || 0) - (a.profitRatio || 0))
    .slice(0, MAX_EXCELLENT_CASES)
    .map((p) => ({
      quantity: p.totalQuantity || 0,
      assignments: parseAssignments(p.workerAssignments) || {},
      profitRatio: p.profitRatio || 0,
    }));

  return {
    service: targetService,
    quantityRange: range,
    sampleSize: matched.length,
    avgProfitRatio,
    avgAssignments,
    aiVsActual,
    excellentCases,
  };
}

// ============================================================
// 내부 헬퍼
// ============================================================

function makeRange(target: number, percent: number) {
  return {
    min: Math.floor(target * (1 - percent)),
    max: Math.ceil(target * (1 + percent)),
  };
}

function filterByServiceAndRange(
  projects: ProjectForLearning[],
  service: string,
  range: { min: number; max: number },
): ProjectForLearning[] {
  return projects.filter((p) => {
    if (p.serviceType !== service) return false;
    const q = p.totalQuantity || 0;
    if (!q) return false;
    return q >= range.min && q <= range.max;
  });
}

function parseAssignments(json?: string | null | object): Record<string, number> | null {
  if (!json) return null;
  try {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || typeof data !== 'object') return null;
    return data as Record<string, number>;
  } catch {
    return null;
  }
}

function computeAverageAssignments(
  projects: ProjectForLearning[],
): Record<RoleCode | 'days', number> {
  const sums: Record<string, number> = { days: 0 };
  for (const role of ROLE_ORDER) sums[role] = 0;

  let count = 0;
  for (const p of projects) {
    const a = parseAssignments(p.workerAssignments);
    if (!a) continue;
    for (const role of ROLE_ORDER) sums[role] += a[role] || 0;
    sums.days += a.days || 0;
    count++;
  }

  const avg: Record<string, number> = {};
  const divisor = count || 1;
  for (const key of Object.keys(sums)) {
    avg[key] = sums[key] / divisor;
  }
  return avg as Record<RoleCode | 'days', number>;
}

function computeAiVsActualDiff(
  projects: ProjectForLearning[],
): LearningStats['aiVsActual'] {
  const keys: Array<RoleCode | 'days'> = [...ROLE_ORDER, 'days'];
  const diffs: Record<string, number[]> = {};
  for (const key of keys) diffs[key] = [];

  for (const p of projects) {
    if (!p.aiSuggestion) continue;
    try {
      const ai = JSON.parse(p.aiSuggestion);
      const actual = parseAssignments(p.workerAssignments);
      if (!ai?.assignments || !actual) continue;

      for (const key of keys) {
        const aiVal = Number(ai.assignments[key]) || 0;
        const actualVal = Number(actual[key]) || 0;
        diffs[key].push(actualVal - aiVal);
      }
    } catch {
      // ai_suggestion 파싱 실패 → 해당 케이스는 건너뜀
    }
  }

  return keys.map((key) => ({
    role: key,
    avgDiff:
      diffs[key].length > 0
        ? diffs[key].reduce((s, v) => s + v, 0) / diffs[key].length
        : 0,
  }));
}

/**
 * AI 프롬프트에 주입할 학습 컨텍스트 텍스트 생성.
 * Gemini 시스템 프롬프트의 [과거 유사 프로젝트 학습 데이터] 섹션에 들어감.
 */
export function formatLearningContextForPrompt(stats: LearningStats): string {
  if (stats.sampleSize === 0) {
    return `[학습 데이터]
과거 유사 프로젝트 없음 (서비스: ${stats.service}, 수량 범위 ${stats.quantityRange.min}~${stats.quantityRange.max}대).
이 케이스는 첫 사례이므로 서비스 특성과 수량에 기반해 추정.`;
  }

  const lines: string[] = [];
  lines.push(`[과거 유사 프로젝트 학습 데이터 — ${stats.sampleSize}건 분석]`);
  lines.push(`서비스: ${stats.service}, 수량 ${stats.quantityRange.min}~${stats.quantityRange.max}대`);
  lines.push(`평균 순익률: ${(stats.avgProfitRatio * 100).toFixed(1)}%`);
  lines.push(``);
  lines.push(`평균 인력 배치:`);
  for (const role of ROLE_ORDER) {
    lines.push(`  - ${role}: ${stats.avgAssignments[role].toFixed(1)}명`);
  }
  lines.push(`  - 작업일수: ${stats.avgAssignments.days.toFixed(1)}일`);

  if (stats.excellentCases.length > 0) {
    lines.push(``);
    lines.push(`우수 사례 (순익률 30%+):`);
    stats.excellentCases.forEach((c, i) => {
      const ass = ROLE_ORDER.map((r) => `${r}:${c.assignments[r] || 0}`).join(' ');
      lines.push(
        `  ${i + 1}. ${c.quantity}대 | ${ass} | 일수:${c.assignments.days || 0} | 순익률 ${(c.profitRatio * 100).toFixed(0)}%`,
      );
    });
  }

  // 사용자 수정 패턴 (절대값 0.5명 이상의 유의미한 차이만)
  const significantDiffs = stats.aiVsActual.filter((d) => Math.abs(d.avgDiff) >= 0.5);
  if (significantDiffs.length > 0) {
    lines.push(``);
    lines.push(`사용자 수정 패턴 (실제 사용 - AI 추천):`);
    significantDiffs.forEach((d) => {
      const sign = d.avgDiff > 0 ? '+' : '';
      const direction = d.avgDiff > 0 ? '많이' : '적게';
      lines.push(
        `  - ${d.role}: 평균 ${sign}${d.avgDiff.toFixed(1)}명 (사용자가 AI보다 ${direction} 배치)`,
      );
    });
  }

  return lines.join('\n');
}

/**
 * 학습 영향도 산출 — UI 배지 표시용.
 *
 *   high   : 5건 이상 + 우수 사례 1건 이상
 *   medium : 1~4건
 *   low    : 1~4건 + 우수 사례 0건
 *   none   : 0건
 */
export function classifyLearningInfluence(
  stats: LearningStats,
): 'high' | 'medium' | 'low' | 'none' {
  if (stats.sampleSize === 0) return 'none';
  if (stats.sampleSize >= 5 && stats.excellentCases.length >= 1) return 'high';
  if (stats.sampleSize >= 1 && stats.excellentCases.length === 0) return 'low';
  return 'medium';
}
