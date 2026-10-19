import { ChevronLast, PanelLeft, SquarePen } from 'lucide-react';
import { formatKrw } from '../../../lib/ai/format';
import { PERSONAS } from '../../../lib/ai/personas';
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
}

/** 대화 화면 상단의 얇은 헤더 (빈 화면에는 없다) */
export function ChatHeader({ persona, title, createdBy, me, costUsd, panelCollapsed, onExpandPanel, onOpenList, onNewChat }: HeaderProps) {
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
      <h1 className="min-w-0 flex-1 truncate pl-1 text-[14px] font-semibold text-slate-800">{title || '새 대화'}</h1>
      <span className="hidden sm:inline truncate text-[12px] text-slate-400">
        {PERSONAS[persona].tab}
        {other && ` · ${createdBy}님의 대화`}
      </span>
      {costUsd != null && costUsd > 0 && (
        <span className="hidden md:inline pl-2 text-[12px] text-slate-400" title="이 대화의 누적 추정 비용">
          {formatKrw(costUsd)}
        </span>
      )}
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
