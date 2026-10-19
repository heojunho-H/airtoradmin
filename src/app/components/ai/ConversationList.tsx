import { useMemo, useState } from 'react';
import { Check, MessageSquarePlus, Pencil, Search, Trash2, X } from 'lucide-react';
import { dateGroupKo, relativeTimeKo, type DateGroup } from '../../../lib/ai/format';
import { PERSONA_ORDER, PERSONA_STYLES, PERSONAS } from '../../../lib/ai/personas';
import type { ConversationSummary, PersonaId } from '../../../lib/ai/types';
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
}

const GROUP_ORDER: DateGroup[] = ['오늘', '어제', '지난 7일', '이전'];

function isImeEnter(e: React.KeyboardEvent) {
  return e.nativeEvent.isComposing || e.keyCode === 229;
}

export function ConversationList(props: Props) {
  const { items, activeId, me, loading, error, hasMore, filter, onFilter, onLoadMore, onSelect, onNewChat, onRename, onDelete } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const groups = useMemo(() => {
    const map = new Map<DateGroup, ConversationSummary[]>();
    for (const it of items) {
      const g = dateGroupKo(it.lastMessageAt);
      map.set(g, [...(map.get(g) ?? []), it]);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => [g, map.get(g)!] as const);
  }, [items]);

  const commitRename = (id: string) => {
    const t = draft.trim();
    setEditing(null);
    if (t) onRename(id, t);
  };

  return (
    <nav className="flex h-full flex-col" aria-label="대화 목록">
      <div className="space-y-2 border-b border-slate-200 p-3">
        <button
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-purple-700"
        >
          <MessageSquarePlus className="h-4 w-4" /> 새 대화
        </button>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={filter.q}
            onChange={(e) => onFilter({ ...filter, q: e.target.value })}
            placeholder="대화 제목 검색"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {(['all', ...PERSONA_ORDER] as const).map((id) => (
            <button
              key={id}
              onClick={() => onFilter({ ...filter, persona: id })}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter.persona === id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {id === 'all' ? '전체' : PERSONAS[id as PersonaId].short}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-slate-600">
          <input type="checkbox" checked={filter.mine} onChange={(e) => onFilter({ ...filter, mine: e.target.checked })} className="rounded border-slate-300 text-purple-600 focus:ring-purple-500" />
          내 대화만 보기
        </label>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {error && <p className="px-3 py-2 text-[12px] text-red-600">{error}</p>}
        {!error && !loading && items.length === 0 && <p className="px-3 py-6 text-center text-[12px] text-slate-400">아직 대화가 없습니다</p>}
        {groups.map(([group, list]) => (
          <div key={group} className="mb-2">
            <p className="px-3 py-1 text-[11px] font-semibold text-slate-400">{group}</p>
            <ul className="space-y-0.5">
              {list.map((c) => {
                const active = c.id === activeId;
                const mine = c.createdBy === me;
                const style = PERSONA_STYLES[c.persona] ?? PERSONA_STYLES.assistant;
                return (
                  <li key={c.id}>
                    {editing === c.id ? (
                      <div className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 ring-2 ring-purple-300">
                        <input
                          autoFocus
                          value={draft}
                          maxLength={100}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isImeEnter(e)) commitRename(c.id);
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          className="min-w-0 flex-1 bg-transparent text-[13px] focus:outline-none"
                          aria-label="대화 제목"
                        />
                        <button onClick={() => commitRename(c.id)} className="rounded p-1 text-emerald-600 hover:bg-emerald-50" aria-label="저장">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setEditing(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="취소">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className={`group flex items-start gap-2 rounded-lg px-3 py-2 ${active ? 'bg-purple-50' : 'hover:bg-slate-50'}`}>
                        <button onClick={() => onSelect(c.id)} className="min-w-0 flex-1 text-left" aria-current={active ? 'true' : undefined}>
                          <span className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${style.dot}`} />
                            <span className={`truncate text-[13px] ${active ? 'font-semibold text-purple-800' : 'text-slate-700'}`}>{c.title}</span>
                          </span>
                          <span className="mt-0.5 block truncate pl-3 text-[11px] text-slate-400">
                            {c.createdBy} · {relativeTimeKo(c.lastMessageAt)} · {Math.ceil(c.messageCount / 2)}문답
                          </span>
                        </button>
                        {mine && (
                          <span className="flex flex-shrink-0 gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                            <button
                              onClick={() => {
                                setDraft(c.title);
                                setEditing(c.id);
                              }}
                              className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
                              aria-label="이름 바꾸기"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`'${c.title}' 대화를 삭제할까요? 팀 전체 목록에서 사라집니다.`)) onDelete(c.id);
                              }}
                              className="rounded p-1 text-slate-400 hover:bg-white hover:text-red-600"
                              aria-label="삭제"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {loading && <p className="px-3 py-2 text-[12px] text-slate-400">불러오는 중…</p>}
        {hasMore && !loading && (
          <button onClick={onLoadMore} className="mx-3 my-2 w-[calc(100%-1.5rem)] rounded-lg border border-slate-200 py-1.5 text-[12px] text-slate-600 hover:bg-slate-50">
            더 보기
          </button>
        )}
      </div>
    </nav>
  );
}
