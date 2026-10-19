import { useEffect, useRef, useState } from 'react';
import { Send, Square } from 'lucide-react';

interface Props {
  streaming: boolean;
  disabled?: boolean;
  maxChars: number;
  autoFocus: boolean;
  placeholder?: string;
  onSend: (text: string) => void;
  onStop: () => void;
}

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export function ChatComposer({ streaming, disabled, maxChars, autoFocus, placeholder, onSend, onStop }: Props) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && !isTouch) ref.current?.focus();
  }, [autoFocus]);

  // 내용에 맞춰 높이 자동 조절 (최대 200px)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const over = text.length > maxChars;

  const submit = () => {
    const t = text.trim();
    // 글자 수 초과면 보내지도 지우지도 않는다 (붙여넣은 긴 질문이 사라지지 않게)
    if (!t || streaming || disabled || over) return;
    onSend(t);
    setText('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    // 한글 조합 중 Enter 는 글자 확정용 — 전송하면 마지막 글자가 두 번 들어간다 (Safari 는 keyCode 229)
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (isTouch) return; // 모바일은 Enter = 줄바꿈, 전송은 버튼
    e.preventDefault();
    submit();
  };

  return (
    <div className="border-t border-slate-200 bg-white px-4 md:px-8 py-3">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2">
          <label htmlFor="ai-composer" className="sr-only">
            질문 입력
          </label>
          <textarea
            id="ai-composer"
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={disabled}
            placeholder={placeholder ?? '질문을 입력하세요'}
            aria-describedby="ai-composer-hint"
            className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[14px] leading-relaxed placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-60"
            style={{ minHeight: 44 }}
          />
          {streaming ? (
            <button
              onClick={onStop}
              className="flex-shrink-0 h-11 w-11 inline-flex items-center justify-center rounded-xl bg-slate-800 text-white hover:bg-slate-900"
              aria-label="응답 중지"
              title="응답 중지"
            >
              <Square className="w-4 h-4" fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim() || over || disabled}
              className="flex-shrink-0 h-11 w-11 inline-flex items-center justify-center rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:bg-slate-200 disabled:cursor-not-allowed"
              aria-label="보내기"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
        <div id="ai-composer-hint" className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
          <span>{isTouch ? '전송은 버튼으로 · 대화는 팀 전체에 공유됩니다' : 'Enter 전송 · Shift+Enter 줄바꿈 · 대화는 팀 전체에 공유됩니다'}</span>
          {text.length > maxChars * 0.4 && (
            <span className={over ? 'text-red-500 font-medium' : ''}>
              {text.length.toLocaleString()} / {maxChars.toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
