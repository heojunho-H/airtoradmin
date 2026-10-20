import { useEffect, useRef, useState } from 'react';
import { Check, ChevronFirst, Ellipsis, Pencil, Plus, Search, Settings, Trash2, X } from 'lucide-react';
import { relativeTimeKo } from '../../../lib/ai/format';
import { PERSONAS } from '../../../lib/ai/personas';
import type { ConversationSummary } from '../../../lib/ai/types';
import { AiSparkle } from './AiSparkle';
import type { ListFilter } from './useConversationList';

interface Props {
  items: ConversationSummary[];
  activeId: string | null;
  me: string;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  filter: ListFilter;
  onFilter: (f: ListFilter) => void;
  onLoadMore: () => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  /** 데스크톱에서 패널 접기 (모바일 드로어에서는 넘기지 않는다) */
  onCollapse?: () => void;
  /** 모바일 드로어 닫기 */
  onClose?: () => void;
  onOpenSettings?: () => void;
}

function isImeEnter(e: React.KeyboardEvent) {
  return e.nativeEvent.isComposing || e.keyCode === 229;
}

/** AI 페이지 왼쪽 대화 패널 — 브랜드, 새 대화, 최근 대화(팀 공유) 제목 목록 */
export function ConversationList(props: Props) {
  const { items, activeId, me, loading, error, hasMore, filter, onFilter, onLoadMore, onSelect, onNewChat, onRename, onDelete, onCollapse, onClose, onOpenSettings } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(() => !!filter.q || filter.mine);
  const menuRef = useRef<HTMLLIElement>(null);
  const filtered = !!filter.q || filter.mine;

  useEffect(() => {
    if (!menuFor) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuFor(null);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuFor]);

  const toggleSearch = () => {
    // 검색을 닫으면 조건도 지운다 — 표시 없이 걸러진 목록이 남지 않게
    if (searchOpen && filtered) onFilter({ ...filter, q: '', mine: false });
    setSearchOpen((v) => !v);
  };

  const commitRename = (id: string) => {
    const t = draft.trim();
    setEditing(null);
    if (t) onRename(id, t);
  };

  return (
    <nav className="flex h-full flex-col bg-[#f7f8fa]" aria-label="대화 목록">
      <div className="flex h-14 flex-shrink-0 items-center justify-between pl-4 pr-2">
        <span className="flex items-center gap-1.5">
          <AiSparkle className="h-7 w-7" />
          <span className="bg-gradient-to-r from-[#5b9cf2] to-[#2357c7] bg-clip-text text-[24px] font-bold tracking-tight text-transparent">AIRTOR AI</span>
        </span>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="hidden lg:inline-flex rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600"
            aria-label="대화 목록 접기"
            title="대화 목록 접기"
          >
            <ChevronFirst className="h-[18px] w-[18px]" />
          </button>
        )}
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600" aria-label="닫기">
            <X className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>

      <div className="flex-shrink-0 px-3">
        <button
          onClick={onNewChat}
          className="flex h-10 w-full items-center gap-2 rounded-lg bg-[#eceef2] px-3 text-[18px] font-medium text-slate-800 transition-colors hover:bg-[#e2e5ea]"
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={2} /> 새 대화
        </button>
      </div>

      <div className="mt-6 flex flex-shrink-0 items-center justify-between pl-4 pr-2">
        <span className="text-[17px] font-semibold text-slate-700">최근 대화</span>
        <button
          onClick={toggleSearch}
          className={`rounded-md p-1.5 hover:bg-slate-200/60 ${searchOpen || filtered ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
          aria-label="대화 검색"
          aria-expanded={searchOpen}
          title="대화 검색"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>
      {searchOpen && (
        <div className="mt-1.5 flex-shrink-0 space-y-1.5 px-3">
          <input
            autoFocus
            value={filter.q}
            onChange={(e) => onFilter({ ...filter, q: e.target.value })}
            placeholder="대화 제목 검색"
            aria-label="대화 제목 검색"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[17px] placeholder:text-slate-400 focus:border-[#5b9cf2] focus:outline-none"
          />
          <label className="flex items-center gap-1.5 px-1 text-[15px] text-slate-500">
            <input type="checkbox" checked={filter.mine} onChange={(e) => onFilter({ ...filter, mine: e.target.checked })} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            내 대화만 보기
          </label>
        </div>
      )}

      <div className="mt-1.5 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {error && <p className="px-3 py-2 text-[15px] text-red-600">{error}</p>}
        {!error && !loading && items.length === 0 && (
          <p className="px-3 py-6 text-center text-[15px] text-slate-400">{filtered ? '조건에 맞는 대화가 없습니다' : '아직 대화가 없습니다'}</p>
        )}
        <ul>
          {items.map((c) => {
            const active = c.id === activeId;
            const mine = c.createdBy === me;
            if (editing === c.id) {
              return (
                <li key={c.id} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 ring-2 ring-blue-300">
                  <input
                    autoFocus
                    value={draft}
                    maxLength={100}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isImeEnter(e)) commitRename(c.id);
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-[18px] focus:outline-none"
                    aria-label="대화 제목"
                  />
                  <button onClick={() => commitRename(c.id)} className="rounded p-1 text-emerald-600 hover:bg-emerald-50" aria-label="저장">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setEditing(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="취소">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            }
            return (
              <li key={c.id} ref={menuFor === c.id ? menuRef : undefined} className="group relative">
                <button
                  onClick={() => onSelect(c.id)}
                  title={`${c.title}\n${PERSONAS[c.persona]?.label ?? ''} · ${c.createdBy} · ${relativeTimeKo(c.lastMessageAt)}`}
                  aria-current={active ? 'true' : undefined}
                  className={`block w-full truncate rounded-lg px-3 py-2.5 text-left text-[18px] transition-colors ${mine ? 'pr-9' : ''} ${
                    active ? 'bg-[#e6e9ee] font-medium text-slate-900' : 'text-slate-700 hover:bg-[#eceef2]'
                  }`}
                >
                  {c.title}
                </button>
                {mine && (
                  <button
                    onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus:opacity-100 ${
                      menuFor === c.id ? 'opacity-100' : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100'
                    }`}
                    aria-label={`'${c.title}' 대화 메뉴`}
                    aria-haspopup="menu"
                    aria-expanded={menuFor === c.id}
                  >
                    <Ellipsis className="h-4 w-4" />
                  </button>
                )}
                {menuFor === c.id && (
                  <div role="menu" className="absolute right-1 top-full z-20 mt-1 w-32 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuFor(null);
                        setDraft(c.title);
                        setEditing(c.id);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-[17px] text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5" /> 이름 바꾸기
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuFor(null);
                        if (window.confirm(`'${c.title}' 대화를 삭제할까요? 팀 전체 목록에서 사라집니다.`)) onDelete(c.id);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-[17px] text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> 삭제
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {loading && <p className="px-3 py-2 text-[15px] text-slate-400">불러오는 중…</p>}
        {hasMore && !loading && (
          <button onClick={onLoadMore} className="mt-1 w-full rounded-lg py-1.5 text-[15px] text-slate-500 hover:bg-slate-200/50">
            더 보기
          </button>
        )}
      </div>

      {onOpenSettings && (
        <div className="flex-shrink-0 border-t border-slate-200/70 px-2 py-2">
          <button onClick={onOpenSettings} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[15px] text-slate-500 hover:bg-slate-200/50 hover:text-slate-700">
            <Settings className="h-4 w-4" /> AI 설정
          </button>
        </div>
      )}
    </nav>
  );
}
