// Claude 모델 레지스트리 — AI 기능(chat / company_info / staffing)의 단일 진실원.
// Cloudflare Pages Functions 전용 (`_lib`는 라우팅 대상에서 제외).
//
// 모델마다 API 규칙이 다르다 (2026-10 기준, Claude API 레퍼런스):
//   - Opus 5.5 / Fable 5.1: thinking 항상 켜짐 — `thinking.disabled`·`budget_tokens`는 400.
//     깊이는 output_config.effort 로만 조절 (Opus 5.5 기본 medium).
//   - Sonnet 5.5: thinking 기본 켜짐, `disabled`는 400. effort 기본 high.
//   - 위 3종은 강제 tool_choice(any/tool)·temperature 가 400 → 구조화 출력(output_config.format) 사용.
//   - Haiku 5.5(2026-10-07 출시): thinking 기본 켜짐·effort 5단계(기본 medium), temperature 금지,
//     강제 tool 은 허용되지만 구조화 출력이 있어 그쪽을 쓴다. 서버측 폴백 없음. 프롬프트 10만 토큰 초과 시 단가 5배.
//   - Haiku 4.5(레거시): adaptive thinking·effort 미지원(보내면 오류), temperature·강제 tool 가능.
//   - Sonnet 4.6: 인력배치 레거시. thinking을 보내지 않으면 꺼진 상태(현행 동작), 구조화 출력 미지원 → 강제 tool.
// 이 차이는 buildModelParams() 한 곳에서만 흡수한다. 호출부는 모델 ID만 알면 된다.

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type Feature = 'chat' | 'company_info' | 'staffing';

export const FEATURES: Feature[] = ['chat', 'company_info', 'staffing'];
export const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export interface ModelSpec {
  id: string;
  label: string;
  description: string;
  /** false = 가격 계산 전용(서버측 폴백이 응답한 모델 등). 설정 화면에 노출하지 않는다. */
  selectable: boolean;
  legacy?: boolean;
  badge?: string;
  /** USD / 1M tokens. cacheWrite = 5분 TTL 기준 */
  price: { in: number; out: number; cacheRead: number; cacheWrite: number };
  /** 프롬프트(입력+캐시) 토큰이 threshold 를 넘으면 적용되는 단가 (Haiku 5.5: 10만 토큰 초과 시 5배) */
  longContext?: { threshold: number; price: { in: number; out: number; cacheRead: number; cacheWrite: number } };
  contextWindow: number;
  maxOutput: number;
  /** 'on' = 항상/기본 켜짐(절대 disabled 금지), 'off' = thinking 파라미터를 보내지 않음 */
  thinking: 'on' | 'off';
  /** null = effort 미지원(파라미터 전송 금지) */
  effortLevels: Effort[] | null;
  /** effort 생략 시 API 기본값 (화면 표시용) */
  defaultEffort: Effort | null;
  /** temperature 등 sampling 파라미터 허용 여부 */
  sampling: boolean;
  forcedToolChoice: boolean;
  structuredOutputs: boolean;
  webSearchTool: 'web_search_20260209' | 'web_search_20250305';
  /** fallbacks:'default' 서버측 폴백 지원 */
  serverFallback: boolean;
  features: Feature[];
}

const ALL_FEATURES: Feature[] = ['chat', 'company_info', 'staffing'];

export const MODELS: readonly ModelSpec[] = [
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    description: '고성능 기본값 · 데이터 분석·보고서·웹 조사',
    selectable: true,
    badge: '권장',
    price: { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    thinking: 'on',
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'medium',
    sampling: false,
    forcedToolChoice: false,
    structuredOutputs: true,
    webSearchTool: 'web_search_20260209',
    serverFallback: true,
    features: ALL_FEATURES,
  },
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    description: '빠르고 경제적 · 일상 질의·요약',
    selectable: true,
    price: { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    thinking: 'on',
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    sampling: false,
    forcedToolChoice: false,
    structuredOutputs: true,
    webSearchTool: 'web_search_20260209',
    serverFallback: true,
    features: ALL_FEATURES,
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    description: '가장 빠르고 저렴 · 단순 조회·요약 (10만 토큰 넘는 요청은 단가 5배)',
    selectable: true,
    badge: '신규',
    price: { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
    longContext: { threshold: 100_000, price: { in: 0.5, out: 2.5, cacheRead: 0.05, cacheWrite: 0.625 } },
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    thinking: 'on',
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'medium',
    sampling: false,
    forcedToolChoice: true,
    structuredOutputs: true,
    // 동적 필터링(20260209) 지원 여부가 문서에 명시되지 않아 기본 버전을 쓴다
    webSearchTool: 'web_search_20250305',
    serverFallback: false,
    features: ALL_FEATURES,
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    description: '이전 Haiku (레거시) · 추론 강도 설정 없음',
    selectable: true,
    legacy: true,
    price: { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
    contextWindow: 200_000,
    maxOutput: 64_000,
    thinking: 'off',
    effortLevels: null,
    defaultEffort: null,
    sampling: true,
    forcedToolChoice: true,
    structuredOutputs: true,
    webSearchTool: 'web_search_20250305',
    serverFallback: false,
    features: ALL_FEATURES,
  },
  {
    id: 'claude-fable-5-1',
    label: 'Claude Fable 5.1',
    description: '최고 성능 · 고비용 (Opus 5.5의 약 2.5배)',
    selectable: true,
    badge: '고비용',
    price: { in: 10, out: 50, cacheRead: 0.25, cacheWrite: 12.5 },
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    thinking: 'on',
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    sampling: false,
    forcedToolChoice: false,
    structuredOutputs: true,
    webSearchTool: 'web_search_20260209',
    serverFallback: true,
    features: ALL_FEATURES,
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    description: '기존 인력배치 모델 (레거시)',
    selectable: true,
    legacy: true,
    price: { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    thinking: 'off',
    effortLevels: ['low', 'medium', 'high', 'max'],
    defaultEffort: 'high',
    sampling: true,
    forcedToolChoice: true,
    structuredOutputs: false,
    webSearchTool: 'web_search_20260209',
    serverFallback: false,
    features: ['staffing'],
  },
  // ── 가격 계산 전용: 서버측 폴백(fallbacks:'default')이 대신 응답할 수 있는 모델 ──
  pricingOnly('claude-opus-5', 'Claude Opus 5', { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 }),
  pricingOnly('claude-opus-4-8', 'Claude Opus 4.8', { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 }),
  pricingOnly('claude-sonnet-5', 'Claude Sonnet 5', { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 }),
];

function pricingOnly(id: string, label: string, price: ModelSpec['price']): ModelSpec {
  return {
    id,
    label,
    description: '',
    selectable: false,
    price,
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    thinking: 'on',
    effortLevels: null,
    defaultEffort: null,
    sampling: false,
    forcedToolChoice: false,
    structuredOutputs: true,
    webSearchTool: 'web_search_20260209',
    serverFallback: false,
    features: [],
  };
}

export interface FeatureSettings {
  model: string;
  effort: Effort | null;
  enabled: boolean;
  /** chat 전용 — 직원이 대화별로 모델을 바꿀 수 있는지 */
  allowOverride?: boolean;
  /** chat 전용 — 대화별로 고를 수 있는 모델 목록 */
  overrideModels?: string[];
}

// D1에 행이 없으면 이 값을 쓴다 (시드 데이터 불필요).
// 인력배치는 Phase 1.8의 Sonnet 4.6 동작을 그대로 유지한다.
export const DEFAULT_SETTINGS: Record<Feature, FeatureSettings> = {
  chat: {
    model: 'claude-opus-5-5',
    effort: 'medium',
    enabled: true,
    allowOverride: true,
    overrideModels: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  },
  company_info: { model: 'claude-opus-5-5', effort: 'low', enabled: true },
  staffing: { model: 'claude-sonnet-4-6', effort: null, enabled: true },
};

const MODEL_BY_ID = new Map(MODELS.map((m) => [m.id, m] as const));

/** 날짜 스냅샷 ID(claude-haiku-4-5-20251001 등)를 별칭으로 정규화 */
export function normalizeModelId(id: string): string {
  if (MODEL_BY_ID.has(id)) return id;
  const m = /^(.*)-\d{8}$/.exec(id);
  if (m && MODEL_BY_ID.has(m[1])) return m[1];
  return id;
}

export function getModel(id: unknown): ModelSpec | undefined {
  if (typeof id !== 'string' || !id) return undefined;
  return MODEL_BY_ID.get(normalizeModelId(id));
}

export function isSelectableFor(id: string, feature: Feature): boolean {
  const spec = getModel(id);
  return !!spec && spec.selectable && spec.features.includes(feature);
}

export function isEffort(v: unknown): v is Effort {
  return typeof v === 'string' && (EFFORTS as string[]).includes(v);
}

/** 모델이 지원하지 않는 effort는 버린다. Sonnet 4.6은 xhigh가 없어 high로 내린다. */
export function resolveEffort(spec: ModelSpec, effort: Effort | null | undefined): Effort | undefined {
  if (!spec.effortLevels || !effort) return undefined;
  if (spec.effortLevels.includes(effort)) return effort;
  if (effort === 'xhigh' && spec.effortLevels.includes('high')) return 'high';
  return undefined;
}

export interface ModelParams {
  /** messages.create/stream 에 그대로 펼쳐 넣는 파라미터 */
  params: Record<string, unknown>;
  betas: string[];
}

/**
 * 모델·기능별 요청 파라미터. 절대 보내지 않는 것:
 *   thinking.disabled / budget_tokens, 신모델에 sampling·강제 tool_choice,
 *   effort 미지원 모델에 effort, 헤더 없는 block_binding, prefill.
 *
 * chat 은 대화 히스토리를 원본 그대로 재전송한다(append-only). 그래도 시스템 프롬프트가
 * 배포로 바뀌는 등 앞부분이 달라지면 이전 thinking 블록이 무효가 되므로, 400 대신
 * 해당 블록만 버리도록 drop_block 을 켠다 (thinking-binding-controls 베타).
 */
export function buildModelParams(
  spec: ModelSpec,
  opts: { feature: Feature; effort?: Effort | null; historyHasFallback?: boolean },
): ModelParams {
  const params: Record<string, unknown> = {};
  const betas: string[] = [];

  if (opts.feature === 'chat' && spec.thinking === 'on') {
    params.thinking = { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } };
    betas.push('thinking-binding-controls-2026-08-01');
  }

  const effort = resolveEffort(spec, opts.effort);
  if (effort) params.output_config = { effort };

  // 안전 분류기 오탐으로 거부되면 Anthropic 권장 모델로 서버측 재시도.
  // 폴백 블록이 남은 히스토리를 재전송할 때도 같은 베타 헤더를 붙여 둔다.
  if (spec.serverFallback) {
    params.fallbacks = 'default';
    betas.push('server-side-fallback-2026-07-01');
  } else if (opts.historyHasFallback) {
    betas.push('server-side-fallback-2026-07-01');
  }

  return { params, betas };
}

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  webSearches: number;
}

export function emptyUsage(): NormalizedUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0 };
}

export function addUsage(a: NormalizedUsage, b: NormalizedUsage): NormalizedUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    webSearches: a.webSearches + b.webSearches,
  };
}

/** 정가 기준 추정 비용 (USD × 1e6). 웹 검색은 1,000회당 $10. */
export function costMicros(modelId: string, u: NormalizedUsage): number {
  const spec = getModel(modelId);
  if (!spec) return 0;
  const promptTokens = u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens;
  const p = spec.longContext && promptTokens > spec.longContext.threshold ? spec.longContext.price : spec.price;
  return Math.round(
    u.inputTokens * p.in +
      u.outputTokens * p.out +
      u.cacheReadTokens * p.cacheRead +
      u.cacheWriteTokens * p.cacheWrite +
      u.webSearches * 10_000,
  );
}

/** 설정 화면/프론트에 내려주는 공개 형태 */
export function publicModel(spec: ModelSpec) {
  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    legacy: !!spec.legacy,
    badge: spec.badge ?? null,
    price: { input: spec.price.in, output: spec.price.out, cacheRead: spec.price.cacheRead, cacheWrite: spec.price.cacheWrite },
    contextWindow: spec.contextWindow,
    maxOutput: spec.maxOutput,
    effortLevels: spec.effortLevels ?? [],
    defaultEffort: spec.defaultEffort,
    features: spec.features,
  };
}
