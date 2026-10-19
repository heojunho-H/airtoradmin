import { useId } from 'react';

interface Props {
  className?: string;
  /** gradient = 파란 그라데이션 채움(브랜드), white = currentColor (전송 버튼 등) */
  variant?: 'gradient' | 'white';
}

/** AI 브랜드 별 — 오목한 네 꼭짓점 별. 한 화면에 여러 개가 있어도 그라데이션 id 가 겹치지 않게 useId 를 쓴다. */
export function AiSparkle({ className = 'h-5 w-5', variant = 'gradient' }: Props) {
  const id = `ai-sparkle-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      {variant === 'gradient' && (
        <defs>
          <linearGradient id={id} x1="5" y1="1.5" x2="19" y2="22.5" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#9bd6ff" />
            <stop offset="0.55" stopColor="#5a9cf2" />
            <stop offset="1" stopColor="#2c63d6" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 1.5c.55 5.6 4.9 9.95 10.5 10.5-5.6.55-9.95 4.9-10.5 10.5C11.45 16.9 7.1 12.55 1.5 12 7.1 11.45 11.45 7.1 12 1.5z"
        fill={variant === 'gradient' ? `url(#${id})` : 'currentColor'}
      />
    </svg>
  );
}
