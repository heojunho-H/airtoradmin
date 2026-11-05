// 할 일 카드의 왼쪽 버튼이 여는 화면 — 재계약 연락은 고객 상세, 작년실패 연락은 작년 딜 상세
import type { HomeTodo, TodoKind } from '../../../lib/home/metrics';
import type { TodoRecord } from '../../../lib/home/todosApi';

/** 계산된 할 일·완료 기록에서 종류를 읽는다 (예전 기록은 kind 없이 키만 있을 수 있다) */
export function kindOf(todo?: HomeTodo, done?: TodoRecord): TodoKind {
  if (todo) return todo.kind;
  return done?.kind === 'winback' || done?.key.startsWith('winback:') ? 'winback' : 'renewal';
}

/** 작년실패 키 `winback:{dealId}:{1년 되는 날}` 에서 딜 번호 */
function dealIdFromKey(key: string): number | null {
  const m = /^winback:(\d+):/.exec(key);
  return m ? Number(m[1]) : null;
}

type Open = (id: number) => void;

export function openTodoTarget(todo: HomeTodo, onOpenCustomer: Open, onOpenDeal: Open): (() => void) | undefined {
  if (todo.kind === 'winback') return todo.dealId != null ? () => onOpenDeal(todo.dealId!) : undefined;
  return todo.customerId != null ? () => onOpenCustomer(todo.customerId!) : undefined;
}

/** 완료 카드 — 계산된 할 일이 이미 사라졌으면(재작업·기간 지남) 기록의 고객 번호·키의 딜 번호로 연다 */
export function openDoneTarget(todo: HomeTodo | undefined, done: TodoRecord, onOpenCustomer: Open, onOpenDeal: Open): (() => void) | undefined {
  if (todo) return openTodoTarget(todo, onOpenCustomer, onOpenDeal);
  if (kindOf(undefined, done) === 'winback') {
    const dealId = dealIdFromKey(done.key);
    return dealId != null ? () => onOpenDeal(dealId) : undefined;
  }
  return done.customerId ? () => onOpenCustomer(done.customerId!) : undefined;
}
