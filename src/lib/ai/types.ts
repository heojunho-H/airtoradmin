// AI(Claude) 프론트엔드 공용 타입 — 서버 계약은 functions/api/assistant.ts 주석 참고.

export type PersonaId = 'assistant' | 'sales' | 'crm' | 'supply' | 'profit';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type AiFeature = 'chat' | 'company_info' | 'staffing';

export interface AiModel {
  id: string;
  label: string;
  description: string;
  legacy: boolean;
  badge: string | null;
  /** USD / 1M tokens */
  price: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxOutput: number;
  /** 빈 배열 = 추론 강도 미지원 */
  effortLevels: Effort[];
  defaultEffort: Effort | null;
  features: AiFeature[];
}

export interface FeatureSettings {
  model: string;
  effort: Effort | null;
  enabled: boolean;
  allowOverride?: boolean;
  overrideModels?: string[];
  source?: 'default' | 'db';
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export type AiSettings = Record<AiFeature, FeatureSettings>;

export interface AiConfig {
  pinConfigured: boolean;
  personas: PersonaId[];
  limits: { messageChars: number; snapshotChars: number; messagesPerConversation: number; companyChars: number };
  models: AiModel[];
  settings: AiSettings;
}

export interface AiStatus {
  db: 'ok' | 'unbound' | 'no_tables';
  apiKey: boolean;
  pinConfigured: boolean;
  sdk: string;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  webSearches?: number;
}

export interface ConversationSummary {
  id: string;
  persona: PersonaId;
  title: string;
  createdBy: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  modelOverride: string | null;
  lastModel: string | null;
  costUsd: number;
}

export interface ConversationDetail extends ConversationSummary {
  effectiveModel: string;
  snapshotAt: string;
  snapshotChars: number;
  contextTokens: number;
}

export interface ServerMessage {
  seq: number;
  role: 'user' | 'assistant';
  text: string;
  userName: string | null;
  model: string | null;
  stopReason: string | null;
  costUsd: number | null;
  hasSnapshot: boolean;
  createdAt: string;
}

export interface AiSource {
  url: string;
  title: string;
}

export interface UsageAgg {
  calls: number;
  errors: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  webSearches: number;
}

export interface UsageReport {
  month: string;
  estimate: boolean;
  totals: UsageAgg;
  byFeatureModel: Array<UsageAgg & { feature: AiFeature; model: string; label: string }>;
  byUser: Array<{ userName: string; calls: number; costUsd: number }>;
  daily: Array<{ date: string; calls: number; costUsd: number }>;
}

/** App 이 한 번 불러둔 데이터 — 스냅샷 재료 */
export interface AiDatasets {
  deals: any[];
  customers: any[];
  managers: any[];
  subcontractors: any[];
  projects: any[];
  laborRates: any[];
  loadedAt: number;
}
