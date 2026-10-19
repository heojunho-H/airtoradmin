// AI 화면 공용 포맷터 — KST 날짜, 상대 시간, 토큰 수, 추정 원화 비용, 라벨.

import type { AiFeature, AiModel, Effort, UsageFeature } from './types';

const KST_OFFSET_MS = 9 * 3600 * 1000;

/** KST 기준 'YYYY-MM-DD' */
export function kstYmd(d: Date = new Date()): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** KST 기준 'YYYY-MM' */
export function kstMonth(d: Date = new Date()): string {
  return kstYmd(d).slice(0, 7);
}

/** 'YYYY-MM-DD' 두 날짜의 일수 차이 (to - from). 형식이 틀리면 NaN */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${(fromYmd || '').slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${(toYmd || '').slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** '10/19 14:32' (KST) */
export function formatKstDateTime(iso: string | number | Date): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '-';
  const s = new Date(t + KST_OFFSET_MS).toISOString();
  return `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))} ${s.slice(11, 16)}`;
}

export function relativeTimeKo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return '방금 전';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  const days = daysBetween(kstYmd(new Date(t)), kstYmd());
  if (days === 0) return `${Math.floor(diff / 3_600_000)}시간 전`;
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  const s = kstYmd(new Date(t));
  return `${Number(s.slice(5, 7))}월 ${Number(s.slice(8, 10))}일`;
}

export type DateGroup = '오늘' | '어제' | '지난 7일' | '이전';

export function dateGroupKo(iso: string): DateGroup {
  const days = daysBetween(kstYmd(new Date(iso)), kstYmd());
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return '지난 7일';
  return '이전';
}

export function formatTokens(n: number): string {
  if (!n) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// 추정치 — 분기마다 갱신. 실제 청구는 Anthropic Console 기준.
export const USD_TO_KRW = 1400;

export function formatKrw(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return '';
  const krw = usd * USD_TO_KRW;
  if (krw === 0) return '₩0';
  if (krw < 1) return '<₩1';
  if (krw < 10_000) return `≈₩${Math.round(krw).toLocaleString('ko-KR')}`;
  return `≈₩${(krw / 10_000).toFixed(krw < 100_000 ? 1 : 0)}만`;
}

export function formatUsd(usd: number): string {
  return `$${usd < 1 ? usd.toFixed(4) : usd.toFixed(2)}`;
}

export const EFFORT_LABELS: Record<Effort, string> = {
  low: '낮음 (빠름)',
  medium: '보통',
  high: '높음',
  xhigh: '매우 높음',
  max: '최대 (느림·고비용)',
};

export const FEATURE_LABELS: Record<AiFeature, string> = {
  chat: 'AI 어시스턴트',
  company_info: 'AI 기업정보',
  staffing: 'AI 인력배치',
};

export const USAGE_FEATURE_LABELS: Record<UsageFeature, string> = {
  ...FEATURE_LABELS,
  intake: '견적서 입력',
};

/** 'claude-haiku-4-5-20251001' → 'Claude Haiku 4.5' (목록에 없으면 ID에서 추정) */
export function prettyModelId(id: string | null | undefined, models?: AiModel[]): string {
  if (!id) return '';
  const found = models?.find((m) => m.id === id || id.startsWith(`${m.id}-`));
  if (found) return found.label;
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id);
  if (!m) return id;
  const family = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  return `Claude ${family} ${m[2]}${m[3] && m[3].length <= 2 ? `.${m[3]}` : ''}`;
}
