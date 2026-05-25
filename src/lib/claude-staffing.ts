// Claude Sonnet 4.6 — AI 인력배치 제안 (suggestProjectStaffing)
//
// 이관 사유 (Phase 1.8 — 2026-05-26):
//   기존 Gemini 2.5 Pro는 reasoning 모델이라 응답 전에 내부 thinking 토큰을 소비한다.
//   staffing 프롬프트는 5단계 추론 + 학습 데이터 + 가용 인력 풀이 들어가 thinking이
//   무거웠고, maxOutputTokens=1024가 thinking 단계에서 소진되어 실제 JSON 출력이
//   시작도 못한 채 finishReason=MAX_TOKENS로 잘리는 빈도가 높았다 (→ JSON.parse 실패).
//   구조화 JSON + 5단계 추론은 Claude Sonnet 4.6의 강점 영역이라 이관.
//
// 프록시: functions/api/claude.ts → Anthropic Messages API
// JSON 강제: tool_use forced output. tool_choice로 submit_staffing 호출을 강제하면
//           모델은 input_schema에 맞춘 구조화 객체를 반환한다. (prefill은 sonnet-4-6에서
//           "This model does not support assistant message prefill" 400 에러 발생.)

import { ROLE_ORDER, ROLE_LABELS, type RoleAssignments, emptyRoleAssignments } from './roles';
import {
  formatLearningContextForPrompt,
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

const STAFFING_SYSTEM_PROMPT = `당신은 에어터(Airtor)의 프로젝트 손익 최적화 컨설턴트입니다.
B2B 청소·소독·방제·에어컨세척 서비스의 인력 배치 초안을 제안합니다.

[역할 정의]
- a_grade  (A급 분조): 숙련 작업자, 분조 작업 메인, 고난도/대형 현장
- b_grade  (B급 분조): 일반 작업자, 분조 작업 보조, 표준 현장
- pin_wash (핀세척): 에어컨 핀 정밀 세척 전담
- dely     (딜리): 이동·운반·부대 작업
- parts_wash (부품세척): 분해된 부품 별도 세척

[목표 순익률: 40% — 빡빡한 목표]
- 목표 달성이 어려운 경우 warnings에 명확히 사유 적기
- 그래도 가능한 최선의 배치를 제안 (불가능하다고 빈 배치 반환 금지)
- 적자가 명백한 경우에도 합리적 최소 인력으로 제안 + warning

[추론 5단계 — 반드시 이 순서로 따르세요]

1. 학습 데이터 우선 참조
   - 입력의 학습 데이터 섹션에서 평균 인력 배치를 출발점으로 삼음
   - 우수 사례에서 가장 비슷한 수량의 케이스를 참조
   - 사용자 수정 패턴이 있으면 그 방향으로 보정 (예: pin_wash가 +0.7명이면 1명 더 추가)

2. 수량 기반 조정
   - 평균 배치가 입력 수량에 맞는지 검증
   - 수량이 평균의 1.5배면 인력도 1.3~1.5배 (효율 고려)
   - 수량이 평균의 0.5배면 인력도 0.6~0.7배

3. 서비스 특성 반영
   - 에어컨세척: a_grade + b_grade + pin_wash가 주축
   - 소독·방제: a_grade + b_grade 위주
   - 부품 분해 동반 시 parts_wash 추가
   - 대형 현장(수량 50+): dely 1~2명 추가

4. 가용 인력 매칭
   - 가용 작업팀장 풀의 등급 분포 확인 (S/A는 a_grade 후보)
   - ongoingProjects 적은 인력 우선
   - 매칭 결과를 rationale에 반영

5. 캡 검증 (목표 순익률 40%)
   - 인건비 = (a_grade*rate1 + b_grade*rate2 + pin_wash*rate3 + dely*rate4 + parts_wash*rate5) * days
   - 변동비 추정 = 인건비 × 0.12 (식비·교통비 약 12%)
   - 총비용 = 인건비 + 추정변동비
   - profitRatio = (netRevenue - 총비용) / netRevenue
   - profitRatio < 0.40 이면 인력 1회만 재조정 (무한 루프 금지)
   - 재조정해도 40% 미달이면 warnings에 명시:
     "목표 순익률 40% 달성 어려움. 견적 인상 또는 인력 최소화 검토 필요"

[출력 방법]
반드시 submit_staffing 도구를 호출해서 결과를 제출하세요. 일반 텍스트 응답 금지.
- assignments: 5개 역할별 인원 수(int) + days(int)
- estimatedLaborCost / estimatedNetProfit: 원 단위 int
- estimatedProfitRatio: 0~1 사이 fraction
- rationale: 한국어 3~5문장. 학습 데이터 활용 여부 명시.
- warnings: 문자열 배열, 없으면 빈 배열.`;

export async function suggestProjectStaffing(input: StaffingInput): Promise<StaffingSuggestion> {
  const ratesLines = ROLE_ORDER.map(
    (r) => `${ROLE_LABELS[r]} (${r}): ${(input.laborRates[r] ?? 0).toLocaleString()}원/일`,
  ).join('\n');

  const learningContext = formatLearningContextForPrompt(input.learningStats);

  const userContent = `
서비스: ${input.service}
총수량: ${input.totalQuantity}
${input.detailedQuantity ? `상세수량: ${input.detailedQuantity}` : ''}
순매출(부가세 제외): ${input.netRevenue.toLocaleString()}원
목표 순익률: ${(input.targetProfitRatio * 100).toFixed(0)}%

[역할별 일당 (5개)]
${ratesLines}

${learningContext}

[가용 작업팀장 풀]
${input.availableSubcontractors.length > 0
  ? input.availableSubcontractors.map((s) =>
      `· ${s.name} (${s.grade}등급, 협력점수${s.cooperationScore}, 진행중${s.ongoingProjects}건)`,
    ).join('\n')
  : '(가용 인력 정보 없음)'}

위 데이터를 바탕으로 5단계 추론을 거쳐 인력 배치 JSON을 제안하세요.
목표 순익률 40% 달성을 최우선으로 하되, 학습 데이터를 적극 활용하세요.
`.trim();

  const response = await fetch('/api/claude', {
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
