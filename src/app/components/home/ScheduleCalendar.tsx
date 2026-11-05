// 일정표 — 월 달력(왼쪽 2/3) + 고른 날의 작업·상세(오른쪽 1/3). 레퍼런스의 '찾은 혜택'·'AI 비서' 자리.
// 확정 작업 = 고객 작업이력의 작업일, 가예정 = 수주 전 딜의 확정작업일(점선). 계산: src/lib/home/metrics.ts
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { daysBetween } from '../../../lib/ai/format';
import { eventStatus, occurrencesByDate, type EventStatus, type ScheduleEvent } from '../../../lib/home/metrics';
import { addYmd, mdDow, WEEKDAYS, weekdayOf, won } from './format';
import { HOLIDAYS } from './holidays';

const CHIP: Record<EventStatus, string> = {
  done: 'border-transparent bg-[#F1F2F4] text-[#6B7079]',
  today: 'border-transparent bg-[#2563EB] text-white',
  plan: 'border-transparent bg-[#EAF1FF] text-[#1D4ED8]',
  tent: 'border-[1.5px] border-dashed border-[#8DB0F5] bg-white text-[#2F6BEB]',
};

// 모바일(칸 폭 약 50px)에서는 칩 대신 작업마다 점 하나 — 날짜를 누르면 아래 목록에 그날 작업이 나온다
const DOT: Record<EventStatus, string> = {
  done: 'bg-[#C4C7CC]',
  today: 'bg-[#2563EB]',
  plan: 'bg-[#93B4F5]',
  tent: 'border border-dashed border-[#6E9BF2] bg-white',
};

const BTN = 'h-[42px] flex-1 whitespace-nowrap rounded-[10px] border px-4 text-[17px] font-semibold transition-colors disabled:cursor-default disabled:border-[#E2E3E6] disabled:bg-[#EEEFF1] disabled:text-[#B4B7BD]';

interface ScheduleCalendarProps {
  events: ScheduleEvent[];
  today: string;
  onOpenCustomer: (customerId: number) => void;
  onOpenProject: (projectId: number) => void;
}

function shiftMonth(ym: string, n: number): string {
  const d = new Date(`${ym}-15T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

/** 칸이 좁아 칩에는 회사·수량만 — 서비스까지 넣은 전체 문구는 툴팁(chipTitle)으로 */
function chipLabel(ev: ScheduleEvent, k: number): string {
  return `${ev.company}${ev.quantity > 0 ? ` ${ev.quantity}대` : ''}${ev.days > 1 ? ` (${k + 1}/${ev.days}일)` : ''}`;
}

function chipTitle(ev: ScheduleEvent, k: number): string {
  const what = [ev.service, ev.quantity > 0 ? `${ev.quantity}대` : ''].filter(Boolean).join(' ');
  return `${ev.tentative ? '[가예정] ' : ''}${ev.company}${what ? ` · ${what}` : ''}${ev.days > 1 ? ` (${k + 1}/${ev.days}일)` : ''}`;
}

export function ScheduleCalendar({ events, today, onOpenCustomer, onOpenProject }: ScheduleCalendarProps) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [eventId, setEventId] = useState<string | null>(null);
  const occ = useMemo(() => occurrencesByDate(events), [events]);
  const event = eventId ? events.find((e) => e.id === eventId) ?? null : null;

  const first = `${month}-01`;
  const lead = weekdayOf(first);
  const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((lead + daysInMonth) / 7) * 7 }, (_, i) => addYmd(first, i - lead));

  const pickDay = (ds: string) => {
    setSelected(ds);
    setEventId(null);
  };

  return (
    <section className="mt-[72px]" aria-label="일정표">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <h2 className="text-[24px] font-bold tracking-[-0.01em] text-[#1A1C20]">일정표</h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="이전 달" className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#DCDDE0] bg-white text-[#3A3D44] hover:bg-[#F7F8F9]">
            <ChevronLeft className="h-[18px] w-[18px]" />
          </button>
          <span className="min-w-[136px] text-center text-[20px] font-semibold tabular-nums text-[#1A1C20]">
            {month.slice(0, 4)}년 {Number(month.slice(5, 7))}월
          </span>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음 달" className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#DCDDE0] bg-white text-[#3A3D44] hover:bg-[#F7F8F9]">
            <ChevronRight className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => {
              setMonth(today.slice(0, 7));
              pickDay(today);
            }}
            className="h-9 rounded-[10px] border border-[#DCDDE0] bg-white px-[14px] text-[15px] font-semibold text-[#3A3D44] hover:bg-[#F7F8F9]"
          >
            오늘
          </button>
        </div>
        <div className="ml-auto flex flex-wrap gap-4 text-[15px] text-[#8B9099]">
          <Legend className="bg-[#E4E6EA]" label="완료" />
          <Legend className="bg-[#2563EB]" label="오늘" />
          <Legend className="bg-[#CFE0FF]" label="예정" />
          <Legend className="border-[1.5px] border-dashed border-[#6E9BF2] bg-white" label="가예정" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_373px] xl:gap-[54px]">
        <div className="overflow-hidden rounded-[20px] border border-[#E7E8EB] bg-white shadow-[0_2px_10px_rgba(17,24,39,0.04)]">
          <div className="grid h-12 grid-cols-7 items-center border-b border-[#EDEEF0] text-center text-[15px] text-[#8B9099]">
            {WEEKDAYS.map((w, i) => (
              <span key={w} className={i === 0 ? 'text-[#E5484D]' : i === 6 ? 'text-[#2F6BEB]' : undefined}>
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((ds, i) => {
              const inMonth = ds.slice(0, 7) === month;
              const dow = i % 7;
              const holiday = HOLIDAYS[ds];
              const list = occ.get(ds) ?? [];
              const isToday = ds === today;
              const numColor = !inMonth ? 'text-[#C9CDD3]' : isToday ? 'bg-[#2563EB] text-white' : holiday || dow === 0 ? 'text-[#E5484D]' : dow === 6 ? 'text-[#2F6BEB]' : 'text-[#3A3D44]';
              return (
                <div
                  key={ds}
                  role="button"
                  tabIndex={0}
                  aria-label={`${mdDow(ds)}${holiday ? ` ${holiday}` : ''} 작업 ${list.length}건`}
                  onClick={() => pickDay(ds)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      pickDay(ds);
                    }
                  }}
                  className={`flex h-[96px] min-w-0 cursor-pointer flex-col gap-1.5 border-b border-[#F0F1F3] px-1 pb-2 pt-2.5 outline-none md:h-[128px] md:px-2 ${dow < 6 ? 'border-r' : ''} ${
                    ds === selected ? 'bg-[#F3F7FF] shadow-[inset_0_0_0_2px_#2563EB]' : 'hover:bg-[#FAFBFC] focus-visible:shadow-[inset_0_0_0_2px_#93B4F5]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={`inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[16px] font-semibold tabular-nums ${numColor}`}>
                      {Number(ds.slice(8))}
                    </span>
                    {holiday && inMonth && <span className="truncate text-[13px] text-[#E5484D]">{holiday}</span>}
                  </div>
                  {list.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 px-1 md:hidden" aria-hidden>
                      {list.slice(0, 3).map(({ ev, k }) => (
                        <i key={`${ev.id}:${k}`} className={`inline-block h-2 w-2 rounded-full ${DOT[eventStatus(ev, ds, today)]}`} />
                      ))}
                      {list.length > 3 && <span className="text-[11px] leading-none text-[#8B9099]">+{list.length - 3}</span>}
                    </div>
                  )}
                  <div className="hidden min-w-0 flex-col gap-1 md:flex">
                    {list.slice(0, 2).map(({ ev, k }) => (
                      <button
                        key={`${ev.id}:${k}`}
                        type="button"
                        title={chipTitle(ev, k)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(ds);
                          setEventId(ev.id);
                        }}
                        className={`block h-[26px] w-full truncate rounded-[6px] border px-2 text-left text-[14px] font-medium leading-[24px] ${CHIP[eventStatus(ev, ds, today)]} ${
                          eventId === ev.id ? 'ring-2 ring-[#1A1C20]' : ''
                        }`}
                      >
                        {chipLabel(ev, k)}
                      </button>
                    ))}
                    {list.length > 2 && <span className="pl-1 text-[13px] text-[#8B9099]">+{list.length - 2}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-[14px]">
          {event ? (
            <EventDetail event={event} today={today} onBack={() => setEventId(null)} onOpenCustomer={onOpenCustomer} onOpenProject={onOpenProject} />
          ) : (
            <DayAgenda date={selected} today={today} occ={occ} events={events} onPick={(ev) => setEventId(ev.id)} />
          )}
        </aside>
      </div>
    </section>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={`inline-block h-3.5 w-3.5 rounded ${className}`} />
      {label}
    </span>
  );
}

function dLabel(date: string, today: string): string {
  const n = daysBetween(today, date);
  return n === 0 ? '오늘' : n > 0 ? `D-${n}` : '완료';
}

function DayAgenda({ date, today, occ, events, onPick }: { date: string; today: string; occ: Map<string, Array<{ ev: ScheduleEvent; k: number }>>; events: ScheduleEvent[]; onPick: (ev: ScheduleEvent) => void }) {
  const list = occ.get(date) ?? [];
  const upcoming = list.length ? [] : events.filter((e) => e.date > today).slice(0, 5);
  return (
    <>
      <div className="flex items-baseline gap-2.5">
        <h3 className="text-[22px] font-bold tracking-[-0.01em] text-[#1A1C20]">
          {Number(date.slice(5, 7))}월 {Number(date.slice(8))}일 ({WEEKDAYS[weekdayOf(date)]})
        </h3>
        {date === today && <span className="rounded-[6px] bg-[#EAF1FF] px-2 py-0.5 text-[14px] font-semibold text-[#2563EB]">오늘</span>}
        {HOLIDAYS[date] && <span className="text-[15px] text-[#E5484D]">{HOLIDAYS[date]}</span>}
      </div>
      {list.length ? (
        list.map(({ ev }) => <AgendaCard key={ev.id} ev={ev} today={today} onPick={onPick} />)
      ) : (
        <>
          <p className="text-[17px] text-[#8B9099]">이날은 작업이 없어요.</p>
          {upcoming.length > 0 && <p className="mt-1.5 text-[17px] font-semibold text-[#3A3D44]">다가오는 작업</p>}
          {upcoming.map((ev) => (
            <AgendaCard key={ev.id} ev={ev} today={today} onPick={onPick} />
          ))}
        </>
      )}
    </>
  );
}

function AgendaCard({ ev, today, onPick }: { ev: ScheduleEvent; today: string; onPick: (ev: ScheduleEvent) => void }) {
  const st = eventStatus(ev, ev.date, today);
  const right = ev.tentative ? '가예정' : st === 'done' ? '완료' : dLabel(ev.date, today);
  const meta = [ev.manager ? `담당 ${ev.manager}` : '', ev.crew, ev.days > 1 ? `${ev.days}일` : ''].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      onClick={() => onPick(ev)}
      className="flex w-full flex-col gap-1.5 rounded-[20px] border border-[#E7E8EB] bg-white px-6 py-[22px] text-left shadow-[0_2px_10px_rgba(17,24,39,0.04)] hover:border-[#C9D8F7]"
    >
      <span className="flex justify-between text-[15px] font-semibold tabular-nums">
        <span className="text-[#2563EB]">
          {mdDow(ev.date)}
          {ev.days > 1 ? ` ~ ${mdDow(addYmd(ev.date, ev.days - 1))}` : ''}
        </span>
        <span className={st === 'done' ? 'text-[#8B9099]' : 'text-[#2563EB]'}>{right}</span>
      </span>
      <span className="text-[20px] font-bold tracking-[-0.01em] text-[#1A1C20]">{ev.company}</span>
      {(ev.service || ev.quantity > 0) && (
        <span className="text-[16px] text-[#5B616B]">{[ev.service, ev.quantity > 0 ? `${ev.quantity}대` : ''].filter(Boolean).join(' · ')}</span>
      )}
      {meta && <span className="text-[15px] text-[#8B9099]">{meta}</span>}
    </button>
  );
}

function EventDetail({ event: ev, today, onBack, onOpenCustomer, onOpenProject }: { event: ScheduleEvent; today: string; onBack: () => void; onOpenCustomer: (id: number) => void; onOpenProject: (id: number) => void }) {
  const st = eventStatus(ev, ev.date, today);
  const status = ev.tentative ? '가예정 · 수주 전 딜' : st === 'done' ? '작업 완료' : st === 'today' ? '오늘 작업' : `예정 · ${dLabel(ev.date, today)}`;
  const rows: Array<[string, string, string]> = [
    ['작업일', `${mdDow(ev.date)}${ev.days > 1 ? ` ~ ${mdDow(addYmd(ev.date, ev.days - 1))} · ${ev.days}일` : ''}`, ''],
    ['서비스', ev.service, '미입력'],
    ['수량', ev.quantity > 0 ? `${ev.quantity}대` : '', '미입력'],
    ['상세 수량', ev.detail, '미입력'],
    ['주소', ev.address, '미입력'],
    ['고객책임자', ev.manager, '미지정'],
    ['작업팀장', ev.subcontractors, '미입력'],
    ['투입 인원', ev.crew, ev.tentative || !ev.projectId ? '프로젝트 생성 전' : '배치 미입력'],
    ['견적 금액', ev.amount > 0 ? `${won(ev.amount)} (VAT 포함)` : '', '견적 미입력'],
  ];
  return (
    <div className="rounded-[20px] border border-[#E7E8EB] bg-white p-6 shadow-[0_2px_10px_rgba(17,24,39,0.04)]">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-0.5 text-[15px] text-[#8B9099] hover:text-[#1A1C20]">
        <ChevronLeft className="h-4 w-4" />
        목록
      </button>
      <p className={`mt-3.5 text-[15px] font-semibold ${st === 'done' ? 'text-[#8B9099]' : 'text-[#2563EB]'}`}>{status}</p>
      <h3 className="mt-1.5 text-[24px] font-bold tracking-[-0.01em] text-[#1A1C20]">{ev.company}</h3>
      <dl className="mt-[18px] grid grid-cols-[92px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[16px]">
        {rows.map(([label, value, empty]) => (
          <div key={label} className="contents">
            <dt className="text-[#8B9099]">{label}</dt>
            <dd className={`break-words tabular-nums ${value ? 'text-[#1A1C20]' : 'text-[#B4B7BD]'}`}>{value || empty}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-[22px] flex gap-2.5">
        <button
          type="button"
          className={`${BTN} border-[#DCDDE0] bg-[#F2F3F5] text-[#1A1C20] hover:bg-[#E9EAED]`}
          disabled={!ev.projectId}
          onClick={() => ev.projectId && onOpenProject(ev.projectId)}
        >
          프로젝트 보기
        </button>
        <button
          type="button"
          className={`${BTN} border-[#2B2E35] bg-[#2B2E35] text-white hover:bg-[#1C1E23]`}
          disabled={!ev.customerId}
          onClick={() => ev.customerId && onOpenCustomer(ev.customerId)}
        >
          고객 보기
        </button>
      </div>
    </div>
  );
}
