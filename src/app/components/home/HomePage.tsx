// 홈 — 앱 첫 화면. 인사말 · 지표 3장(이번 달 매출·영업 현황·재계약 현황) · 오늘의 할 일(급한 순 3개) · 일정표.
// 레이아웃·타이포는 레퍼런스(Alfred 홈)를 따른다. 팀은 Chrome 75% 줌을 쓰므로 레퍼런스 스크린샷(2000px 폭) 좌표를 그대로 CSS px 로 쓴다.
import { manwon } from '../../../lib/ai/snapshot/common';
import type { HomeData, RenewalTodo } from '../../../lib/home/metrics';
import type { TodoRecordsState } from '../../../lib/home/useTodoRecords';
import { WEEKDAYS, weekdayOf, won } from './format';
import { KpiCard, KpiCardSkeleton } from './KpiCard';
import { ScheduleCalendar } from './ScheduleCalendar';
import { TodoCard } from './TodoCard';
import { UndoToast, useUndoToast } from './UndoToast';

interface HomePageProps {
  userName: string;
  today: string;
  /** null = 데이터를 아직 못 불러옴 */
  data: HomeData | null;
  /** 진행중 할 일 (완료 기록 제외, 급한 순) */
  openTodos: RenewalTodo[];
  todoState: TodoRecordsState;
  onOpenTodos: () => void;
  onOpenCustomer: (customerId: number) => void;
  onOpenProject: (projectId: number) => void;
}

function pctText(change: number): string {
  return `${change >= 0 ? '▲' : '▼'}${Math.abs(change * 100).toFixed(1)}%`;
}

export function HomePage({ userName, today, data, openTodos, todoState, onOpenTodos, onOpenCustomer, onOpenProject }: HomePageProps) {
  const { toast, show, clear } = useUndoToast();
  const month = Number(today.slice(5, 7));
  const blocked =
    todoState.status === 'unavailable' ? `완료 기록 저장소에 연결하지 못했습니다 — ${todoState.error}` : todoState.status === 'loading' ? '완료 기록을 불러오는 중입니다' : undefined;

  const handleComplete = async (t: RenewalTodo) => {
    show({ message: '완료로 옮겼어요', undoKey: t.key });
    const ok = await todoState.complete(t);
    if (!ok) clear();
  };

  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto max-w-[1488px] px-4 pb-[120px] pt-10 md:px-6 md:pt-[56px]">
        <header>
          <h1 className="text-[28px] font-bold leading-[1.3] tracking-[-0.02em] text-[#1A1C20] md:text-[38px]">{userName ? `${userName}님, 안녕하세요.` : '안녕하세요.'}</h1>
          <p className="mt-3 text-[17px] text-[#5B616B] md:text-[21px]">
            오늘은{' '}
            <b className="font-bold text-[#1A1C20]">
              {month}월 {Number(today.slice(8))}일 {WEEKDAYS[weekdayOf(today)]}요일
            </b>
            입니다. 해야 할 일들을 확인해 보세요.
          </p>
        </header>

        <div className="mt-12 grid grid-cols-1 gap-[18px] md:mt-[80px] lg:grid-cols-3">
          {data ? <Kpis data={data} month={month} /> : [0, 1, 2].map((i) => <KpiCardSkeleton key={i} />)}
        </div>

        <section className="mt-[72px]" aria-label="오늘의 할 일">
          <div className="flex items-center justify-between">
            <h2 className="text-[24px] font-bold leading-[32px] tracking-[-0.01em] text-[#1A1C20]">
              오늘의 할 일<span className="ml-1.5 text-[#2563EB]">{data ? openTodos.length : ''}</span>
            </h2>
            <button type="button" onClick={onOpenTodos} className="py-1 text-[17px] text-[#8B9099] hover:text-[#1A1C20]">
              전체보기
            </button>
          </div>
          <div className="mt-[18px] flex flex-col gap-[14px]">
            {!data ? (
              <p className="rounded-[20px] border border-dashed border-[#E2E3E6] py-12 text-center text-[18px] text-[#8B9099]">불러오는 중…</p>
            ) : openTodos.length === 0 ? (
              <p className="rounded-[20px] border border-dashed border-[#E2E3E6] py-12 text-center text-[18px] text-[#8B9099]">오늘 연락할 고객이 없어요.</p>
            ) : (
              openTodos.slice(0, 3).map((t) => (
                <TodoCard
                  key={t.key}
                  todo={t}
                  onOpenCustomer={() => onOpenCustomer(t.customerId)}
                  onComplete={() => void handleComplete(t)}
                  completeBlockedReason={blocked}
                />
              ))
            )}
          </div>
        </section>

        {data && <ScheduleCalendar events={data.events} today={today} onOpenCustomer={onOpenCustomer} onOpenProject={onOpenProject} />}
      </div>
      <UndoToast
        toast={toast}
        onUndo={(key) => {
          clear();
          void todoState.undo(key);
        }}
      />
    </div>
  );
}

function Kpis({ data, month }: { data: HomeData; month: number }) {
  const { revenue: r, sales: s, renewal: n } = data;
  const lastYearLabel = `작년 ${month}월`;
  const yoyTitle = `${lastYearLabel} 전체 ${won(r.lastYearTotal)}(${r.lastYearJobs}건) · 작년 같은 기간(${month}/1~${month}/${Number(data.today.slice(8))}) ${won(r.lastYearSamePeriod)}`;
  return (
    <>
      <KpiCard
        title="이번 달 매출"
        badge={{ text: `${month}월`, tone: 'blue' }}
        aside={<span className="text-[#8B9099]">{r.lastYearJobs ? `${lastYearLabel} ${manwon(r.lastYearTotal)}` : `${lastYearLabel} 기록 없음`}</span>}
        rows={[
          { label: '작업 완료', value: won(r.done) },
          { label: '작업 예정', value: won(r.planned) },
        ]}
        totalLabel="합계"
        total={won(r.total)}
        totalExtra={
          r.change != null ? (
            <span
              title={yoyTitle}
              className={`cursor-help whitespace-nowrap rounded-[7px] px-2 py-1 text-[13px] font-semibold tabular-nums md:px-[9px] md:text-[15px] ${r.change >= 0 ? 'bg-[#E8F6EC] text-[#1E9E4A]' : 'bg-[#FDECEC] text-[#D93636]'}`}
            >
              작년 대비 {pctText(r.change)}
            </span>
          ) : undefined
        }
      />
      <KpiCard
        title="영업 현황"
        badge={{ text: '진행중', tone: 'green' }}
        aside={
          s.expiring > 0 ? (
            <span className="font-semibold text-[#E8590C]" title="문의 후 15일이 지나면 영업 관리에서 자동 실패 처리됩니다">
              자동 실패 임박 {s.expiring}건
            </span>
          ) : (
            <span className="text-[#8B9099]">자동 실패 임박 없음</span>
          )
        }
        rows={[
          { label: '이번 달 문의', value: `${s.inquiries}건` },
          { label: '진행 중 딜', value: `${s.open}건` },
        ]}
        totalLabel="진행 중 견적"
        total={won(s.openAmount)}
      />
      <KpiCard
        title="재계약 현황"
        badge={{ text: 'S·A·B', tone: 'indigo' }}
        aside={<span className="text-[#8B9099]">관리 고객 {n.managed}곳</span>}
        rows={[
          { label: '연락 시기 (30일 이내)', value: `${n.dueSoon}곳` },
          { label: '관리일 지남', value: `${n.overdue}곳` },
        ]}
        totalLabel="재계약률"
        total={n.rate != null ? `${Math.round(n.rate * 100)}%` : '-'}
        totalExtra={
          n.eligible > 0 ? (
            <span className="text-[16px] tabular-nums text-[#8B9099]" title="첫 작업 후 관리 주기가 한 번 이상 지난 S·A·B 고객 중 다시 작업한 곳">
              {n.renewed}/{n.eligible}곳
            </span>
          ) : undefined
        }
      />
    </>
  );
}
