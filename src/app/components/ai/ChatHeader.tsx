import { Database, Lock, MessageSquarePlus, PanelLeft, RefreshCw, Settings } from 'lucide-react';
import { formatKrw, formatKstDateTime } from '../../../lib/ai/format';
import { PERSONA_STYLES, PERSONAS } from '../../../lib/ai/personas';
import type { AiConfig, PersonaId } from '../../../lib/ai/types';
import type { SnapshotMeta } from './useAiChat';

interface HeaderProps {
  persona: PersonaId;
  title: string | null;
  createdBy: string | null;
  me: string;
  costUsd: number | null;
  config: AiConfig | null;
  modelChoice: string | null;
  onModelChange: (id: string | null) => void;
  modelDisabled: boolean;
  onNewChat: () => void;
  onOpenList: () => void;
  onOpenSettings?: () => void;
}

export function ChatHeader(props: HeaderProps) {
  const { persona, title, createdBy, me, costUsd, config, modelChoice, onModelChange, modelDisabled, onNewChat, onOpenList, onOpenSettings } = props;
  const p = PERSONAS[persona];
  const s = PERSONA_STYLES[persona];
  const Icon = p.icon;
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 md:px-6 py-2.5">
      <button onClick={onOpenList} className="lg:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="대화 목록 열기">
        <PanelLeft className="h-5 w-5" />
      </button>
      <span className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${s.chip}`}>
        <Icon className="h-3.5 w-3.5" />
        {p.short}
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold text-slate-900">{title || '새 대화'}</h1>
        {createdBy && createdBy !== me && <p className="truncate text-[11px] text-slate-400">{createdBy}님의 대화 · 이어서 질문할 수 있습니다</p>}
      </div>
      {costUsd != null && costUsd > 0 && (
        <span className="hidden md:inline text-[12px] text-slate-400" title="이 대화의 누적 추정 비용">
          {formatKrw(costUsd)}
        </span>
      )}
      <ModelPicker config={config} value={modelChoice} onChange={onModelChange} disabled={modelDisabled} />
      <button
        onClick={onNewChat}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-100"
        aria-label="새 대화"
        title="새 대화"
      >
        <MessageSquarePlus className="h-4 w-4" />
        <span className="hidden md:inline">새 대화</span>
      </button>
      {onOpenSettings && (
        <button onClick={onOpenSettings} className="hidden md:inline-flex rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="AI 설정" title="AI 설정">
          <Settings className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function ModelPicker({ config, value, onChange, disabled }: { config: AiConfig | null; value: string | null; onChange: (id: string | null) => void; disabled: boolean }) {
  if (!config) return null;
  const chat = config.settings.chat;
  const label = (id: string) => config.models.find((m) => m.id === id)?.label ?? id;
  if (!chat.allowOverride) {
    return (
      <span className="hidden sm:inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[12px] text-slate-600" title="관리자가 모델을 고정했습니다">
        <Lock className="h-3 w-3" /> {label(chat.model)}
      </span>
    );
  }
  const allowed = config.models.filter((m) => (chat.overrideModels ?? []).includes(m.id) || m.id === chat.model);
  const current = value && allowed.some((m) => m.id === value) ? value : chat.model;
  return (
    <>
      <label htmlFor="ai-model" className="sr-only">
        모델 선택
      </label>
      <select
        id="ai-model"
        value={current}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === chat.model ? null : e.target.value)}
        className="max-w-[9.5rem] sm:max-w-none rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[12px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60"
        title="다음 질문부터 적용됩니다"
      >
        {allowed.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
            {m.id === chat.model ? ' (기본)' : ''} · ${m.price.input}/${m.price.output}
          </option>
        ))}
      </select>
    </>
  );
}

interface SnapshotBarProps {
  meta: SnapshotMeta | null;
  pending: boolean;
  hasConversation: boolean;
  onRefresh: () => void;
  disabled: boolean;
}

export function SnapshotBar({ meta, pending, hasConversation, onRefresh, disabled }: SnapshotBarProps) {
  if (!hasConversation || !meta) return null;
  const stale = Date.now() - meta.builtAt > 24 * 3600 * 1000;
  return (
    <div className={`flex items-center gap-2 border-b px-3 md:px-6 py-1.5 text-[12px] ${stale ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-100 bg-slate-50 text-slate-500'}`}>
      <Database className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="truncate">
        데이터 기준 {formatKstDateTime(meta.builtAt)}
        {meta.summary && ` · ${meta.summary}`}
        {meta.truncated.length > 0 && ' · 일부 목록 축약'}
        {stale && ' · 하루 넘게 지난 데이터입니다'}
      </span>
      <span className="flex-1" />
      {pending ? (
        <span className="flex-shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">다음 질문부터 최신 데이터 반영</span>
      ) : (
        <button
          onClick={onRefresh}
          disabled={disabled}
          className="flex-shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-50"
          title={meta.truncated.join('\n') || undefined}
        >
          <RefreshCw className="h-3 w-3" /> 최신 데이터로 갱신
        </button>
      )}
    </div>
  );
}
