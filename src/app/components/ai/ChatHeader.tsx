import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLast, PanelLeft, SquarePen } from 'lucide-react';
import { formatKrw } from '../../../lib/ai/format';
import { PERSONA_ORDER, PERSONAS } from '../../../lib/ai/personas';
import type { PersonaId } from '../../../lib/ai/types';

interface HeaderProps {
  persona: PersonaId;
  title: string | null;
  createdBy: string | null;
  me: string;
  costUsd: number | null;
  /** 데스크톱에서 대화 패널을 접어 둔 상태 — 펼치기·새 대화 버튼을 헤더에 보인다 */
  panelCollapsed: boolean;
  onExpandPanel: () => void;
  onOpenList: () => void;
  onNewChat: () => void;
  /** 다른 전문가로 새 대화 (마지막 질문을 입력창에 옮긴다) */
  onSwitchExpert: (p: PersonaId) => void;
  disabled: boolean;
}

function ExpertSwitcher({ current, onPick, disabled }: { current: PersonaId; onPick: (p: PersonaId) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
        aria-haspopup="menu"
        aria-expanded={open}
        title="다른 전문가에게 이어서 묻기 (새 대화)"
      >
        <span className="hidden sm:inline">전문가 바꾸기</span>
        <span className="sm:hidden">전문가</span>
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <p className="px-2.5 pb-1 pt-1 text-[11px] text-slate-400">새 대화로 열리고 마지막 질문이 입력창에 채워집니다</p>
          {PERSONA_ORDER.filter((id) => id !== current).map((id) => {
            const p = PERSONAS[id];
            const Icon = p.icon;
            return (
              <button
                key={id}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPick(id);
                }}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50"
              >
                <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" strokeWidth={1.9} />
                <span>
                  <span className="block text-[13px] font-medium text-slate-800">{p.label}</span>
                  <span className="block text-[11px] text-slate-500">{p.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 대화 화면 상단의 얇은 헤더 (빈 화면에는 없다) */
export function ChatHeader(props: HeaderProps) {
  const { persona, title, createdBy, me, costUsd, panelCollapsed, onExpandPanel, onOpenList, onNewChat, onSwitchExpert, disabled } = props;
  const expert = PERSONAS[persona];
  const Icon = expert.icon;
  const other = createdBy && createdBy !== me;
  return (
    <div className="flex h-12 flex-shrink-0 items-center gap-1.5 border-b border-slate-100 bg-white px-3 md:px-5">
      <button onClick={onOpenList} className="lg:hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="대화 목록 열기">
        <PanelLeft className="h-[18px] w-[18px]" />
      </button>
      {panelCollapsed && (
        <button onClick={onExpandPanel} className="hidden lg:inline-flex rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="대화 목록 펼치기" title="대화 목록 펼치기">
          <ChevronLast className="h-[18px] w-[18px]" />
        </button>
      )}
      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-[#eef5ff] px-2 py-1 text-[12px] font-semibold text-[#1d4fb8]">
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        {expert.label}
      </span>
      <h1 className="min-w-0 flex-1 truncate pl-1 text-[14px] font-semibold text-slate-800">{title || '새 대화'}</h1>
      {other && <span className="hidden md:inline truncate text-[12px] text-slate-400">{createdBy}님의 대화</span>}
      {costUsd != null && costUsd > 0 && (
        <span className="hidden md:inline pl-2 text-[12px] text-slate-400" title="이 대화의 누적 추정 비용">
          {formatKrw(costUsd)}
        </span>
      )}
      <ExpertSwitcher current={persona} onPick={onSwitchExpert} disabled={disabled} />
      <button
        onClick={onNewChat}
        className={`${panelCollapsed ? 'inline-flex' : 'inline-flex lg:hidden'} rounded-lg p-2 text-slate-500 hover:bg-slate-100`}
        aria-label="새 대화"
        title="새 대화"
      >
        <SquarePen className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}
