// AI 어시스턴트 전용 페이지 (사이드바 "AI 어시스턴트") — Claude 기반, 대화는 팀 전체 공유.
// App 은 첫 방문 시 마운트한 뒤 숨김(hidden)으로 유지한다 → 다른 탭에 다녀와도 스트림·대화·입력이 유지된다.
// 화면 구성은 Datarize AI 레퍼런스를 따른다: 왼쪽 연회색 대화 패널, 빈 화면은 ✦ 제목 + 큰 입력창 + 추천 카드.

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLast, PanelLeft, X } from 'lucide-react';
import { deleteConversation, renameConversation, toAiRequestError } from '../../../lib/ai/api';
import { PERSONAS } from '../../../lib/ai/personas';
import type { AiDatasets, PersonaId } from '../../../lib/ai/types';
import { ChatComposer } from './ChatComposer';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatHeader } from './ChatHeader';
import { ChatThread } from './ChatThread';
import { DataMenu, ModelPicker } from './ComposerControls';
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

const PANEL_KEY = 'ai_panel_collapsed';
// 좁은 화면에서는 입력창에 모델 칩까지 들어가 긴 안내 문구가 두 줄로 잘린다
const NARROW = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 480px)').matches;
// 하단 연파랑 배경 — 별도 레이어를 겹치지 않고 배경으로 깔아 내용 위에 그려지지 않게 한다
const PAGE_BACKGROUND = { backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #ffffff calc(100% - 15rem), #eaf3ff 100%)' };

function readCollapsed() {
  try {
    return localStorage.getItem(PANEL_KEY) === '1';
  } catch {
    return false;
  }
}

function Disclaimer({ compact }: { compact?: boolean }) {
  return (
    <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400">
      AI 답변은 참고용이며, 대화는 팀 전체에 공유됩니다.
      {!compact && (
        <>
          <br />
          고객 연락처 등 개인정보는 입력하지 않도록 유의해 주세요.
        </>
      )}
    </p>
  );
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
  const [panelCollapsed, setPanelCollapsed] = useState(readCollapsed);
  const [actionError, setActionError] = useState<string | null>(null);
  // 입력 초안 — 빈 화면(가운데 입력창) ↔ 대화 화면(하단 입력창)으로 바뀌어도 유지
  const [draft, setDraft] = useState('');

  const setCollapsed = (collapsed: boolean) => {
    setPanelCollapsed(collapsed);
    try {
      localStorage.setItem(PANEL_KEY, collapsed ? '1' : '0');
    } catch {
      // 저장소 차단 — 이번 세션에서만 유지
    }
  };

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

  // 다른 전문가에게 이어서 묻기 — 새 대화를 열고 마지막 질문을 입력창에 옮긴다 (자동 전송하지 않음)
  const switchExpert = (p: PersonaId) => {
    if (!confirmLeave()) return;
    const lastQuestion = [...chat.messages].reverse().find((m) => m.role === 'user')?.text ?? '';
    chat.newChat(p);
    setDraft(lastQuestion);
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
  const datasetSummary = useMemo(() => {
    const parts: string[] = [];
    if (datasets.deals.length) parts.push(`딜 ${datasets.deals.length.toLocaleString('ko-KR')}`);
    if (datasets.customers.length) parts.push(`고객 ${datasets.customers.length.toLocaleString('ko-KR')}`);
    if (datasets.projects.length) parts.push(`프로젝트 ${datasets.projects.length.toLocaleString('ko-KR')}`);
    return parts.join(' · ');
  }, [datasets]);

  const chatDisabledReason = configError
    ? `AI 설정을 불러오지 못했습니다: ${configError}`
    : config && !config.settings.chat.enabled
      ? '관리자가 AI 어시스턴트를 일시 중지했습니다.'
      : null;
  const showThread = chat.loading || chat.messages.length > 0;
  const bannerText = chatDisabledReason || chat.loadError || actionError || chat.notice;

  const renderList = (mode: 'panel' | 'drawer') => (
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
      onCollapse={mode === 'panel' ? () => setCollapsed(true) : undefined}
      onClose={mode === 'drawer' ? () => setDrawerOpen(false) : undefined}
      onOpenSettings={onOpenSettings}
    />
  );

  const banner = bannerText && (
    <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <p className="flex-1">{bannerText}</p>
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
  );

  const renderComposer = (variant: 'hero' | 'dock') => (
    <ChatComposer
      variant={variant}
      value={draft}
      onChange={setDraft}
      streaming={chat.streaming}
      disabled={!!chatDisabledReason || chat.loading}
      maxChars={config?.limits.messageChars ?? 8000}
      autoFocus={isActive}
      placeholder={variant === 'dock' ? '이어서 질문하기' : NARROW ? '질문을 입력하세요' : `${PERSONAS[chat.persona].label}에게 물어보세요`}
      onSend={chat.send}
      onStop={chat.stop}
      leading={
        <DataMenu
          meta={chat.snapshotMeta}
          pending={chat.pendingRefresh}
          hasConversation={!!chat.conversationId}
          datasetSummary={datasetSummary}
          onRefresh={chat.requestRefresh}
          disabled={chat.streaming}
          placement={variant === 'hero' ? 'down' : 'up'}
        />
      }
      trailing={<ModelPicker config={config} value={chat.modelChoice} onChange={chat.setModelChoice} disabled={chat.streaming} />}
    />
  );

  return (
    <div className="relative flex h-full min-h-0 bg-white">
      {!panelCollapsed && <aside className="hidden w-60 flex-shrink-0 border-r border-[#eceef2] lg:flex lg:flex-col">{renderList('panel')}</aside>}

      {drawerOpen && (
        <div className="absolute inset-0 z-30 flex lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="relative flex w-[85%] max-w-xs flex-col shadow-xl" role="dialog" aria-label="대화 목록">
            {renderList('drawer')}
          </div>
        </div>
      )}

      <section className="relative flex min-w-0 flex-1 flex-col" style={PAGE_BACKGROUND}>
        {showThread ? (
          <>
            <ChatHeader
              persona={chat.persona}
              title={chat.title}
              createdBy={chat.createdBy}
              me={userName}
              costUsd={chat.messages.length > 0 ? costUsd : null}
              panelCollapsed={panelCollapsed}
              onExpandPanel={() => setCollapsed(false)}
              onOpenList={() => setDrawerOpen(true)}
              onNewChat={startNew}
              onSwitchExpert={switchExpert}
              disabled={chat.streaming || chat.loading}
            />
            {chat.loading ? (
              <div className="flex flex-1 items-center justify-center text-[13px] text-slate-400">대화를 불러오는 중…</div>
            ) : (
              <ChatThread
                messages={chat.messages}
                me={userName}
                expertLabel={PERSONAS[chat.persona].label}
                models={config?.models}
                isActive={isActive}
                conversationKey={chat.conversationId ?? 'new'}
                onRetry={chat.retryLast}
                onContinue={chat.continueLast}
              />
            )}
            <div className="px-4 pb-3 pt-2 md:px-8">
              <div className="mx-auto max-w-[800px]">
                {banner}
                {renderComposer('dock')}
                <Disclaimer compact />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* 빈 화면에는 헤더가 없다 — 패널을 접었거나 모바일이면 왼쪽 위에 목록 버튼 */}
            <div className="absolute left-3 top-3 z-10 flex gap-1">
              <button onClick={() => setDrawerOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="대화 목록 열기">
                <PanelLeft className="h-[18px] w-[18px]" />
              </button>
              {panelCollapsed && (
                <button
                  onClick={() => setCollapsed(false)}
                  className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:inline-flex"
                  aria-label="대화 목록 펼치기"
                  title="대화 목록 펼치기"
                >
                  <ChevronLast className="h-[18px] w-[18px]" />
                </button>
              )}
            </div>
            <ChatEmptyState
              persona={chat.persona}
              onPersona={chat.setPersona}
              onAsk={chat.send}
              disabled={!!chatDisabledReason || chat.streaming}
              composer={
                <>
                  {banner}
                  {renderComposer('hero')}
                </>
              }
            />
            <div className="px-4 pb-4">
              <Disclaimer />
            </div>
          </>
        )}
        <div className="sr-only" aria-live="polite">
          {chat.streaming ? '응답 생성 중' : ''}
        </div>
      </section>
    </div>
  );
}

export default memo(AiAssistantPage);
