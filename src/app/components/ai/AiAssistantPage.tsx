// AI 어시스턴트 전용 페이지 (사이드바 "AI 어시스턴트") — Claude 기반, 대화는 팀 전체 공유.
// App 은 첫 방문 시 마운트한 뒤 숨김(hidden)으로 유지한다 → 다른 탭에 다녀와도 스트림·대화·입력이 유지된다.

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { deleteConversation, renameConversation, toAiRequestError } from '../../../lib/ai/api';
import type { AiDatasets } from '../../../lib/ai/types';
import { ChatComposer } from './ChatComposer';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatHeader, SnapshotBar } from './ChatHeader';
import { ChatThread } from './ChatThread';
import { ConversationList } from './ConversationList';
import { useAiChat } from './useAiChat';
import { useAiConfig } from './useAiConfig';
import { useConversationList } from './useConversationList';

export interface AiAssistantPageProps {
  isActive: boolean;
  userName: string;
  datasets: AiDatasets;
  loadFreshDatasets: () => Promise<AiDatasets>;
  onStreamingChange?: (streaming: boolean) => void;
  onBackgroundReply?: (title: string) => void;
  onOpenSettings?: () => void;
}

function AiAssistantPage({ isActive, userName, datasets, loadFreshDatasets, onStreamingChange, onBackgroundReply, onOpenSettings }: AiAssistantPageProps) {
  const { config, error: configError, reload: reloadConfig } = useAiConfig();
  const list = useConversationList({ userName, isActive });
  const chat = useAiChat({
    userName,
    config,
    datasets,
    loadFreshDatasets,
    isActive,
    onStreamingChange,
    onBackgroundReply,
    onTurnSaved: list.upsert,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  // 설정을 못 불러왔으면 페이지로 돌아올 때·창에 다시 들어올 때 재시도
  useEffect(() => {
    if (!isActive || !configError) return;
    reloadConfig();
    const onFocus = () => reloadConfig();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isActive, configError, reloadConfig]);

  const confirmLeave = useCallback(() => !chat.streaming || window.confirm('응답을 생성하는 중입니다. 중지하고 이동할까요?'), [chat.streaming]);

  // 지금 열린 대화를 다시 누르면 서버에서 새로 불러온다 (다른 사람이 이어 쓴 내용 반영)
  const selectConversation = (id: string) => {
    setDrawerOpen(false);
    if (!confirmLeave()) return;
    chat.openConversation(id);
  };

  const startNew = () => {
    setDrawerOpen(false);
    if (!confirmLeave()) return;
    chat.newChat();
  };

  const rename = async (id: string, title: string) => {
    try {
      const res = await renameConversation(id, title, userName);
      list.patch(id, { title: res.title });
    } catch (err) {
      setActionError(toAiRequestError(err).message);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteConversation(id, userName);
      list.remove(id);
      if (id === chat.conversationId) chat.newChat();
    } catch (err) {
      setActionError(toAiRequestError(err).message);
    }
  };

  const costUsd = useMemo(() => chat.messages.reduce((s, m) => s + (m.costUsd ?? 0), 0), [chat.messages]);
  const chatDisabledReason = configError
    ? `AI 설정을 불러오지 못했습니다: ${configError}`
    : config && !config.settings.chat.enabled
      ? '관리자가 AI 어시스턴트를 일시 중지했습니다.'
      : null;
  const hasConversation = !!chat.conversationId || chat.messages.length > 0;

  const listPanel = (
    <ConversationList
      items={list.items}
      activeId={chat.conversationId}
      me={userName}
      loading={list.loading}
      error={list.error}
      hasMore={list.hasMore}
      filter={list.filter}
      onFilter={list.setFilter}
      onLoadMore={list.loadMore}
      onSelect={selectConversation}
      onNewChat={startNew}
      onRename={rename}
      onDelete={remove}
    />
  );

  return (
    <div className="relative flex h-full min-h-0 bg-slate-50">
      <aside className="hidden lg:flex w-72 flex-shrink-0 flex-col border-r border-slate-200 bg-white">{listPanel}</aside>

      {drawerOpen && (
        <div className="lg:hidden absolute inset-0 z-30 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="relative flex w-[85%] max-w-sm flex-col bg-white shadow-xl" role="dialog" aria-label="대화 목록">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <span className="text-[14px] font-semibold text-slate-800">대화 목록</span>
              <button onClick={() => setDrawerOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="닫기">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{listPanel}</div>
          </div>
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          persona={chat.persona}
          title={chat.title}
          createdBy={chat.createdBy}
          me={userName}
          costUsd={hasConversation ? costUsd : null}
          config={config}
          modelChoice={chat.modelChoice}
          onModelChange={chat.setModelChoice}
          modelDisabled={chat.streaming}
          onNewChat={startNew}
          onOpenList={() => setDrawerOpen(true)}
          onOpenSettings={onOpenSettings}
        />
        <SnapshotBar
          meta={chat.snapshotMeta}
          pending={chat.pendingRefresh}
          hasConversation={!!chat.conversationId}
          onRefresh={chat.requestRefresh}
          disabled={chat.streaming}
        />

        {(chatDisabledReason || chat.loadError || actionError || chat.notice) && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 md:px-8 py-2 text-[13px] text-amber-800">
            <div className="mx-auto flex max-w-3xl items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p className="flex-1">{chatDisabledReason || chat.loadError || actionError || chat.notice}</p>
              {configError && (
                <button onClick={() => reloadConfig()} className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[12px] font-medium hover:bg-amber-100">
                  다시 시도
                </button>
              )}
              {(actionError || chat.notice) && !chatDisabledReason && (
                <button
                  onClick={() => {
                    setActionError(null);
                    chat.setNotice(null);
                  }}
                  className="rounded p-0.5 hover:bg-amber-100"
                  aria-label="알림 닫기"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {chat.loading ? (
          <div className="flex flex-1 items-center justify-center text-[13px] text-slate-400">대화를 불러오는 중…</div>
        ) : chat.messages.length === 0 ? (
          <ChatEmptyState persona={chat.persona} onPersona={chat.setPersona} onAsk={chat.send} disabled={!!chatDisabledReason || chat.streaming} />
        ) : (
          <ChatThread
            messages={chat.messages}
            me={userName}
            models={config?.models}
            isActive={isActive}
            conversationKey={chat.conversationId ?? 'new'}
            onRetry={chat.retryLast}
            onContinue={chat.continueLast}
          />
        )}

        <ChatComposer
          streaming={chat.streaming}
          disabled={!!chatDisabledReason || chat.loading}
          maxChars={config?.limits.messageChars ?? 8000}
          autoFocus={isActive}
          placeholder={chat.messages.length === 0 ? '분석할 내용을 물어보세요 (예: 이번 달 수주율이 떨어진 이유는?)' : '이어서 질문하기'}
          onSend={chat.send}
          onStop={chat.stop}
        />
        <div className="sr-only" aria-live="polite">
          {chat.streaming ? '응답 생성 중' : ''}
        </div>
      </section>
    </div>
  );
}

export default memo(AiAssistantPage);
