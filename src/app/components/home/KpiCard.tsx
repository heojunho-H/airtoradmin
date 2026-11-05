// 홈 지표 카드 — 레퍼런스 카드 문법: 제목 + 배지 + 오른쪽 위 보조 → 두 줄 → 구분선 → 큰 합계.
// 크기는 팀 75% 줌에서 레퍼런스(100% 줌)와 같게 보이도록 레퍼런스 스크린샷(2000px 폭) 좌표를 그대로 CSS px 로 쓴다.
import type { ReactNode } from 'react';

const BADGE = {
  green: 'bg-[#E8F6EC] text-[#1E9E4A]',
  blue: 'bg-[#EAF1FF] text-[#2F6BEB]',
  indigo: 'bg-[#EEEDFD] text-[#5A50DE]',
} as const;

export interface KpiRow {
  label: string;
  value: string;
}

interface KpiCardProps {
  title: string;
  badge: { text: string; tone: keyof typeof BADGE };
  aside?: ReactNode;
  rows: [KpiRow, KpiRow];
  totalLabel: string;
  total: string;
  /** 합계 왼쪽에 붙는 칩·보조 숫자 */
  totalExtra?: ReactNode;
}

export function KpiCard({ title, badge, aside, rows, totalLabel, total, totalExtra }: KpiCardProps) {
  return (
    <section className="flex min-h-[222px] min-w-0 flex-col rounded-[20px] border border-[#E7E8EB] bg-white px-5 pb-[22px] pt-[26px] shadow-[0_2px_10px_rgba(17,24,39,0.04)] md:px-[28px]">
      <div className="flex items-center gap-[10px]">
        <h3 className="text-[22px] font-bold leading-[30px] tracking-[-0.01em] text-[#1A1C20]">{title}</h3>
        <span className={`rounded-[6px] px-2 py-[3px] text-[14px] font-medium leading-[1.3] ${BADGE[badge.tone]}`}>{badge.text}</span>
        {aside && <div className="ml-auto min-w-0 truncate text-right text-[17px] tabular-nums">{aside}</div>}
      </div>
      <dl className="mt-[18px] flex flex-col gap-[10px]">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 text-[18px] leading-[24px]">
            <dt className="text-[#8B9099]">{r.label}</dt>
            <dd className="font-medium tabular-nums text-[#1A1C20]">{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mb-[18px] mt-[16px] h-px bg-[#EDEEF0]" />
      <div className="mt-auto flex items-center justify-between gap-3">
        <span className="shrink-0 whitespace-nowrap text-[16px] leading-[24px] text-[#8B9099] md:text-[18px]">{totalLabel}</span>
        <span className="flex min-w-0 items-center gap-2 md:gap-3">
          {totalExtra}
          <strong className="whitespace-nowrap text-[22px] font-bold leading-[34px] tracking-[-0.01em] tabular-nums text-[#1A1C20] md:text-[28px]">{total}</strong>
        </span>
      </div>
    </section>
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="flex min-h-[222px] flex-col gap-5 rounded-[20px] border border-[#E7E8EB] bg-white px-[28px] py-[26px]" aria-hidden>
      <div className="h-[26px] w-40 animate-pulse rounded-md bg-[#F1F2F4]" />
      <div className="h-[18px] w-full animate-pulse rounded-md bg-[#F4F5F7]" />
      <div className="h-[18px] w-full animate-pulse rounded-md bg-[#F4F5F7]" />
      <div className="mt-auto h-[30px] w-1/2 self-end animate-pulse rounded-md bg-[#F1F2F4]" />
    </div>
  );
}
