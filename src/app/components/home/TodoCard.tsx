// 오늘의 할 일 카드 (진행중·완료 공용) — 윗줄(종류 · 남은 날/완료일) · 굵은 제목 · 회색 연락처 줄 · 오른쪽 버튼 둘.
// 종류: 재계약 연락(고객 관리일) · 작년실패 연락(작년 계약 실패 딜의 문의일 1년)
import type { ReactNode } from 'react';
import type { HomeTodo, TodoKind } from '../../../lib/home/metrics';
import type { TodoRecord } from '../../../lib/home/todosApi';
import { formatPhone, shortKstDate, shortYmd } from './format';
import { kindOf } from './todoOpen';

// 고객 등급 — 앱 전체 등급 색과 같게(S 보라 · A 파랑 · B 초록, ui-kit). 연락 우선순위를 바로 알아보게 'S등급'처럼 글자로, 테두리를 진하게
const GRADE_CHIP: Record<string, string> = {
  S: 'border-purple-300 bg-purple-50 text-purple-700',
  A: 'border-blue-300 bg-blue-50 text-blue-700',
  B: 'border-emerald-300 bg-emerald-50 text-emerald-700',
};
const CHIP = 'inline-flex h-7 items-center whitespace-nowrap rounded-full border px-3 text-[15px] font-bold';

const KIND_LABEL: Record<TodoKind, string> = { renewal: '재계약 연락', winback: '작년실패 연락' };
const OPEN_LABEL: Record<TodoKind, string> = { renewal: '고객 정보 보기', winback: '딜 보기' };

const BTN = 'h-[42px] whitespace-nowrap rounded-[10px] border px-4 text-[17px] font-semibold transition-colors';
const BTN_SUB = `${BTN} border-[#DCDDE0] bg-[#F2F3F5] text-[#1A1C20] hover:bg-[#E9EAED] disabled:cursor-default disabled:border-[#E2E3E6] disabled:bg-[#EEEFF1] disabled:text-[#B4B7BD]`;
const BTN_MAIN = `${BTN} border-[#2B2E35] bg-[#2B2E35] text-white hover:bg-[#1C1E23] disabled:cursor-default disabled:border-[#E2E3E6] disabled:bg-[#EEEFF1] disabled:text-[#B4B7BD]`;

interface TodoCardProps {
  /** 지금 계산된 할 일 — 연락처·최근 작업 표시 (완료 후 고객이 재작업했거나 기간이 지났으면 없다) */
  todo?: HomeTodo;
  /** 완료 기록 — 있으면 완료 카드 */
  done?: TodoRecord;
  /** 재계약은 고객 상세, 작년실패는 딜 상세를 연다 */
  onOpen?: () => void;
  onComplete?: () => void;
  /** 완료 저장소를 못 쓸 때 이유 (버튼을 잠그고 툴팁으로 보여 준다) */
  completeBlockedReason?: string;
}

export function TodoCard({ todo, done, onOpen, onComplete, completeBlockedReason }: TodoCardProps) {
  const kind = kindOf(todo, done);
  const company = todo?.company ?? done?.company ?? '-';
  const d = todo?.daysToDue ?? 0;
  const winback = kind === 'winback';

  let when: ReactNode;
  let title: string;
  if (done) {
    when = <span className="font-normal text-[#8B9099]"> · {shortKstDate(done.doneAt)} 완료 · {done.doneBy}</span>;
    title = winback ? `${company} 작년실패 연락을 마쳤습니다.` : `${company} 재계약 안내 연락을 마쳤습니다.`;
  } else if (winback) {
    when =
      d >= 0 ? (
        <span className="font-normal text-[#8B9099]"> · 작년 문의일 {d === 0 ? 'D-day' : `D-${d}`}</span>
      ) : (
        <span className="font-medium text-[#D93636]"> · 작년 문의일 {-d}일 지남</span>
      );
    title = `${company} 작년 이맘때 문의했던 고객입니다. 다시 연락해 보세요.`;
  } else if (d >= 0) {
    when = <span className="font-normal text-[#8B9099]"> · {d === 0 ? 'D-day' : `D-${d}`}</span>;
    title = `${company} 관리 주기가 다가옵니다. 재계약 안내 전화를 드려 주세요.`;
  } else {
    when = <span className="font-medium text-[#D93636]"> · 관리일 {-d}일 지남</span>;
    title = `${company} 관리일이 지났습니다. 재계약 안내 전화를 드려 주세요.`;
  }

  return (
    <article className="relative flex flex-col gap-5 rounded-[20px] border border-[#E7E8EB] bg-white px-[28px] pb-[30px] pt-[28px] shadow-[0_2px_10px_rgba(17,24,39,0.04)] md:flex-row md:items-center md:gap-[28px]">
      {done && <span className="absolute right-[28px] top-[26px] text-[17px] font-semibold leading-[22px] text-[#22A447]">완료</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-medium leading-[20px] text-[#3A3D44]">
          {KIND_LABEL[kind]}
          {when}
        </p>
        <h3 className="mt-[18px] text-[24px] font-bold leading-[34px] tracking-[-0.01em] text-[#1A1C20] [text-wrap:pretty] break-keep">{title}</h3>
        <TodoMeta todo={todo} done={done} kind={kind} />
      </div>
      <div className={`flex shrink-0 gap-3 ${done ? 'md:self-end' : ''}`}>
        <button type="button" className={BTN_SUB} onClick={onOpen} disabled={!onOpen}>
          {OPEN_LABEL[kind]}
        </button>
        <button
          type="button"
          className={BTN_MAIN}
          onClick={onComplete}
          disabled={!!done || !onComplete || !!completeBlockedReason}
          title={!done && completeBlockedReason ? completeBlockedReason : undefined}
        >
          완료하기
        </button>
      </div>
    </article>
  );
}

function manwon(won: number): string {
  if (won >= 100_000_000) return `${(won / 100_000_000).toFixed(2).replace(/\.?0+$/, '')}억`;
  return `${Math.round(won / 10_000).toLocaleString('ko-KR')}만`;
}

function TodoMeta({ todo, done, kind }: { todo?: HomeTodo; done?: TodoRecord; kind: TodoKind }) {
  if (!todo) {
    if (!done?.dueDate) return null;
    return <p className="mt-[10px] text-[16px] text-[#8B9099]">{kind === 'winback' ? '작년 문의일 1년' : '관리일'} {shortYmd(done.dueDate)}</p>;
  }
  // 담당자명 칸에 회사명을 적어 둔 딜이 있다 — 회사명은 제목에 있으니 직책만
  const person = [todo.contactName !== todo.company ? todo.contactName : '', todo.contactPosition].filter(Boolean).join(' ');
  const what = [todo.lastService, todo.lastQuantity > 0 ? `${todo.lastQuantity}대` : ''].filter(Boolean).join(' ');
  const history =
    kind === 'winback'
      ? ['작년 문의', shortYmd(todo.lastWorkDate), what && `· ${what}`, todo.quotedAmount > 0 && `· 견적 ${manwon(todo.quotedAmount)}`].filter(Boolean).join(' ')
      : [shortYmd(todo.lastWorkDate), what].filter(Boolean).join(' ');
  const Sep = () => <span className="text-[#D0D3D8]">·</span>;
  return (
    <div className="mt-[10px] flex flex-wrap items-center gap-x-[10px] gap-y-1 text-[16px] leading-[24px] text-[#8B9099]">
      {kind === 'winback' ? (
        <span className={`${CHIP} border-slate-300 bg-slate-50 text-slate-700`}>계약 실패</span>
      ) : (
        <span className={`${CHIP} ${GRADE_CHIP[todo.grade] ?? GRADE_CHIP.B}`}>{todo.grade}등급</span>
      )}
      <span>
        {person && <>{person} </>}
        {todo.phone ? (
          <a href={`tel:${todo.phone.replace(/[^0-9+]/g, '')}`} className="font-semibold tabular-nums text-[#3A3D44] hover:underline">
            {formatPhone(todo.phone)}
          </a>
        ) : todo.email ? (
          <span className="text-[#5B616B]">{todo.email}</span>
        ) : (
          <span>연락처 없음</span>
        )}
      </span>
      {todo.manager && (
        <>
          <Sep />
          <span>담당 {todo.manager}</span>
        </>
      )}
      {history && (
        <>
          <Sep />
          <span>{kind === 'winback' ? history : `최근 작업 ${history}`}</span>
        </>
      )}
      {todo.openDeal && !done && <span className="rounded-[6px] bg-[#FFF3E6] px-2 py-0.5 text-[14px] font-semibold text-[#B4540A]">딜 진행중</span>}
    </div>
  );
}
