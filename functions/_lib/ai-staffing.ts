// AI 인력배치 — 시스템 프롬프트·입력 서술·출력 스키마를 서버가 소유한다.
// (기존에는 브라우저가 system/tools/tool_choice/temperature 를 통째로 보내 프록시가 오픈 릴레이였다.)
//
// 모델별 제출 방식:
//   - 구조화 출력 지원(Opus 5.5 · Sonnet 5.5 · Fable 5.1 · Haiku 5.5 · Haiku 4.5): output_config.format(JSON 스키마)
//   - 미지원(Sonnet 4.6, 기본값): 기존과 동일하게 submit_staffing 도구 강제 호출
// 구조화 출력 스키마는 모든 객체에 additionalProperties:false 가 필요하고 minimum 같은 수치 제약을 쓸 수 없다.
//
// 프롬프트를 산문으로 쓴 이유(WAF 오탐 회피)는 src/lib/claude-staffing.ts 이력 주석 참고.

import { ROLE_LABELS, ROLE_ORDER, type RoleCode } from '../../src/lib/roles';
import { AiError } from './ai-http';

export type StaffingMethod = 'structured' | 'tool';

export interface LearningStatsInput {
  service: string;
  quantityRange: { min: number; max: number };
  sampleSize: number;
  avgProfitRatio: number;
  avgAssignments: Record<RoleCode | 'days', number>;
  aiVsActual: Array<{ role: RoleCode | 'days'; avgDiff: number }>;
  excellentCases: Array<{ quantity: number; assignments: Record<string, number>; profitRatio: number }>;
}

export interface StaffingInput {
  service: string;
  totalQuantity: number;
  detailedQuantity?: string;
  netRevenue: number;
  laborRates: Record<RoleCode, number>;
  learningStats: LearningStatsInput;
  availableSubcontractors: Array<{ name: string; grade: string; cooperationScore: number; ongoingProjects: number }>;
  targetProfitRatio: number;
}

export interface StaffingSuggestion {
  assignments: Record<RoleCode | 'days', number>;
  estimatedLaborCost: number;
  estimatedNetProfit: number;
  estimatedProfitRatio: number;
  rationale: string;
  warnings: string[];
}

const PROMPT_BODY = `당신은 에어터라는 회사의 프로젝트 손익 최적화 컨설턴트입니다.
B2B 청소와 소독과 방제와 에어컨세척 서비스의 인력 배치 초안을 제안하는 역할을 맡습니다.

역할은 다섯 가지로 구분합니다.
첫 번째 역할은 에이급 분조입니다. 숙련 작업자가 분조 작업의 메인을 맡으며 고난도 현장이나 대형 현장에 투입됩니다.
두 번째 역할은 비급 분조입니다. 일반 작업자가 분조 작업의 보조를 맡으며 표준 현장에 투입됩니다.
세 번째 역할은 핀세척입니다. 에어컨 핀 정밀 세척을 전담합니다.
네 번째 역할은 딜리입니다. 이동과 운반 그리고 부대 작업을 맡습니다.
다섯 번째 역할은 부품세척입니다. 분해된 부품을 별도로 세척합니다.

목표 순익률 안내입니다.
목표 순익률은 사십 퍼센트입니다. 빡빡한 목표이지만 가능한 한 최선의 배치를 제안하세요. 달성이 어려운 경우에는 그 사유를 경고 메시지에 분명히 적어 주세요. 빈 배치를 반환하지는 마세요. 적자가 예상되는 경우에도 합리적인 최소 인력으로 제안하고 함께 경고를 남깁니다.

추론은 다섯 단계 순서로 진행합니다.

첫째 단계, 학습 데이터를 가장 먼저 참조합니다.
입력의 학습 데이터 섹션에서 평균 인력 배치를 출발점으로 삼습니다. 우수 사례에서는 가장 비슷한 수량의 케이스를 참조합니다. 사용자 수정 패턴이 있다면 그 방향으로 보정합니다. 예를 들어 핀세척 역할이 평균보다 영점 칠 명만큼 많이 배치되는 경향이 있다면 핀세척을 한 명 더 배치하는 식입니다.

둘째 단계, 수량 기반 조정을 합니다.
평균 배치가 입력 수량에 맞는지 검토합니다. 수량이 평균의 한 배 반 수준이라면 인력도 한 배 반 정도로 늘리되 효율을 감안합니다. 수량이 평균의 절반 수준이라면 인력도 그에 맞춰 절반 정도로 줄입니다.

셋째 단계, 서비스 특성을 반영합니다.
에어컨세척 서비스라면 에이급 분조와 비급 분조와 핀세척이 주축입니다. 소독과 방제 서비스라면 에이급 분조와 비급 분조 위주로 구성합니다. 부품 분해가 동반된다면 부품세척 인력을 추가합니다. 수량이 오십 대를 넘는 대형 현장이라면 딜리를 한 명에서 두 명 추가합니다.

넷째 단계, 가용 인력 풀과 매칭합니다.
가용 작업팀장 풀의 등급 분포를 확인합니다. 에스 등급과 에이 등급은 에이급 분조 후보입니다. 진행중인 프로젝트 건수가 적은 인력을 우선합니다. 매칭 결과는 추천 근거 설명에 반영합니다.

다섯째 단계, 순익률 목표를 검증합니다.
인건비는 다섯 역할 각각의 인원 수와 일당과 작업일수를 곱한 값을 모두 더해 산출합니다. 변동비는 식비와 교통비 등으로 인건비의 십이 퍼센트 정도로 추정합니다. 총비용은 인건비와 추정 변동비를 더한 값입니다. 순익률은 순매출에서 총비용을 뺀 순이익을 순매출로 나눈 분수입니다. 순익률이 사십 퍼센트에 못 미친다면 인력 배치를 단 한 번만 재조정합니다. 무한히 반복하지 마세요. 재조정 후에도 목표에 도달하지 못한다면 경고 메시지에 목표 순익률 사십 퍼센트 달성이 어려우니 견적 인상 또는 인력 최소화 검토가 필요하다는 취지로 명시합니다.`;

const FIELD_GUIDE = `다섯 역할별 인원 수와 작업일수는 모두 0 이상의 정수입니다.
추정 인건비와 추정 순익은 원 단위 정수입니다.
추정 순익률은 영부터 일 사이의 분수입니다.
추천 근거는 한국어로 세 문장에서 다섯 문장 사이로 작성하며 학습 데이터 활용 여부를 명시합니다.
경고 메시지는 문자열 배열이며 없으면 빈 배열로 둡니다.`;

export function staffingSystem(method: StaffingMethod): string {
  const submit =
    method === 'tool'
      ? `제출 방식 안내입니다.
일반 텍스트 응답은 금지입니다. 결과는 반드시 제공된 도구 호출을 통해서만 제출합니다. 도구가 받는 항목은 다음과 같습니다.`
      : `제출 방식 안내입니다.
결과는 지정된 JSON 형식으로만 제출하며 형식 밖의 설명 문장은 쓰지 않습니다. 각 항목은 다음과 같습니다.`;
  return `${PROMPT_BODY}\n\n${submit}\n${FIELD_GUIDE}`;
}

const ROLE_INT_PROPS = Object.fromEntries([...ROLE_ORDER, 'days'].map((k) => [k, { type: 'integer' }]));
const REQUIRED_TOP = ['assignments', 'estimatedLaborCost', 'estimatedNetProfit', 'estimatedProfitRatio', 'rationale', 'warnings'];

/** 구조화 출력용 — 모든 객체 additionalProperties:false, 수치 제약 없음 */
export const STAFFING_JSON_SCHEMA = {
  type: 'object',
  properties: {
    assignments: {
      type: 'object',
      properties: ROLE_INT_PROPS,
      required: [...ROLE_ORDER, 'days'],
      additionalProperties: false,
    },
    estimatedLaborCost: { type: 'integer' },
    estimatedNetProfit: { type: 'integer' },
    estimatedProfitRatio: { type: 'number' },
    rationale: { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: REQUIRED_TOP,
  additionalProperties: false,
};

/** 강제 tool 방식(Sonnet 4.6) — 기존 클라이언트와 동일한 정의 */
export const STAFFING_TOOL = {
  name: 'submit_staffing',
  description: '프로젝트 인력 배치 결과를 제출합니다.',
  input_schema: {
    type: 'object',
    properties: {
      assignments: {
        type: 'object',
        properties: Object.fromEntries([...ROLE_ORDER, 'days'].map((k) => [k, { type: 'integer', minimum: 0 }])),
        required: [...ROLE_ORDER, 'days'],
      },
      estimatedLaborCost: { type: 'integer' },
      estimatedNetProfit: { type: 'integer' },
      estimatedProfitRatio: { type: 'number' },
      rationale: { type: 'string' },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: REQUIRED_TOP,
  },
};

// ─── 입력 검증 ──────────────────────────────────────────────────────────

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function roleRecord(v: unknown, withDays: boolean): Record<string, number> {
  const src = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const out: Record<string, number> = {};
  for (const k of withDays ? [...ROLE_ORDER, 'days'] : ROLE_ORDER) out[k] = num(src[k]);
  return out;
}

/** 브라우저가 보낸 입력을 상한 안으로 정리한다. 필수값이 없으면 400. */
export function validateStaffingInput(raw: unknown): StaffingInput {
  if (!raw || typeof raw !== 'object') throw new AiError(400, 'bad_request', '인력배치 입력이 없습니다.');
  const r = raw as Record<string, unknown>;
  const service = str(r.service, 100);
  const totalQuantity = num(r.totalQuantity, NaN);
  const netRevenue = num(r.netRevenue, NaN);
  if (!service || !Number.isFinite(totalQuantity) || !Number.isFinite(netRevenue)) {
    throw new AiError(400, 'bad_request', '서비스·수량·순매출 정보가 필요합니다.');
  }
  const ls = r.learningStats && typeof r.learningStats === 'object' ? (r.learningStats as Record<string, unknown>) : {};
  const qr = ls.quantityRange && typeof ls.quantityRange === 'object' ? (ls.quantityRange as Record<string, unknown>) : {};
  const rolesOrDays = new Set<string>([...ROLE_ORDER, 'days']);
  return {
    service,
    totalQuantity,
    detailedQuantity: str(r.detailedQuantity, 500) || undefined,
    netRevenue,
    laborRates: roleRecord(r.laborRates, false) as Record<RoleCode, number>,
    learningStats: {
      service: str(ls.service, 100) || service,
      quantityRange: { min: num(qr.min), max: num(qr.max) },
      sampleSize: Math.max(0, Math.floor(num(ls.sampleSize))),
      avgProfitRatio: num(ls.avgProfitRatio),
      avgAssignments: roleRecord(ls.avgAssignments, true) as Record<RoleCode | 'days', number>,
      aiVsActual: (Array.isArray(ls.aiVsActual) ? ls.aiVsActual : [])
        .slice(0, 6)
        .map((d) => d as Record<string, unknown>)
        .filter((d) => rolesOrDays.has(String(d.role)))
        .map((d) => ({ role: String(d.role) as RoleCode | 'days', avgDiff: num(d.avgDiff) })),
      excellentCases: (Array.isArray(ls.excellentCases) ? ls.excellentCases : []).slice(0, 5).map((c) => {
        const cc = c as Record<string, unknown>;
        return { quantity: num(cc.quantity), assignments: roleRecord(cc.assignments, true), profitRatio: num(cc.profitRatio) };
      }),
    },
    availableSubcontractors: (Array.isArray(r.availableSubcontractors) ? r.availableSubcontractors : []).slice(0, 20).map((s) => {
      const ss = s as Record<string, unknown>;
      return {
        name: str(ss.name, 50) || '이름 미상',
        grade: str(ss.grade, 5) || '-',
        cooperationScore: num(ss.cooperationScore),
        ongoingProjects: num(ss.ongoingProjects),
      };
    }),
    targetProfitRatio: num(r.targetProfitRatio, 0.4),
  };
}

// ─── 사용자 메시지 (학습 데이터는 산문으로) ─────────────────────────────

function formatLearningContextSoft(stats: LearningStatsInput): string {
  const roleLabelOf = (k: RoleCode | 'days'): string => (k === 'days' ? '작업일수' : ROLE_LABELS[k]);

  if (stats.sampleSize === 0) {
    return `학습 데이터 안내입니다.
과거 유사 프로젝트가 없습니다. 서비스는 ${stats.service} 이고 수량 범위는 ${stats.quantityRange.min} 대에서 ${stats.quantityRange.max} 대 사이입니다. 이 케이스는 첫 사례이므로 서비스 특성과 수량에 기반해 추정해 주세요.`;
  }

  const lines: string[] = [];
  lines.push(`학습 데이터 안내입니다. 총 ${stats.sampleSize} 건의 유사 프로젝트를 분석했습니다.`);
  lines.push(`서비스는 ${stats.service} 이고 수량 범위는 ${stats.quantityRange.min} 대에서 ${stats.quantityRange.max} 대 사이입니다.`);
  lines.push(`평균 순익률은 ${(stats.avgProfitRatio * 100).toFixed(1)} 퍼센트 입니다.`);
  lines.push('');
  lines.push('평균 인력 배치는 다음과 같습니다.');
  for (const role of ROLE_ORDER) {
    lines.push(`${ROLE_LABELS[role]} 평균 ${stats.avgAssignments[role].toFixed(1)} 명입니다.`);
  }
  lines.push(`작업일수 평균은 ${stats.avgAssignments.days.toFixed(1)} 일입니다.`);

  if (stats.excellentCases.length > 0) {
    lines.push('');
    lines.push('우수 사례 안내입니다. 순익률 삼십 퍼센트 이상인 사례들입니다.');
    stats.excellentCases.forEach((c, i) => {
      const partsText = ROLE_ORDER.map((r) => `${ROLE_LABELS[r]} ${c.assignments[r] || 0} 명`).join(' 그리고 ');
      lines.push(
        `${i + 1} 번째 사례는 수량 ${c.quantity} 대 작업으로 배치는 ${partsText} 이고 작업일수는 ${c.assignments.days || 0} 일이며 순익률은 ${(c.profitRatio * 100).toFixed(0)} 퍼센트 입니다.`,
      );
    });
  }

  const significantDiffs = stats.aiVsActual.filter((d) => Math.abs(d.avgDiff) >= 0.5);
  if (significantDiffs.length > 0) {
    lines.push('');
    lines.push('사용자 수정 패턴 안내입니다. 실제 사용과 추천의 평균 차이입니다.');
    significantDiffs.forEach((d) => {
      const direction = d.avgDiff > 0 ? '많이' : '적게';
      lines.push(
        `${roleLabelOf(d.role)} 항목은 평균 ${Math.abs(d.avgDiff).toFixed(1)} 단위만큼 사용자가 추천보다 ${direction} 배치하는 경향이 있습니다.`,
      );
    });
  }

  return lines.join('\n');
}

export function staffingUserContent(input: StaffingInput): string {
  const ratesLines = ROLE_ORDER.map(
    (r) => `${ROLE_LABELS[r]} 일당 ${(input.laborRates[r] ?? 0).toLocaleString('ko-KR')} 원입니다.`,
  ).join('\n');

  const subcontractorsBlock =
    input.availableSubcontractors.length > 0
      ? input.availableSubcontractors
          .map(
            (s) =>
              `${s.name} 작업팀장은 등급이 ${s.grade} 이며 협력 점수는 ${s.cooperationScore} 이고 현재 진행중인 프로젝트는 ${s.ongoingProjects} 건입니다.`,
          )
          .join('\n')
      : '가용 인력 정보가 없습니다.';

  return [
    `서비스 종류는 ${input.service} 입니다.`,
    `총 수량은 ${input.totalQuantity} 입니다.`,
    input.detailedQuantity ? `상세 수량 내역은 ${input.detailedQuantity} 입니다.` : '',
    `순매출은 부가세를 제외하고 ${input.netRevenue.toLocaleString('ko-KR')} 원입니다.`,
    `목표 순익률은 ${(input.targetProfitRatio * 100).toFixed(0)} 퍼센트입니다.`,
    '',
    '역할별 일당 안내입니다.',
    ratesLines,
    '',
    formatLearningContextSoft(input.learningStats),
    '',
    '가용 작업팀장 풀 안내입니다.',
    subcontractorsBlock,
    '',
    '위 데이터를 바탕으로 다섯 단계 추론을 거쳐 인력 배치를 제안해 주세요.',
    '목표 순익률 사십 퍼센트 달성을 최우선으로 하되 학습 데이터를 적극 활용해 주세요.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** 모델 출력 검증 — 5역할 + days 를 0 이상 정수로 정리. 형식이 틀리면 null. */
export function normalizeSuggestion(raw: unknown): StaffingSuggestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const a = r.assignments as Record<string, unknown> | undefined;
  if (!a || typeof a !== 'object' || typeof a.a_grade !== 'number') return null;
  const assignments = {} as Record<RoleCode | 'days', number>;
  for (const k of [...ROLE_ORDER, 'days'] as Array<RoleCode | 'days'>) {
    const v = a[k];
    assignments[k] = typeof v === 'number' && v >= 0 ? Math.floor(v) : 0;
  }
  return {
    assignments,
    estimatedLaborCost: Math.round(num(r.estimatedLaborCost)),
    estimatedNetProfit: Math.round(num(r.estimatedNetProfit)),
    estimatedProfitRatio: num(r.estimatedProfitRatio),
    rationale: typeof r.rationale === 'string' ? r.rationale : '',
    warnings: Array.isArray(r.warnings) ? r.warnings.filter((w): w is string => typeof w === 'string') : [],
  };
}
