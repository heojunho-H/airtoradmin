import { ChevronRight } from 'lucide-react';
import { ReactNode } from 'react';

interface MobileCardProps {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

export function MobileCard({ onClick, children, className = '' }: MobileCardProps) {
  return (
    <div
      onClick={onClick}
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
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
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
  className?: string;
}

export function MobileCardBadge({ children, variant = 'default', className = '' }: MobileCardBadgeProps) {
  const variants = {
    primary: 'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-green-50 text-green-700 border-green-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    default: 'bg-slate-50 text-slate-700 border-slate-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[12px] font-semibold border ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
