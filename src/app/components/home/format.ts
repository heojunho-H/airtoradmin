// 홈 화면 공용 표기 — 날짜(YY.MM.DD·요일)·금액.
import { kstYmd } from '../../../lib/ai/format';

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 'YYYY-MM-DD' 의 요일 (0=일) */
export function weekdayOf(ymdStr: string): number {
  return new Date(`${ymdStr}T00:00:00Z`).getUTCDay();
}

/** '2026-11-05' → '26.11.05' */
export function shortYmd(ymdStr: string): string {
  return ymdStr ? ymdStr.slice(2, 10).replace(/-/g, '.') : '';
}

/** '2026-11-08' → '11/8 (일)' */
export function mdDow(ymdStr: string): string {
  return `${Number(ymdStr.slice(5, 7))}/${Number(ymdStr.slice(8, 10))} (${WEEKDAYS[weekdayOf(ymdStr)]})`;
}

/** ISO 시각 → KST 'YY.MM.DD' */
export function shortKstDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : shortYmd(kstYmd(d));
}

/** '01012345678' → '010-1234-5678', '0212345678' → '02-1234-5678'. 모르는 형식은 그대로 */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.startsWith('02') && (d.length === 9 || d.length === 10)) return `02-${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

export function won(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

export function addYmd(ymdStr: string, days: number): string {
  const d = new Date(`${ymdStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
