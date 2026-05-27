// Claude Sonnet 4.6 — AI 인력배치 제안 (suggestProjectStaffing)
//
// 이관 사유 (Phase 1.8 — 2026-05-26):
//   기존 Gemini 2.5 Pro는 reasoning 모델이라 응답 전에 내부 thinking 토큰을 소비한다.
//   staffing 프롬프트는 5단계 추론 + 학습 데이터 + 가용 인력 풀이 들어가 thinking이
//   무거웠고, maxOutputTokens=1024가 thinking 단계에서 소진되어 실제 JSON 출력이
//   시작도 못한 채 finishReason=MAX_TOKENS로 잘리는 빈도가 높았다 (→ JSON.parse 실패).
//   구조화 JSON + 5단계 추론은 Claude Sonnet 4.6의 강점 영역이라 이관.
//
// 프록시: functions/api/staffing.ts → Anthropic Messages API
// JSON 강제: tool_use forced output. tool_choice로 submit_staffing 호출을 강제하면
//           모델은 input_schema에 맞춘 구조화 객체를 반환한다. (prefill은 sonnet-4-6에서
//           "This model does not support assistant message prefill" 400 에러 발생.)
//
// WAF 우회 (Phase 1.9 — 2026-05-27 ~ 2026-05-28):
//   Cloudflare 무료 플랜 WAF Managed Rule "React - RCE - CVE-2025-55182" (Rule ID
//   끝자리 99702280)이 기존 엔드포인트 POST 본문에서 코드 유사 패턴 — 곱셈/비교/할당
//   연산자, "key:value 파이프" 구분 라인, 식별자 콜론 타입 표기 등 — 을 React/RCE
//   페이로드로 오인해 403 "Request not allowed" 차단. airtoradmin.co.kr zone에서만
//   발생, pages.dev에선 정상. 산문화로도 못 뚫림 → 경로 자체를 /api/staffing으로
//   변경 (2026-05-28). WAF는 URL path를 토큰화해 룰 매칭하는데 "claude"라는 토큰이
//   Managed Rule의 트리거 조건에 포함된 것으로 추정 (정황 증거: 본문/origin/인프라
//   전부 동일한데 경로만 다른 /api/gemini는 200 통과).

import {
  ROLE_ORDER,
  ROLE_LABELS,
  type RoleAssignments,
  type RoleCode,
  emptyRoleAssignments,
} from './roles';
import {
  classifyLearningInfluence,
  type LearningStats,
} from './staffing-learning';

// 5개 역할 + days. RoleAssignments는 roles.ts 단일 진실원.
export interface StaffingSuggestion {
  assignments: RoleAssignments & { days: number };
  estimatedLaborCost: number;
  estimatedNetProfit: number;
  estimatedProfitRatio: number; // fraction (0~1)
  rationale: string;
  warnings: string[];
  /** Phase 1.7 — 학습 영향도. AI 응답에 없으면 학습 통계로 보강. */
  learningInfluence?: 'high' | 'medium' | 'low' | 'none';
}

export interface StaffingInput {
  service: string;
  totalQuantity: number;
  detailedQuantity?: string;
  netRevenue: number;
  laborRates: RoleAssignments;          // 역할별 일당 (5개)
  /** Phase 1.7 — Step 2 computeLearningStats() 결과. */
  learningStats: LearningStats;
  availableSubcontractors: Array<{
    name: string;
    grade: 'S' | 'A' | 'B' | 'C';
    cooperationScore: number;
    ongoingProjects: number;
  }>;
  targetProfitRatio: number; // fraction (0~1). 기본 0.40 (40%).
}

const STAFFING_SYSTEM_PROMPT = `당신은 에어터라는 회사의 프로젝트 손익 최적화 컨설턴트입니다.
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
인건비는 다섯 역할 각각의 인원 수와 일당과 작업일수를 곱한 값을 모두 더해 산출합니다. 변동비는 식비와 교통비 등으로 인건비의 십이 퍼센트 정도로 추정합니다. 총비용은 인건비와 추정 변동비를 더한 값입니다. 순익률은 순매출에서 총비용을 뺀 순이익을 순매출로 나눈 분수입니다. 순익률이 사십 퍼센트에 못 미친다면 인력 배치를 단 한 번만 재조정합니다. 무한히 반복하지 마세요. 재조정 후에도 목표에 도달하지 못한다면 경고 메시지에 목표 순익률 사십 퍼센트 달성이 어려우니 견적 인상 또는 인력 최소화 검토가 필요하다는 취지로 명시합니다.

제출 방식 안내입니다.
일반 텍스트 응답은 금지입니다. 결과는 반드시 제공된 도구 호출을 통해서만 제출합니다. 도구가 받는 항목은 다음과 같습니다.
다섯 역할별 인원 수와 작업일수는 모두 정수입니다.
추정 인건비와 추정 순익은 원 단위 정수입니다.
추정 순익률은 영부터 일 사이의 분수입니다.
추천 근거는 한국어로 세 문장에서 다섯 문장 사이로 작성하며 학습 데이터 활용 여부를 명시합니다.
경고 메시지는 문자열 배열이며 없으면 빈 배열로 둡니다.`;

// 학습 컨텍스트를 자연어 산문으로 직접 작성하는 로컬 포매터.
// staffing-learning.formatLearningContextForPrompt 는 "수량 25대 | a_grade:3 b_grade:1"
// 처럼 파이프 + 콜론 구분 라인을 만드는데, 이 형태가 WAF에 React/RCE 페이로드로
// 오인되어 차단된다. 동일한 정보를 문장 형태로 풀어쓴다.
function formatLearningContextSoft(stats: LearningStats): string {
  const roleLabelOf = (k: RoleCode | 'days'): string =>
    k === 'days' ? '작업일수' : ROLE_LABELS[k];

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
      const partsText = ROLE_ORDER
        .map((r) => `${ROLE_LABELS[r]} ${c.assignments[r] || 0} 명`)
        .join(' 그리고 ');
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
      const label = roleLabelOf(d.role);
      const direction = d.avgDiff > 0 ? '많이' : '적게';
      lines.push(
        `${label} 항목은 평균 ${Math.abs(d.avgDiff).toFixed(1)} 단위만큼 사용자가 추천보다 ${direction} 배치하는 경향이 있습니다.`,
      );
    });
  }

  return lines.join('\n');
}

export async function suggestProjectStaffing(input: StaffingInput): Promise<StaffingSuggestion> {
  // 역할 코드(a_grade 등)를 괄호로 노출하던 라인을 한국어 라벨만 남기도록 재작성.
  const ratesLines = ROLE_ORDER.map(
    (r) => `${ROLE_LABELS[r]} 일당 ${(input.laborRates[r] ?? 0).toLocaleString()} 원입니다.`,
  ).join('\n');

  const learningContext = formatLearningContextSoft(input.learningStats);

  const subcontractorsBlock =
    input.availableSubcontractors.length > 0
      ? input.availableSubcontractors
          .map(
            (s) =>
              `${s.name} 작업팀장은 등급이 ${s.grade} 이며 협력 점수는 ${s.cooperationScore} 이고 현재 진행중인 프로젝트는 ${s.ongoingProjects} 건입니다.`,
          )
          .join('\n')
      : '가용 인력 정보가 없습니다.';

  const userContent = [
    `서비스 종류는 ${input.service} 입니다.`,
    `총 수량은 ${input.totalQuantity} 입니다.`,
    input.detailedQuantity ? `상세 수량 내역은 ${input.detailedQuantity} 입니다.` : '',
    `순매출은 부가세를 제외하고 ${input.netRevenue.toLocaleString()} 원입니다.`,
    `목표 순익률은 ${(input.targetProfitRatio * 100).toFixed(0)} 퍼센트입니다.`,
    '',
    '역할별 일당 안내입니다.',
    ratesLines,
    '',
    learningContext,
    '',
    '가용 작업팀장 풀 안내입니다.',
    subcontractorsBlock,
    '',
    '위 데이터를 바탕으로 다섯 단계 추론을 거쳐 인력 배치를 제안해 주세요.',
    '목표 순익률 사십 퍼센트 달성을 최우선으로 하되 학습 데이터를 적극 활용해 주세요.',
  ]
    .filter((line) => line !== '')
    .join('\n');

  const response = await fetch('/api/staffing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      _model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      temperature: 0.3,
      system: STAFFING_SYSTEM_PROMPT,
      tools: [
        {
          name: 'submit_staffing',
          description: '프로젝트 인력 배치 결과를 제출합니다.',
          input_schema: {
            type: 'object',
            properties: {
              assignments: {
                type: 'object',
                properties: {
                  a_grade: { type: 'integer', minimum: 0 },
                  b_grade: { type: 'integer', minimum: 0 },
                  pin_wash: { type: 'integer', minimum: 0 },
                  dely: { type: 'integer', minimum: 0 },
                  parts_wash: { type: 'integer', minimum: 0 },
                  days: { type: 'integer', minimum: 0 },
                },
                required: ['a_grade', 'b_grade', 'pin_wash', 'dely', 'parts_wash', 'days'],
              },
              estimatedLaborCost: { type: 'integer' },
              estimatedNetProfit: { type: 'integer' },
              estimatedProfitRatio: { type: 'number' },
              rationale: { type: 'string' },
              warnings: { type: 'array', items: { type: 'string' } },
            },
            required: [
              'assignments',
              'estimatedLaborCost',
              'estimatedNetProfit',
              'estimatedProfitRatio',
              'rationale',
              'warnings',
            ],
          },
        },
      ],
      // tool_choice로 submit_staffing 호출을 강제 — 자유 텍스트 응답 차단
      tool_choice: { type: 'tool', name: 'submit_staffing' },
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Claude staffing] ${response.status} 에러 본문:`, errorBody);
    throw new Error(`AI 응답 오류 (${response.status})`);
  }

  const data = await response.json();
  // tool_choice 강제 호출이므로 응답에 tool_use 블록이 반드시 포함됨.
  const toolUse = data.content?.find(
    (c: any) => c.type === 'tool_use' && c.name === 'submit_staffing',
  );
  if (!toolUse || !toolUse.input) {
    console.error('[Claude staffing] tool_use 누락:', JSON.stringify(data));
    throw new Error('AI 응답 형식 오류 — 다시 시도해주세요');
  }
  const parsed: StaffingSuggestion = toolUse.input;

  // 최소 필드 검증 — 5개 역할 모두 number 인지 확인
  if (!parsed.assignments || typeof (parsed.assignments as any).a_grade !== 'number') {
    throw new Error('AI 응답 스키마 불일치 (a_grade 필드 누락)');
  }
  // 누락 키는 0으로 보강 (모델이 일부 역할만 출력했을 때 방어)
  const safe = emptyRoleAssignments();
  for (const r of ROLE_ORDER) {
    const v = (parsed.assignments as any)[r];
    safe[r] = typeof v === 'number' && v >= 0 ? Math.floor(v) : 0;
  }
  parsed.assignments = {
    ...safe,
    days: typeof parsed.assignments.days === 'number' ? parsed.assignments.days : 0,
  };
  if (!parsed.warnings) parsed.warnings = [];

  // learningInfluence 보강 — AI가 응답에 안 넣으면 학습 통계로 분류
  if (!parsed.learningInfluence) {
    parsed.learningInfluence = classifyLearningInfluence(input.learningStats);
  }

  return parsed;
}
