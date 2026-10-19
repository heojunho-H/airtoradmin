import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import type { AiModel } from '../../../lib/ai/types';
import { ChatMessage } from './ChatMessage';
import type { UiMessage } from './useAiChat';

interface Props {
  messages: UiMessage[];
  me: string;
  models?: AiModel[];
  isActive: boolean;
  conversationKey: string;
  onRetry: () => void;
  onContinue: () => void;
}

/** 바닥 근처에 있을 때만 자동으로 따라 내려간다. 숨김 → 다시 보일 때 스크롤 위치를 복원한다. */
export function ChatThread({ messages, me, models, isActive, conversationKey, onRetry, onContinue }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const saved = useRef(0);
  const [showJump, setShowJump] = useState(false);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stick.current = near;
    saved.current = el.scrollTop;
    setShowJump(!near);
  };

  // 대화를 바꾸면 맨 아래에서 시작
  useLayoutEffect(() => {
    stick.current = true;
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversationKey]);

  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // display:none 이었다가 돌아오면 브라우저가 scrollTop 을 0으로 돌려놓는 경우가 있다
  useLayoutEffect(() => {
    const el = ref.current;
    if (isActive && el) el.scrollTop = stick.current ? el.scrollHeight : saved.current;
  }, [isActive]);

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={ref} onScroll={onScroll} className="h-full overflow-y-auto px-4 md:px-8 py-6" role="log" aria-live="off" aria-label="대화 내용">
        <div className="mx-auto max-w-3xl space-y-5">
          {messages.map((m, i) => (
            <ChatMessage key={m.key} message={m} isLast={i === messages.length - 1} me={me} models={models} onRetry={onRetry} onContinue={onContinue} />
          ))}
        </div>
      </div>
      {showJump && (
        <button
          onClick={() => {
            const el = ref.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
          }}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 shadow-md border border-slate-200 hover:bg-slate-50"
        >
          <ArrowDown className="w-3.5 h-3.5" /> 최신
        </button>
      )}
    </div>
  );
}
