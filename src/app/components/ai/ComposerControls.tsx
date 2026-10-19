// 입력창 안의 보조 컨트롤 — 모델 칩(전송 버튼 옆)과 `+` 데이터 메뉴(왼쪽).
// 데이터 메뉴: 질문과 함께 보낼 데이터의 기준 시각·건수, 대화 중이면 '최신 데이터로 갱신'.

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Lock, Plus, RefreshCw } from 'lucide-react';
import { formatKstDateTime } from '../../../lib/ai/format';
import type { AiConfig } from '../../../lib/ai/types';
import type { SnapshotMeta } from './useAiChat';

const STALE_MS = 24 * 3600 * 1000;

function shortModelLabel(label: string) {
  return label.replace(/^Claude\s+/, '');
}

interface ModelPickerProps {
  config: AiConfig | null;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled: boolean;
}

/** 짧은 라벨만 보이고, 누르면 가격이 붙은 전체 목록(native select)이 열린다. */
export function ModelPicker({ config, value, onChange, disabled }: ModelPickerProps) {
  if (!config) return null;
  const chat = config.settings.chat;
  const label = (id: string) => config.models.find((m) => m.id === id)?.label ?? id;
  if (!chat.allowOverride) {
    return (
      <span className="inline-flex items-center gap-1 px-1 text-[12px] text-slate-400" title="관리자가 모델을 고정했습니다">
        <Lock className="h-3 w-3" /> {shortModelLabel(label(chat.model))}
      </span>
    );
  }
  const allowed = config.models.filter((m) => (chat.overrideModels ?? []).includes(m.id) || m.id === chat.model);
  const current = value && allowed.some((m) => m.id === value) ? value : chat.model;
  return (
    <span className={`relative inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[12px] font-medium text-slate-500 ${disabled ? 'opacity-50' : 'hover:bg-slate-100 hover:text-slate-700'}`}>
      {shortModelLabel(label(current))}
      <ChevronDown className="h-3 w-3" />
      <select
        aria-label="모델 선택 (다음 질문부터 적용)"
        title="다음 질문부터 적용됩니다"
        value={current}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === chat.model ? null : e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      >
        {allowed.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
            {m.id === chat.model ? ' (기본)' : ''} · ${m.price.input}/${m.price.output}
          </option>
        ))}
      </select>
    </span>
  );
}

interface DataMenuProps {
  meta: SnapshotMeta | null;
  pending: boolean;
  hasConversation: boolean;
  /** 새 대화일 때 보낼 데이터 요약 (예: "딜 812 · 고객 340 · 프로젝트 120") */
  datasetSummary: string;
  onRefresh: () => void;
  disabled: boolean;
  placement: 'up' | 'down';
}

export function DataMenu({ meta, pending, hasConversation, datasetSummary, onRefresh, disabled, placement }: DataMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const stale = hasConversation && !!meta && Date.now() - meta.builtAt > STALE_MS;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label="분석에 쓰는 데이터"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="분석에 쓰는 데이터"
      >
        <Plus className="h-5 w-5" strokeWidth={1.75} />
        {(stale || pending) && (
          <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-white ${pending ? 'bg-blue-500' : 'bg-amber-500'}`} />
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="분석에 쓰는 데이터"
          className={`absolute left-0 z-30 w-72 rounded-xl border border-slate-200 bg-white p-3.5 text-[13px] shadow-lg ${placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          <p className="font-semibold text-slate-800">분석에 쓰는 데이터</p>
          {hasConversation && meta ? (
            <div className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-slate-500">
              <p>
                기준 {formatKstDateTime(meta.builtAt)}
                {meta.summary && ` · ${meta.summary}`}
              </p>
              {meta.truncated.length > 0 && <p title={meta.truncated.join('\n')}>목록이 길어 일부는 줄여서 보냈습니다.</p>}
              {stale && <p className="font-medium text-amber-600">하루 넘게 지난 데이터입니다. 갱신을 권장합니다.</p>}
            </div>
          ) : (
            <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500">
              질문을 보내면 지금 불러온 데이터{datasetSummary && `(${datasetSummary})`}를 함께 보냅니다. 연락처는 보내지 않습니다.
            </p>
          )}
          {hasConversation &&
            (pending ? (
              <p className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-medium text-blue-600">
                <Check className="h-3.5 w-3.5" /> 다음 질문에 최신 데이터가 반영됩니다
              </p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onRefresh();
                  setOpen(false);
                }}
                disabled={disabled}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[12px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" /> 최신 데이터로 갱신
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
