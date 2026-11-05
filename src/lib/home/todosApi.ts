// 홈 '오늘의 할 일' 완료 기록 — /api/todos 클라이언트 (서버: functions/api/todos.ts, D1 home_todos)
// getJson/postJson 이 302→HTML·WAF 차단·서버 오류를 한국어 메시지(AiRequestError)로 바꿔 준다.

import { getJson, postJson } from '../ai/api';
import type { HomeTodo } from './metrics';

export const TODOS_ENDPOINT = '/api/todos';

export interface TodoRecord {
  key: string;
  /** 'renewal' 재계약 연락 · 'winback' 재문의 연락 */
  kind: string;
  customerId: number | null;
  company: string;
  dueDate: string | null;
  doneBy: string;
  /** ISO 시각 */
  doneAt: string;
}

export async function fetchTodoRecords(): Promise<TodoRecord[]> {
  const res = await getJson<{ ok: true; items: TodoRecord[] }>({}, TODOS_ENDPOINT);
  return Array.isArray(res.items) ? res.items : [];
}

export async function completeTodo(todo: HomeTodo, userName: string): Promise<TodoRecord> {
  const res = await postJson<{ ok: true; item: TodoRecord }>(
    { action: 'done', key: todo.key, customerId: todo.customerId, company: todo.company, dueDate: todo.dueDate, userName },
    { endpoint: TODOS_ENDPOINT },
  );
  return res.item;
}

export async function undoTodo(key: string, userName: string): Promise<void> {
  await postJson<{ ok: true }>({ action: 'undo', key, userName }, { endpoint: TODOS_ENDPOINT });
}
