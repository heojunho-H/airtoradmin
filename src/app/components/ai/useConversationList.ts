// 팀 공유 대화 목록 — 최근 대화순 30개씩, 페르소나·내 대화·제목 검색 필터.

import { useCallback, useEffect, useRef, useState } from 'react';
import { listConversations, toAiRequestError } from '../../../lib/ai/api';
import type { ConversationSummary, PersonaId } from '../../../lib/ai/types';

export interface ListFilter {
  persona: PersonaId | 'all';
  mine: boolean;
  q: string;
}

export function useConversationList({ userName, isActive }: { userName: string; isActive: boolean }) {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListFilter>({ persona: 'all', mine: false, q: '' });
  const [debouncedQ, setDebouncedQ] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filter.q.trim()), 300);
    return () => clearTimeout(t);
  }, [filter.q]);

  const load = useCallback(
    async (cursor: string | null) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const res = await listConversations({
          limit: 30,
          cursor,
          persona: filter.persona === 'all' ? null : filter.persona,
          author: filter.mine ? userName : null,
          q: debouncedQ || null,
        });
        if (id !== requestId.current) return;
        setItems((prev) => (cursor ? [...prev, ...res.items.filter((it) => !prev.some((p) => p.id === it.id))] : res.items));
        setNextCursor(res.nextCursor);
      } catch (err) {
        if (id === requestId.current) setError(toAiRequestError(err).message);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [filter.persona, filter.mine, debouncedQ, userName],
  );

  const reload = useCallback(() => load(null), [load]);

  // 페이지가 보일 때와 필터가 바뀔 때만 새로 불러온다 (숨김 상태에서는 폴링하지 않음)
  useEffect(() => {
    if (isActive) reload();
  }, [isActive, reload]);

  useEffect(() => {
    if (!isActive) return;
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isActive, reload]);

  const loadMore = useCallback(() => {
    if (nextCursor && !loading) load(nextCursor);
  }, [nextCursor, loading, load]);

  /** 새 대화/새 턴이 저장되면 맨 위로 올린다 */
  const upsert = useCallback((item: ConversationSummary) => {
    setItems((prev) => [item, ...prev.filter((p) => p.id !== item.id)]);
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const patch = useCallback((id: string, changes: Partial<ConversationSummary>) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  }, []);

  return { items, loading, error, filter, setFilter, hasMore: !!nextCursor, loadMore, reload, upsert, remove, patch };
}
