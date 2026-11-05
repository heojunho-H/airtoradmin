// 완료 기록 상태 — App 이 한 번 들고 홈·할 일 페이지·사이드바 배지가 함께 쓴다.
// 완료·되돌리기는 화면부터 바꾸고(낙관적) 저장이 실패하면 되돌린 뒤 알린다.
// 저장소를 못 쓰면(표 미생성·네트워크) status='unavailable' — 진행중 목록은 그대로 보이고 완료하기만 막는다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { toAiRequestError } from '../ai/api';
import type { HomeTodo } from './metrics';
import { completeTodo, fetchTodoRecords, undoTodo, type TodoRecord } from './todosApi';

export type TodoRecordsStatus = 'loading' | 'ok' | 'unavailable';

export interface TodoRecordsState {
  records: Map<string, TodoRecord>;
  status: TodoRecordsStatus;
  /** unavailable 일 때 이유 */
  error: string;
  complete: (todo: HomeTodo) => Promise<boolean>;
  undo: (key: string) => Promise<boolean>;
}

const STALE_MS = 60_000;

export function useTodoRecords(userName: string, onError: (message: string) => void): TodoRecordsState {
  const [records, setRecords] = useState<Map<string, TodoRecord>>(() => new Map());
  const [status, setStatus] = useState<TodoRecordsStatus>('loading');
  const [error, setError] = useState('');
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const loadedAtRef = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  // 저장 중인 키 — 그사이 다시 불러온 목록이 낙관적 변경을 덮지 않게
  const pendingRef = useRef(new Map<string, TodoRecord | null>());

  const load = useCallback(async () => {
    try {
      const items = await fetchTodoRecords();
      const next = new Map(items.map((r) => [r.key, r]));
      for (const [key, rec] of pendingRef.current) {
        if (rec) next.set(key, rec);
        else next.delete(key);
      }
      setRecords(next);
      setStatus('ok');
      setError('');
      loadedAtRef.current = Date.now();
    } catch (err) {
      setStatus((s) => (s === 'ok' ? s : 'unavailable'));
      setError(toAiRequestError(err).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAtRef.current > STALE_MS) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const complete = useCallback(
    async (todo: HomeTodo) => {
      const optimistic: TodoRecord = {
        key: todo.key,
        kind: todo.kind,
        customerId: todo.customerId,
        company: todo.company,
        dueDate: todo.dueDate,
        doneBy: userName || '익명',
        doneAt: new Date().toISOString(),
      };
      pendingRef.current.set(todo.key, optimistic);
      setRecords((prev) => new Map(prev).set(todo.key, optimistic));
      try {
        const saved = await completeTodo(todo, userName);
        setRecords((prev) => new Map(prev).set(todo.key, saved));
        return true;
      } catch (err) {
        setRecords((prev) => {
          const next = new Map(prev);
          next.delete(todo.key);
          return next;
        });
        onErrorRef.current(`완료로 저장하지 못했습니다 — ${toAiRequestError(err).message}`);
        return false;
      } finally {
        pendingRef.current.delete(todo.key);
      }
    },
    [userName],
  );

  const undo = useCallback(
    async (key: string) => {
      const removed = recordsRef.current.get(key);
      pendingRef.current.set(key, null);
      setRecords((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      try {
        await undoTodo(key, userName);
        return true;
      } catch (err) {
        if (removed) setRecords((prev) => new Map(prev).set(key, removed));
        onErrorRef.current(`되돌리지 못했습니다 — ${toAiRequestError(err).message}`);
        return false;
      } finally {
        pendingRef.current.delete(key);
      }
    },
    [userName],
  );

  return { records, status, error, complete, undo };
}
