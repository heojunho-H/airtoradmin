// 공통 화면 규칙 — 업무 4페이지(영업·프로젝트·고객·공급망)가 같이 쓰는 버튼·카드·지표·타일·표·배지·입력칸 모양.
// 원칙(2026-11-05, 팀 40대·75% 줌): 자리·문구·순서는 그대로 두고 겉모습만 맞춘다.
//  - 뜻 없는 색은 파랑 하나로. 뜻 있는 색(영업 단계, 고객 등급, 손익 단계, 좋음/주의/위험)만 남긴다.
//  - '좋음'은 emerald 하나(green 혼용 금지), 중립은 slate 하나(gray 혼용 금지).
//  - 배지는 -50 바탕 / -700 글자 / -200 테두리(대비 AA), 모양은 rounded-full 하나.
// Tailwind 4 는 소스에 적힌 리터럴 클래스만 만들므로 문자열을 통째로 적는다. 크기 클래스끼리 겹치지 않게
// 모양(BTN_BASE) · 색(BTN_TONE) · 크기(BTN_SIZE)를 나눠 두고 btn() 으로 합친다.

export const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed';

export const BTN_TONE = {
  /** 파랑 채움 — 화면마다 하나뿐인 주 동작(추가·저장·확인) */
  primary: 'bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:bg-slate-300 disabled:shadow-none',
  /** 흰 바탕 + 회색 테두리 — 보조 동작(내보내기·취소·닫기·목록보기) */
  secondary: 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50',
  /** 빨강 채움 — 지우기 확인 */
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:bg-slate-300 disabled:shadow-none',
  /** 바탕 없이 글자만 — 덜 중요한 동작 */
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:opacity-50',
} as const;

export const BTN_SIZE = {
  /** 머리 줄 버튼(추가·내보내기) */
  md: 'px-5 py-2.5 text-[14px]',
  /** 팝업 아래쪽 꽉 찬 버튼 */
  lg: 'px-4 py-3 text-[15px]',
  /** 카드·표 안의 작은 버튼 */
  sm: 'px-3 py-1.5 text-[13px]',
} as const;

export function btn(tone: keyof typeof BTN_TONE, size: keyof typeof BTN_SIZE = 'md'): string {
  return `${BTN_BASE} ${BTN_TONE[tone]} ${BTN_SIZE[size]}`;
}

/** 아이콘만 있는 버튼 — 36px 이상(75% 줌에서 27px 이상) */
export const ICON_BTN =
  'inline-flex items-center justify-center rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700';
/** 지우기 아이콘 버튼 — 평소 회색, 마우스를 올리면 빨강 */
export const ICON_BTN_DANGER =
  'inline-flex items-center justify-center rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600';

/** 흰 카드 */
export const CARD = 'rounded-xl border border-slate-200 bg-white shadow-sm';

/** 지표 카드 — 아이콘은 모두 파랑. 값 색은 뜻이 있을 때만(손실 빨강 등) 바꾼다 */
export const KPI = {
  card: 'rounded-xl border border-slate-200 bg-white p-6 shadow-sm',
  label: 'text-[13px] font-semibold text-slate-500',
  value: 'mt-2 text-[32px] font-bold tracking-tight text-slate-900 tabular-nums',
  sub: 'mt-1 text-[12px] text-slate-500',
  iconTile: 'shrink-0 rounded-xl bg-blue-50 p-3',
  icon: 'h-6 w-6 text-blue-600',
} as const;

/** 상세 팝업 안 숫자 타일 — 중립 회색. 꼭 강조할 하나만 accent */
export const TILE = {
  box: 'rounded-xl border border-slate-200 bg-slate-50 p-4',
  label: 'text-[13px] font-medium text-slate-500',
  value: 'mt-1.5 text-xl font-bold text-slate-900 tabular-nums',
  accentBox: 'rounded-xl border border-blue-200 bg-blue-50 p-4',
  accentLabel: 'text-[13px] font-medium text-blue-700',
  accentValue: 'mt-1.5 text-xl font-bold text-blue-900 tabular-nums',
} as const;

/** 표 — 머리글은 한글에 맞게(대문자·넓은 자간 없음), 누르는 행은 연한 파랑으로 hover */
export const TABLE = {
  wrap: 'rounded-xl border border-slate-200 bg-white shadow-sm',
  thead: 'border-b border-slate-200 bg-slate-50',
  th: 'text-xs font-semibold text-slate-600',
  thSortable: 'cursor-pointer select-none transition-colors hover:bg-slate-100 hover:text-slate-900',
  rowClickable: 'cursor-pointer transition-colors hover:bg-blue-50/40',
} as const;

/** 배지 모양 하나 + 색(TONE) */
export const BADGE = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium';

export const TONE = {
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  red: 'border-red-200 bg-red-50 text-red-700',
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  purple: 'border-purple-200 bg-purple-50 text-purple-700',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  orange: 'border-orange-200 bg-orange-50 text-orange-700',
  rose: 'border-rose-200 bg-rose-50 text-rose-700',
} as const;

export type Tone = keyof typeof TONE;

/** 영업 7단계 색 — 단계를 알아보는 색이라 그대로 둔다(신규 파랑 … 수주확정 초록). 배지·아이콘·점에 같은 계열을 쓴다 */
export const STAGE_COLORS: Record<string, { tone: Tone; iconTile: string; dot: string }> = {
  blue: { tone: 'blue', iconTile: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  cyan: { tone: 'cyan', iconTile: 'bg-cyan-100 text-cyan-700', dot: 'bg-cyan-500' },
  purple: { tone: 'violet', iconTile: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
  indigo: { tone: 'indigo', iconTile: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
  amber: { tone: 'amber', iconTile: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  orange: { tone: 'orange', iconTile: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  green: { tone: 'emerald', iconTile: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
};

/** 입력칸 — 테두리 slate-300, 포커스 링은 파랑 하나 */
export const INPUT =
  'rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500';

/** 팝업 닫기(X) 버튼 */
export const MODAL_CLOSE =
  'inline-flex items-center justify-center rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700';
