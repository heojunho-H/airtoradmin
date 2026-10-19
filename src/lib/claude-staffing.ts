// AI 인력배치 제안 (suggestProjectStaffing) — Anthropic Claude
//
// 이력:
//   Phase 1.8 (2026-05-26) Gemini 2.5 Pro → Claude Sonnet 4.6 이관 (thinking 토큰이 출력 한도를 잠식해 JSON 이 잘리던 문제).
//   Phase 1.9 (2026-05-27~28) Cloudflare WAF "React - RCE" 룰 오탐 → 프롬프트 산문화 + 경로 /api/claude → /api/staffing.
//   2026-10 모델 설정화: 시스템 프롬프트·학습 데이터 서술·출력 스키마를 서버(functions/_lib/ai-staffing.ts)로 옮겼다.
//     브라우저는 입력값만 보내고, 모델·추론 강도는 설정 화면(관리자)에서 정한다. 서버가 모델에 맞춰
//     구조화 출력(Opus 5.5 등) 또는 강제 tool 호출(Sonnet 4.6)을 고르고 검증된 JSON 을 돌려준다.

import { ROLE_ORDER, type RoleAssignments, emptyRoleAssignments } from './roles';
import {
  classifyLearningInfluence,
  type LearningStats,
} from './staffing-learning';
import { postJson } from './ai/api';

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
  /** 실제로 응답한 Claude 모델 ID (aiSuggestion JSON 에 함께 저장) */
  model?: string;
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

export async function suggestProjectStaffing(
  input: StaffingInput,
  opts: { projectId?: number; signal?: AbortSignal } = {},
): Promise<StaffingSuggestion> {
  const result = await postJson<{ data: StaffingSuggestion; model: string }>(
    { input, projectId: opts.projectId, userName: localStorage.getItem('user_name') || '' },
    { endpoint: '/api/staffing', signal: opts.signal },
  );
  const parsed: StaffingSuggestion = { ...result.data, model: result.model };

  // 최소 필드 검증 — 5개 역할 모두 number 인지 확인 (서버도 검증하지만 저장 전 한 번 더)
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
