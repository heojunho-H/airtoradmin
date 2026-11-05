// 오늘의 할 일 — 진행중 / 완료 밑줄 탭, 카드 목록, 페이지 넘김 + 'n개씩 보기' (레퍼런스 할 일 페이지 그대로)
// 진행중 = 계산된 재계약 연락 할 일 중 완료 기록이 없는 것. 완료 = D1 완료 기록 최근순.
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import type { RenewalTodo } from '../../../lib/home/metrics';
import type { TodoRecordsState } from '../../../lib/home/useTodoRecords';
import { TodoCard } from './TodoCard';
import { UndoToast, useUndoToast } from './UndoToast';

type Tab = 'progress' | 'done';
const PAGE_SIZES = [10, 20, 50];

interface TodoPageProps {
  /** 계산된 재계약 연락 할 일 전체 (급한 순) */
  todos: RenewalTodo[];
  todoState: TodoRecordsState;
  /** 고객 데이터를 아직 못 불러옴 */
  loading: boolean;
  onOpenCustomer: (customerId: number) => void;
}

export function TodoPage({ todos, todoState, loading, onOpenCustomer }: TodoPageProps) {
  const [tab, setTab] = useState<Tab>('progress');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const { toast, show, clear } = useUndoToast();
  const { records, status, error, complete, undo } = todoState;

  const todoByKey = useMemo(() => new Map(todos.map((t) => [t.key, t])), [todos]);
  const progress = useMemo(() => todos.filter((t) => !records.has(t.key)), [todos, records]);
  const done = useMemo(() => [...records.values()].sort((a, b) => b.doneAt.localeCompare(a.doneAt)), [records]);

  const total = tab === 'progress' ? progress.length : done.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  const start = (Math.min(page, pages) - 1) * perPage;
  const blocked = status === 'unavailable' ? `완료 기록 저장소에 연결하지 못했습니다 — ${error}` : status === 'loading' ? '완료 기록을 불러오는 중입니다' : undefined;

  const handleComplete = async (t: RenewalTodo) => {
    show({ message: '완료로 옮겼어요', undoKey: t.key });
    const ok = await complete(t);
    if (!ok) clear();
  };
  const handleUndo = (key: string) => {
    clear();
    void undo(key);
  };
  const go = (p: number) => {
    setPage(Math.min(Math.max(1, p), pages));
    document.getElementById('todo-page-top')?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="min-h-full bg-white">
      <div id="todo-page-top" className="mx-auto max-w-[1488px] px-4 pb-[120px] pt-6 md:px-6">
        <h1 className="text-[32px] font-bold tracking-[-0.02em] text-[#1A1C20]">오늘의 할 일</h1>
        <div className="mt-[22px] flex border-b border-[#E5E6E9]" role="tablist">
          {(['progress', 'done'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setPage(1);
              }}
              className={`-mb-px h-[52px] border-b-[3px] px-[18px] text-[19px] transition-colors ${
                tab === t ? 'border-[#1A1C20] font-bold text-[#1A1C20]' : 'border-transparent font-medium text-[#8B9099] hover:text-[#3A3D44]'
              }`}
            >
              {t === 'progress' ? '진행중' : '완료'}
            </button>
          ))}
        </div>

        {status === 'unavailable' && (
          <p className="mt-5 rounded-[12px] bg-[#FFF7ED] px-4 py-3 text-[16px] text-[#9A4A0B]">
            완료 기록 저장소에 연결하지 못해 지금은 완료하기를 쓸 수 없습니다. ({error})
          </p>
        )}

        <div className="mt-[32px] flex flex-col gap-[14px]">
          {loading ? (
            <p className="rounded-[20px] border border-dashed border-[#E2E3E6] py-[72px] text-center text-[18px] text-[#8B9099]">불러오는 중…</p>
          ) : tab === 'progress' ? (
            progress.length === 0 ? (
              <p className="rounded-[20px] border border-dashed border-[#E2E3E6] py-[72px] text-center text-[18px] text-[#8B9099]">지금 연락할 고객이 없어요.</p>
            ) : (
              progress.slice(start, start + perPage).map((t) => (
                <TodoCard
                  key={t.key}
                  todo={t}
                  onOpenCustomer={() => onOpenCustomer(t.customerId)}
                  onComplete={() => void handleComplete(t)}
                  completeBlockedReason={blocked}
                />
              ))
            )
          ) : done.length === 0 ? (
            <p className="rounded-[20px] border border-dashed border-[#E2E3E6] py-[72px] text-center text-[18px] text-[#8B9099]">완료한 할 일이 없어요.</p>
          ) : (
            done.slice(start, start + perPage).map((r) => (
              <TodoCard
                key={r.key}
                todo={todoByKey.get(r.key)}
                done={r}
                onOpenCustomer={r.customerId ? () => onOpenCustomer(r.customerId!) : undefined}
              />
            ))
          )}
        </div>

        <Pager page={Math.min(page, pages)} pages={pages} onPage={go} perPage={perPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} />
      </div>
      <UndoToast toast={toast} onUndo={handleUndo} />
    </div>
  );
}

function Pager({ page, pages, onPage, perPage, onPerPage }: { page: number; pages: number; onPage: (p: number) => void; perPage: number; onPerPage: (n: number) => void }) {
  const icon = 'inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[#8B9099] hover:text-[#1A1C20] disabled:cursor-default disabled:text-[#D0D3D8]';
  // 페이지가 많으면 현재 페이지 앞뒤 2개씩
  const from = Math.max(1, Math.min(page - 2, pages - 4));
  const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => from + i);
  return (
    <div className="mt-[48px] flex flex-wrap items-center gap-[14px] md:pl-[32px]">
      <button type="button" className={icon} onClick={() => onPage(1)} disabled={page === 1} aria-label="첫 페이지">
        <ChevronFirst className="h-[18px] w-[18px]" />
      </button>
      <button type="button" className={icon} onClick={() => onPage(page - 1)} disabled={page === 1} aria-label="이전 페이지">
        <ChevronLeft className="h-[18px] w-[18px]" />
      </button>
      {nums.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPage(n)}
          aria-current={n === page ? 'page' : undefined}
          className={`h-8 w-8 rounded-[6px] text-[16px] font-semibold tabular-nums ${n === page ? 'bg-[#2B2E35] text-white' : 'text-[#5B616B] hover:bg-[#F2F3F5]'}`}
        >
          {n}
        </button>
      ))}
      <button type="button" className={icon} onClick={() => onPage(page + 1)} disabled={page === pages} aria-label="다음 페이지">
        <ChevronRight className="h-[18px] w-[18px]" />
      </button>
      <button type="button" className={icon} onClick={() => onPage(pages)} disabled={page === pages} aria-label="마지막 페이지">
        <ChevronLast className="h-[18px] w-[18px]" />
      </button>
      <label className="relative ml-[36px]">
        <span className="sr-only">한 페이지에 보일 개수</span>
        <select
          value={perPage}
          onChange={(e) => onPerPage(Number(e.target.value))}
          className="h-[52px] w-[185px] cursor-pointer appearance-none rounded-[10px] border border-[#DCDDE0] bg-white pl-[18px] pr-11 text-[18px] text-[#1A1C20] focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}개씩 보기
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#3A3D44]" />
      </label>
    </div>
  );
}
