import { ChevronRight } from 'lucide-react';
import { ReactNode } from 'react';
import { BADGE, TONE, type Tone } from './ui-kit';

interface MobileCardProps {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

export function MobileCard({ onClick, children, className = '' }: MobileCardProps) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm active:shadow-md transition-all ${
        onClick ? 'cursor-pointer active:scale-[0.98]' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-3">{children}</div>
        {onClick && (
          <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0 mt-1" />
        )}
      </div>
    </div>
  );
}

interface MobileCardFieldProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function MobileCardField({ label, value, className = '' }: MobileCardFieldProps) {
  return (
    <div className={className}>
      <p className="text-[12px] font-semibold text-slate-500 mb-1">
        {label}
      </p>
      <div className="text-[15px] text-slate-900">{value}</div>
    </div>
  );
}

interface MobileCardRowProps {
  children: ReactNode;
  className?: string;
}

export function MobileCardRow({ children, className = '' }: MobileCardRowProps) {
  return <div className={`flex items-center gap-3 ${className}`}>{children}</div>;
}

interface MobileCardBadgeProps {
  children: ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'default';
  /** 데스크톱 배지와 같은 색을 쓰고 싶을 때 (ui-kit TONE). 주면 variant 보다 우선 */
  tone?: Tone;
  className?: string;
}

// 데스크톱 배지(ui-kit BADGE)와 같은 모양 — 예전에는 rounded-lg 로 달랐다
const VARIANT_TONE: Record<NonNullable<MobileCardBadgeProps['variant']>, Tone> = {
  primary: 'blue',
  success: 'emerald',
  warning: 'amber',
  danger: 'red',
  info: 'cyan',
  default: 'slate',
};

export function MobileCardBadge({ children, variant = 'default', tone, className = '' }: MobileCardBadgeProps) {
  return <span className={`${BADGE} ${TONE[tone ?? VARIANT_TONE[variant]]} ${className}`}>{children}</span>;
}
