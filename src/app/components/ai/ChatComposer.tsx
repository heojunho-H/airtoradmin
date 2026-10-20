import { useEffect, useRef, type ReactNode } from 'react';
import { Square } from 'lucide-react';
import { AiSparkle } from './AiSparkle';

interface Props {
  /** hero = 빈 화면 가운데의 큰 입력창(파란 테두리), dock = 대화 화면 하단 */
  variant: 'hero' | 'dock';
  /** 초안은 페이지가 보관한다 — 빈 화면 ↔ 대화 화면으로 바뀌어도 지워지지 않게 */
  value: string;
  onChange: (text: string) => void;
  streaming: boolean;
  disabled?: boolean;
  maxChars: number;
  autoFocus: boolean;
  placeholder?: string;
  onSend: (text: string) => void;
  onStop: () => void;
  /** 왼쪽 — `+` 데이터 메뉴 */
  leading?: ReactNode;
  /** 전송 버튼 앞 — 모델 칩 */
  trailing?: ReactNode;
}

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export function ChatComposer({ variant, value, onChange, streaming, disabled, maxChars, autoFocus, placeholder, onSend, onStop, leading, trailing }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && !isTouch) ref.current?.focus();
  }, [autoFocus]);

  // 내용에 맞춰 높이 자동 조절 (최대 200px)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value]);

  const over = value.length > maxChars;
  const canSend = !!value.trim() && !over && !disabled;

  const submit = () => {
    const t = value.trim();
    // 글자 수 초과면 보내지도 지우지도 않는다 (붙여넣은 긴 질문이 사라지지 않게)
    if (!t || streaming || disabled || over) return;
    onSend(t);
    onChange('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    // 한글 조합 중 Enter 는 글자 확정용 — 전송하면 마지막 글자가 두 번 들어간다 (Safari 는 keyCode 229)
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (isTouch) return; // 모바일은 Enter = 줄바꿈, 전송은 버튼
    e.preventDefault();
    submit();
  };

  const frame =
    variant === 'hero'
      ? 'border-[#5b9cf2] shadow-[0_6px_24px_rgba(59,130,246,0.08)]'
      : 'border-slate-200 shadow-[0_2px_12px_rgba(15,23,42,0.05)] focus-within:border-[#5b9cf2]';

  return (
    <div>
      <div className={`flex items-end gap-1 rounded-xl border bg-white p-2 transition-colors ${frame} ${disabled ? 'opacity-70' : ''}`}>
        {leading}
        <label htmlFor={`ai-composer-${variant}`} className="sr-only">
          질문 입력
        </label>
        <textarea
          id={`ai-composer-${variant}`}
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={disabled}
          placeholder={placeholder ?? '질문을 입력하세요'}
          className="min-w-0 flex-1 resize-none bg-transparent px-2 py-[6px] text-[19px] leading-[28px] text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
        />
        {trailing && <div className="flex h-10 flex-shrink-0 items-center">{trailing}</div>}
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-slate-800 text-white hover:bg-slate-900"
            aria-label="응답 중지"
            title="응답 중지"
          >
            <Square className="h-3.5 w-3.5" fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#3b82f6] text-white transition-colors hover:bg-[#2f6fe0] disabled:cursor-not-allowed disabled:bg-[#dfe3e8]"
            aria-label="보내기"
          >
            <AiSparkle variant="white" className="h-5 w-5" />
          </button>
        )}
      </div>
      {value.length > maxChars * 0.4 && (
        <p className={`mt-1 pr-1 text-right text-[14px] ${over ? 'font-medium text-red-500' : 'text-slate-400'}`}>
          {value.length.toLocaleString()} / {maxChars.toLocaleString()}
        </p>
      )}
    </div>
  );
}
