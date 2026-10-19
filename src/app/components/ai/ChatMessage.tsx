import { lazy, memo, Suspense, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Database, RotateCcw, ShieldAlert } from 'lucide-react';
import { formatKrw, formatTokens, formatUsd, prettyModelId } from '../../../lib/ai/format';
import type { AiModel } from '../../../lib/ai/types';
import { AiSparkle } from './AiSparkle';
import type { UiMessage } from './useAiChat';

const Markdown = lazy(() => import('./Markdown'));

const PHASE_LABELS: Record<string, string> = {
  preparing: '데이터 준비 중',
  connecting: '연결 중',
  thinking: '생각 중',
  writing: '작성 중',
  fallback: '다른 모델로 이어서 답하는 중',
};

function Elapsed({ since }: { since?: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!since) return null;
  const sec = Math.floor((Date.now() - since) / 1000);
  return sec >= 2 ? <span className="tabular-nums">{sec}초</span> : null;
}

interface Props {
  message: UiMessage;
  isLast: boolean;
  me: string;
  /** AI 답변 위에 보이는 전문가 이름 */
  expertLabel: string;
  models?: AiModel[];
  onRetry: () => void;
  onContinue: () => void;
}

export const ChatMessage = memo(function ChatMessage({ message: m, isLast, me, expertLabel, models, onRetry, onContinue }: Props) {
  const [copied, setCopied] = useState(false);

  if (m.role === 'user') {
    const showAuthor = m.userName && m.userName !== me;
    return (
      <div className="flex flex-col items-end gap-1">
        {(showAuthor || m.hasSnapshot) && (
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            {m.hasSnapshot && (
              <span className="inline-flex items-center gap-1 text-blue-500">
                <Database className="w-3 h-3" /> 최신 데이터 반영
              </span>
            )}
            {showAuthor && <span>{m.userName}</span>}
          </div>
        )}
        <div className="max-w-[88%] md:max-w-[75%] rounded-2xl rounded-br-md bg-[#f1f3f6] px-4 py-2.5 text-[14px] leading-relaxed text-slate-800 whitespace-pre-wrap break-keep wrap-anywhere">
          {m.text}
        </div>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한 없음 — 무시
    }
  };

  const refusal = m.error?.code === 'refusal';
  const footerTitle = m.usage
    ? `입력 ${m.usage.inputTokens.toLocaleString()} · 캐시 읽기 ${m.usage.cacheReadTokens.toLocaleString()} · 캐시 쓰기 ${m.usage.cacheWriteTokens.toLocaleString()} · 출력 ${m.usage.outputTokens.toLocaleString()} 토큰${m.costUsd != null ? ` · ${formatUsd(m.costUsd)}` : ''}`
    : undefined;

  return (
    <div className="flex gap-3">
      <div className="hidden sm:flex flex-shrink-0 w-7 h-7 mt-0.5 rounded-full bg-[#eef5ff] items-center justify-center">
        <AiSparkle className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="mb-1 text-[12px] font-semibold text-slate-500">{expertLabel}</p>
        {m.status === 'streaming' && !m.text && (
          <div className="flex items-center gap-2 py-2 text-[13px] text-slate-500" role="status">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 motion-safe:animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 motion-safe:animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 motion-safe:animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            <span>{PHASE_LABELS[m.phase ?? 'connecting']}…</span>
            <Elapsed since={m.phaseSince} />
          </div>
        )}

        {m.text && !refusal && (
          <div className="pt-0.5 text-[14px] text-slate-800 break-keep wrap-anywhere">
            <Suspense fallback={<div className="whitespace-pre-wrap break-words">{m.text}</div>}>
              <Markdown text={m.text} />
            </Suspense>
            {m.status === 'streaming' && <span className="inline-block w-2 h-4 align-text-bottom bg-blue-400 motion-safe:animate-pulse" />}
          </div>
        )}

        {refusal && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>{m.error?.message}</p>
            </div>
            {m.text && (
              <details className="mt-2 text-amber-700/80">
                <summary className="cursor-pointer text-[12px]">중단된 부분 응답 보기</summary>
                <div className="mt-2 opacity-70 whitespace-pre-wrap">{m.text}</div>
              </details>
            )}
          </div>
        )}

        {m.status === 'error' && !refusal && (
          <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="flex-1">{m.error?.message || '응답을 받지 못했습니다.'}</p>
            </div>
            {isLast && (
              <button
                onClick={onRetry}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-red-700 border border-red-200 hover:bg-red-100"
              >
                <RotateCcw className="w-3.5 h-3.5" /> 다시 시도
              </button>
            )}
          </div>
        )}

        {m.status === 'stopped' && (
          <div className="mt-1.5 flex items-center gap-2 text-[12px] text-slate-400">
            <span>중지됨 · 저장되지 않음</span>
            {isLast && (
              <button onClick={onRetry} className="inline-flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-700 font-medium">
                <RotateCcw className="w-3 h-3" /> 다시 묻기
              </button>
            )}
          </div>
        )}

        {m.status === 'done' && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
            {m.model && <span>{prettyModelId(m.model, models)}</span>}
            {m.usage && (
              <span title={footerTitle}>
                · 입력 {formatTokens(m.usage.inputTokens + m.usage.cacheReadTokens + m.usage.cacheWriteTokens)}
                {m.usage.cacheReadTokens > 0 && ` (캐시 ${formatTokens(m.usage.cacheReadTokens)})`} · 출력 {formatTokens(m.usage.outputTokens)}
              </span>
            )}
            {m.costUsd != null && <span title={footerTitle}>· {formatKrw(m.costUsd)}</span>}
            {m.text && (
              <button onClick={copy} className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-slate-100 hover:text-slate-600" aria-label="답변 복사">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? '복사됨' : '복사'}
              </button>
            )}
            {m.stopReason === 'max_tokens' && isLast && (
              <button onClick={onContinue} className="ml-1 text-[11px] font-medium text-blue-600 hover:text-blue-700">
                응답이 길이 제한으로 잘렸습니다 · 이어서 작성
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
