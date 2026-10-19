// AI 어시스턴트 대화 상태 — 전송·스트리밍·중지·재시도·대화 열기·데이터 갱신.
//
// 히스토리는 서버(D1)가 원본을 갖고 있으므로 브라우저는 표시용 상태만 들고 있다.
// 실패·중지된 턴은 서버에 저장되지 않는다 → 오류 문구가 모델 히스토리에 섞이지 않는다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AiRequestError, getConversation, streamChat, toAiRequestError } from '../../../lib/ai/api';
import { buildSnapshot, snapshotSummary, type DataSnapshot } from '../../../lib/ai/snapshot';
import type { AiConfig, AiDatasets, AiUsage, ConversationDetail, ConversationSummary, PersonaId } from '../../../lib/ai/types';

export type Phase = 'preparing' | 'connecting' | 'thinking' | 'writing' | 'fallback';

export interface UiMessage {
  key: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  status: 'done' | 'streaming' | 'error' | 'stopped';
  phase?: Phase;
  phaseSince?: number;
  userName?: string | null;
  model?: string | null;
  usage?: AiUsage;
  costUsd?: number | null;
  stopReason?: string | null;
  error?: { code: string; message: string; retryable: boolean };
  hasSnapshot?: boolean;
}

export interface SnapshotMeta {
  builtAt: number;
  summary: string;
  truncated: string[];
}

const FRESH_MS = 30 * 60 * 1000;
const FLUSH_MS = 50;

function key() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

interface Options {
  userName: string;
  config: AiConfig | null;
  datasets: AiDatasets;
  loadFreshDatasets: () => Promise<AiDatasets>;
  isActive: boolean;
  onStreamingChange?: (streaming: boolean) => void;
  onBackgroundReply?: (title: string) => void;
  onTurnSaved?: (summary: ConversationSummary) => void;
}

export function useAiChat(opts: Options) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [persona, setPersonaState] = useState<PersonaId>('assistant');
  const [title, setTitle] = useState<string | null>(null);
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [modelChoice, setModelChoice] = useState<string | null>(null);
  const [serverOverride, setServerOverride] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [snapshotMeta, setSnapshotMeta] = useState<SnapshotMeta | null>(null);
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bufferRef = useRef('');
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const stateRef = useRef({ conversationId, messageCount, persona, modelChoice, serverOverride, pendingRefresh, title, createdBy });
  stateRef.current = { conversationId, messageCount, persona, modelChoice, serverOverride, pendingRefresh, title, createdBy };

  useEffect(() => {
    optsRef.current.onStreamingChange?.(streaming);
  }, [streaming]);

  // 로그아웃 등으로 언마운트되면 진행 중인 요청을 끊는다
  useEffect(() => () => abortRef.current?.abort(), []);

  const patchLastAssistant = useCallback((changes: Partial<UiMessage> | ((m: UiMessage) => Partial<UiMessage>)) => {
    setMessages((prev) => {
      const idx = prev.length - 1;
      if (idx < 0 || prev[idx].role !== 'assistant') return prev;
      const next = [...prev];
      next[idx] = { ...prev[idx], ...(typeof changes === 'function' ? changes(prev[idx]) : changes) };
      return next;
    });
  }, []);

  const flush = useCallback(() => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    const chunk = bufferRef.current;
    if (!chunk) return;
    bufferRef.current = '';
    patchLastAssistant((m) => ({ text: m.text + chunk }));
  }, [patchLastAssistant]);

  const reset = useCallback((nextPersona?: PersonaId) => {
    abortRef.current?.abort();
    setConversationId(null);
    setConversation(null);
    setTitle(null);
    setCreatedBy(null);
    setMessages([]);
    setMessageCount(0);
    setModelChoice(null);
    setServerOverride(null);
    setSnapshotMeta(null);
    setPendingRefresh(false);
    setLoadError(null);
    setNotice(null);
    if (nextPersona) setPersonaState(nextPersona);
  }, []);

  const newChat = useCallback((nextPersona?: PersonaId) => reset(nextPersona), [reset]);

  const setPersona = useCallback(
    (p: PersonaId) => {
      if (stateRef.current.conversationId || messages.length > 0) return;
      setPersonaState(p);
    },
    [messages.length],
  );

  /**
   * 대화를 서버에서 다시 읽는다.
   * quiet: 로딩 표시 없이(복구용). onlyIfAhead: 서버 메시지 수가 이 값보다 클 때만 화면을 바꾼다
   *   — 연결만 끊기고 서버에는 저장되지 않았다면 실패한 턴(질문·오류·재시도 버튼)을 그대로 둔다.
   * 반환: 화면을 바꿨으면 true.
   */
  const openConversation = useCallback(async (id: string, opts: { quiet?: boolean; onlyIfAhead?: number } = {}): Promise<boolean> => {
    const quiet = !!opts.quiet;
    if (!quiet) {
      abortRef.current?.abort();
      setLoading(true);
      setLoadError(null);
    }
    try {
      const res = await getConversation(id);
      const c = res.conversation;
      if (opts.onlyIfAhead !== undefined && c.messageCount <= opts.onlyIfAhead) return false;
      setConversationId(c.id);
      setConversation(c);
      setPersonaState(c.persona);
      setTitle(c.title);
      setCreatedBy(c.createdBy);
      setMessageCount(c.messageCount);
      setServerOverride(c.modelOverride);
      setModelChoice(c.modelOverride);
      setPendingRefresh(false);
      setNotice(null);
      setSnapshotMeta({ builtAt: new Date(c.snapshotAt).getTime(), summary: '', truncated: [] });
      setMessages(
        res.messages.map((m) => ({
          key: `${c.id}-${m.seq}`,
          role: m.role,
          text: m.text,
          createdAt: m.createdAt,
          status: 'done' as const,
          userName: m.userName,
          model: m.model,
          costUsd: m.costUsd,
          stopReason: m.stopReason,
          hasSnapshot: m.hasSnapshot,
        })),
      );
      return true;
    } catch (err) {
      if (!quiet) setLoadError(toAiRequestError(err).message);
      return false;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  /** 다른 사람이 먼저 질문을 추가했을 때 — 최신 대화를 불러오고, 실패한 질문은 끝에 남겨 다시 보낼 수 있게 한다 */
  const recoverFromConflict = useCallback(
    async (id: string) => {
      // finally 시점의 ref 는 아직 오류 표시 전 상태일 수 있어 오류 말풍선을 직접 만든다
      const list = messagesRef.current;
      const user = list[list.length - 2];
      const assistant = list[list.length - 1];
      const failedPair: UiMessage[] =
        user?.role === 'user' && assistant?.role === 'assistant'
          ? [
              user,
              {
                ...assistant,
                status: 'error',
                phase: undefined,
                error: { code: 'conflict', message: '다른 사용자가 먼저 질문을 추가했습니다. 최신 대화를 불러왔으니 다시 시도하세요.', retryable: true },
              },
            ]
          : [];
      const reloaded = await openConversation(id, { quiet: true });
      if (reloaded && failedPair.length) {
        setMessages((prev) => [...prev, ...failedPair]);
        setNotice('다른 사용자가 먼저 질문을 추가해 대화를 새로 불러왔습니다. "다시 시도"를 누르면 이어서 보냅니다.');
      }
    },
    [openConversation],
  );

  /** App 데이터가 30분 이내면 그대로, 아니면(또는 갱신 요청이면) 새로 불러온다. 실패한 소스는 App 데이터로 대체. */
  const snapshotDatasets = useCallback(async (force: boolean): Promise<AiDatasets> => {
    const { datasets, loadFreshDatasets } = optsRef.current;
    if (!force && datasets.loadedAt && Date.now() - datasets.loadedAt < FRESH_MS) return datasets;
    try {
      return await loadFreshDatasets();
    } catch {
      return datasets;
    }
  }, []);

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      const s = stateRef.current;
      const { config, userName } = optsRef.current;
      if (!text || abortRef.current) return;
      const limit = config?.limits.messageChars ?? 8000;
      if (text.length > limit) {
        setNotice(`질문은 ${limit.toLocaleString('ko-KR')}자 이하로 입력하세요.`);
        return;
      }
      setNotice(null);

      const ac = new AbortController();
      abortRef.current = ac;
      setStreaming(true);
      const now = new Date().toISOString();
      const isNew = !s.conversationId;
      setMessages((prev) => [
        ...prev,
        { key: key(), role: 'user', text, createdAt: now, status: 'done', userName, hasSnapshot: !isNew && s.pendingRefresh },
        { key: key(), role: 'assistant', text: '', createdAt: now, status: 'streaming', phase: 'preparing', phaseSince: Date.now() },
      ]);

      let snapshot: DataSnapshot | undefined;
      let finished = false;
      let succeeded = false;
      let conflictId: string | null = null;
      let resultTitle = s.title;
      let resultConversationId = s.conversationId;
      try {
        if (isNew || s.pendingRefresh) {
          snapshot = buildSnapshot(s.persona, await snapshotDatasets(s.pendingRefresh));
        }
        if (ac.signal.aborted) throw new DOMException('aborted', 'AbortError');
        patchLastAssistant({ phase: 'connecting', phaseSince: Date.now() });

        const modelParam = s.modelChoice !== s.serverOverride ? s.modelChoice : undefined;
        await streamChat(
          {
            conversationId: s.conversationId,
            expectedCount: isNew ? undefined : s.messageCount,
            persona: isNew ? s.persona : undefined,
            message: text,
            snapshot: snapshot?.text,
            model: modelParam,
            userName,
          },
          (event, data) => {
            if (event === 'meta') {
              // 새 대화의 ID는 done(저장 완료) 때 확정한다 — 실패하면 서버에 없는 ID라서
              resultConversationId = data.conversationId;
              resultTitle = data.title;
              if (data.overrideIgnored) setNotice('관리자 설정으로 이 대화의 모델을 바꿀 수 없어 기본 모델로 답합니다.');
              patchLastAssistant({ model: data.model });
            } else if (event === 'status') {
              if (data.phase === 'fallback') {
                patchLastAssistant({ phase: 'fallback', phaseSince: Date.now(), model: data.to ?? undefined });
              } else if (data.phase === 'thinking' || data.phase === 'writing') {
                patchLastAssistant((m) => (m.phase === data.phase ? {} : { phase: data.phase, phaseSince: Date.now() }));
              }
            } else if (event === 'text') {
              bufferRef.current += data.delta || '';
              if (!flushTimer.current) flushTimer.current = setTimeout(flush, FLUSH_MS);
            } else if (event === 'done') {
              finished = true;
              succeeded = true;
              flush();
              patchLastAssistant({
                status: 'done',
                phase: undefined,
                model: data.model,
                usage: data.usage,
                costUsd: data.costUsd,
                stopReason: data.stopReason,
              });
              setConversationId(data.conversationId);
              setTitle(data.title);
              if (isNew) setCreatedBy(userName);
              setMessageCount(data.messageCount);
              if (modelParam !== undefined) setServerOverride(modelParam);
              if (snapshot) {
                setSnapshotMeta({ builtAt: snapshot.builtAt, summary: snapshotSummary(s.persona, snapshot.counts), truncated: snapshot.truncated });
                setPendingRefresh(false);
              }
              optsRef.current.onTurnSaved?.({
                id: data.conversationId,
                persona: s.persona,
                title: data.title,
                createdBy: s.createdBy ?? userName,
                createdAt: now,
                lastMessageAt: new Date().toISOString(),
                messageCount: data.messageCount,
                modelOverride: modelParam !== undefined ? modelParam : s.serverOverride,
                lastModel: data.model,
                costUsd: 0,
              });
            } else if (event === 'error') {
              finished = true;
              flush();
              patchLastAssistant({
                status: 'error',
                phase: undefined,
                stopReason: data.code === 'refusal' ? 'refusal' : null,
                error: { code: data.code, message: data.message, retryable: !!data.retryable },
              });
              if (data.code === 'conflict' && s.conversationId) conflictId = s.conversationId;
            }
          },
          ac.signal,
        );
      } catch (err) {
        flush();
        const e = toAiRequestError(err);
        if (e.code === 'aborted') {
          patchLastAssistant({ status: 'stopped', phase: undefined });
        } else if (!finished) {
          patchLastAssistant({ status: 'error', phase: undefined, error: { code: e.code, message: e.message, retryable: e.retryable } });
          if (e.code === 'conflict' && s.conversationId) conflictId = s.conversationId;
          // 연결만 끊기고 서버는 저장했을 수 있다 — 서버가 앞서 있을 때만 대화를 다시 읽어 맞춘다
          if ((e.code === 'stream_incomplete' || e.code === 'stream_stalled') && resultConversationId) {
            openConversation(resultConversationId, { quiet: true, onlyIfAhead: s.messageCount });
          }
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        if (conflictId) recoverFromConflict(conflictId);
        if (succeeded && !optsRef.current.isActive && resultTitle) optsRef.current.onBackgroundReply?.(resultTitle);
      }
    },
    [flush, openConversation, patchLastAssistant, recoverFromConflict, snapshotDatasets],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  /** 실패/중지된 마지막 질문을 지우고 같은 내용으로 다시 보낸다 (서버에는 저장된 적 없음) */
  const retryLast = useCallback(() => {
    if (abortRef.current) return;
    const list = messagesRef.current;
    const last = list[list.length - 1];
    const user = list[list.length - 2];
    if (!last || !user || last.role !== 'assistant' || user.role !== 'user' || last.status === 'done') return;
    setMessages((prev) => prev.slice(0, -2));
    send(user.text);
  }, [send]);

  const continueLast = useCallback(() => send('이어서 계속 작성해줘'), [send]);

  const requestRefresh = useCallback(() => setPendingRefresh(true), []);

  return {
    conversationId,
    conversation,
    persona,
    title,
    createdBy,
    messages,
    messageCount,
    modelChoice,
    setModelChoice,
    streaming,
    loading,
    loadError,
    snapshotMeta,
    pendingRefresh,
    notice,
    setNotice,
    newChat,
    setPersona,
    openConversation,
    send,
    stop,
    retryLast,
    continueLast,
    requestRefresh,
  };
}

export type AiChat = ReturnType<typeof useAiChat>;
export { AiRequestError };
