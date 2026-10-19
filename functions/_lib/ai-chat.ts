// AI 어시스턴트 채팅 한 턴: 사전 검증(JSON 에러) → SSE 스트리밍 → D1 원자 저장 → done.
//
// 원칙
//   - 히스토리는 append-only. system 블록은 대화 생성 시 동결(system_json)하고 매 턴 그대로 보낸다.
//     어시스턴트 응답은 thinking 서명·fallback 블록까지 원본 그대로 저장/재전송한다
//     (fallback 블록을 빼면 서버가 해당 턴을 검증하지 못해 거부한다 — SDK BetaFallbackBlockParam 문서).
//   - 질문+답변은 성공(done) 시점에 한 번에 저장한다. 실패·중지·거부된 턴은 저장하지 않는다(사용량만 기록).
//   - 같은 대화에 동시에 쓰면 expectedCount(409) 와 UNIQUE(conversation_id, seq) 로 막는다.

import type { BetaMessageStream } from '@anthropic-ai/sdk/lib/BetaMessageStream';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { createClient, hasFallbackBlock, mapError, normalizeUsage, visibleText } from './ai-client';
import { AiError, cleanUserName, kstMonth, nowIso, openSse, type AiEnv } from './ai-http';
import { buildModelParams, costMicros, getModel, isSelectableFor, normalizeModelId, type Effort, type ModelSpec } from './ai-models';
import { isPersona, renderChatSystem, snapshotRefreshBlock, titleFrom, type Persona, type TextBlock } from './ai-prompts';
import { dbState, getConversation, insertUsage, loadReplay, loadSettings, turnStatements, type ReplayMessage, type TurnRecord } from './ai-store';

export const CHAT_LIMITS = {
  messageChars: 8_000,
  snapshotChars: 300_000,
  messagesPerConversation: 100,
};

export interface PreparedChat {
  db: D1Database;
  isNew: boolean;
  conversationId: string;
  persona: Persona;
  title: string;
  system: TextBlock[];
  systemJson: string;
  history: ReplayMessage[];
  seq: number;
  message: string;
  userContent: TextBlock[];
  userName: string;
  spec: ModelSpec;
  modelSource: 'override' | 'default';
  /** undefined = 유지, null = 해제, 문자열 = 지정 */
  modelOverride: string | null | undefined;
  overrideIgnored: boolean;
  effort: Effort | null;
  snapshot?: { chars: number; at: string };
}

/** 한국어 위주 텍스트 기준의 보수적 토큰 추정 (컨텍스트 초과 사전 차단용) */
function estimateTokens(chars: number): number {
  return Math.ceil(chars / 2);
}

export async function prepareChat(env: AiEnv, body: Record<string, unknown>): Promise<PreparedChat> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AiError(503, 'not_configured', 'AI API 키가 설정되지 않았습니다(관리자 확인 필요).');
  }
  const state = await dbState(env.AI_DB);
  if (state === 'unbound' || !env.AI_DB) {
    throw new AiError(503, 'not_configured', 'AI 저장소(D1)가 연결되지 않았습니다(관리자 확인 필요).');
  }
  if (state === 'no_tables') {
    throw new AiError(503, 'db_not_initialized', 'AI 저장소 테이블이 아직 만들어지지 않았습니다(관리자 확인 필요).');
  }
  const db = env.AI_DB;
  const settings = await loadSettings(db);
  const chat = settings.chat;
  if (!chat.enabled) throw new AiError(503, 'feature_disabled', '관리자가 AI 어시스턴트를 일시 중지했습니다.');

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) throw new AiError(400, 'bad_request', '질문을 입력하세요.');
  if (message.length > CHAT_LIMITS.messageChars) {
    throw new AiError(413, 'too_large', `질문은 ${CHAT_LIMITS.messageChars.toLocaleString()}자 이하로 입력하세요.`);
  }
  const snapshotRaw = typeof body.snapshot === 'string' ? body.snapshot.trim() : '';
  if (snapshotRaw.length > CHAT_LIMITS.snapshotChars) {
    throw new AiError(413, 'too_large', '데이터 스냅샷이 너무 큽니다.');
  }
  const userName = cleanUserName(body.userName);
  const at = nowIso();

  let isNew: boolean;
  let conversationId: string;
  let persona: Persona;
  let title: string;
  let system: TextBlock[];
  let systemJson: string;
  let history: ReplayMessage[] = [];
  let seq = 0;
  let storedOverride: string | null = null;
  let contextBase: number;

  if (typeof body.conversationId === 'string' && body.conversationId) {
    const conv = await getConversation(db, body.conversationId);
    if (!conv) throw new AiError(404, 'not_found', '대화를 찾을 수 없습니다. 삭제되었을 수 있습니다.');
    if (body.expectedCount !== conv.message_count) {
      throw new AiError(409, 'conflict', '다른 사용자가 먼저 메시지를 추가했습니다. 새로고침 후 다시 시도하세요.');
    }
    if (conv.message_count + 2 > CHAT_LIMITS.messagesPerConversation) {
      throw new AiError(413, 'context_too_long', '대화가 너무 길어졌습니다. 새 대화를 시작하세요.');
    }
    if (!isPersona(conv.persona)) throw new AiError(500, 'internal', '대화 데이터가 손상되었습니다.');
    isNew = false;
    conversationId = conv.id;
    persona = conv.persona;
    title = conv.title;
    systemJson = conv.system_json;
    system = JSON.parse(systemJson) as TextBlock[];
    history = await loadReplay(db, conv.id);
    seq = conv.message_count;
    storedOverride = conv.model_override;
    contextBase = conv.context_tokens || estimateTokens(systemJson.length);
  } else {
    if (!isPersona(body.persona)) throw new AiError(400, 'bad_request', '분석 유형(페르소나)이 올바르지 않습니다.');
    if (!snapshotRaw) throw new AiError(400, 'bad_request', '데이터 스냅샷이 없습니다. 페이지를 새로고침한 뒤 다시 시도하세요.');
    isNew = true;
    conversationId = crypto.randomUUID();
    persona = body.persona;
    title = titleFrom(message);
    system = renderChatSystem(persona, snapshotRaw, at);
    systemJson = JSON.stringify(system);
    contextBase = estimateTokens(systemJson.length);
  }

  // 모델: 대화별 변경(override)은 관리자가 허용하고 허용 목록에 있을 때만.
  const allowed = (id: string) => !!chat.allowOverride && (chat.overrideModels ?? []).includes(id) && isSelectableFor(id, 'chat');
  let modelOverride: string | null | undefined;
  let overrideIgnored = false;
  if (body.model === null) {
    modelOverride = null;
  } else if (typeof body.model === 'string' && body.model) {
    const id = normalizeModelId(body.model);
    if (!chat.allowOverride) {
      overrideIgnored = true;
    } else if (!allowed(id)) {
      throw new AiError(400, 'model_not_allowed', '선택한 모델은 사용할 수 없습니다. 관리자에게 문의하세요.');
    } else {
      modelOverride = id;
    }
  }
  const effectiveOverride = modelOverride === undefined ? storedOverride : modelOverride;
  let spec: ModelSpec | undefined;
  let modelSource: 'override' | 'default' = 'default';
  if (effectiveOverride && allowed(effectiveOverride)) {
    spec = getModel(effectiveOverride);
    modelSource = 'override';
  } else if (effectiveOverride && modelOverride === undefined) {
    // 관리자가 허용 목록에서 뺀 모델 — 저장된 선택을 정리하고 기본 모델로
    modelOverride = null;
  }
  spec = spec ?? getModel(chat.model);
  if (!spec) throw new AiError(500, 'internal', 'AI 모델 설정이 올바르지 않습니다(관리자 확인 필요).');

  const refresh = !isNew && snapshotRaw ? snapshotRefreshBlock(snapshotRaw, at) : null;
  const userContent: TextBlock[] = refresh ? [refresh, { type: 'text', text: message }] : [{ type: 'text', text: message }];

  const estimated = contextBase + estimateTokens(message.length + (refresh ? refresh.text.length : 0));
  if (estimated > spec.contextWindow * 0.9) {
    throw new AiError(
      413,
      'context_too_long',
      `대화가 ${spec.label}의 처리 한도에 가까워졌습니다. 새 대화를 시작하거나 다른 모델을 선택하세요.`,
    );
  }

  return {
    db,
    isNew,
    conversationId,
    persona,
    title,
    system,
    systemJson,
    history,
    seq,
    message,
    userContent,
    userName,
    spec,
    modelSource,
    modelOverride,
    overrideIgnored,
    effort: chat.effort,
    snapshot: snapshotRaw ? { chars: snapshotRaw.length, at } : undefined,
  };
}

export function streamChat(env: AiEnv, request: Request, waitUntil: (p: Promise<unknown>) => void, p: PreparedChat): Response {
  const sse = openSse(request, env);
  waitUntil(runTurn(env, sse, p));
  return sse.response;
}

async function runTurn(env: AiEnv, sse: ReturnType<typeof openSse>, p: PreparedChat): Promise<void> {
  const started = Date.now();
  const ym = kstMonth();
  let stream: BetaMessageStream | null = null;
  // thinking 중에는 이벤트가 없어 이탈을 늦게 알아챈다 — 1초마다 확인해 업스트림을 끊는다
  const watch = setInterval(() => {
    if (sse.closed) stream?.abort();
  }, 1000);

  sse.send('meta', {
    conversationId: p.conversationId,
    isNew: p.isNew,
    title: p.title,
    persona: p.persona,
    model: p.spec.id,
    modelSource: p.modelSource,
    overrideIgnored: p.overrideIgnored,
    effort: p.effort,
    userSeq: p.seq,
  });

  try {
    const client = createClient(env, { maxRetries: 1 });
    const { params, betas } = buildModelParams(p.spec, {
      feature: 'chat',
      effort: p.effort,
      historyHasFallback: hasFallbackBlock(p.history.map((h) => h.content)),
    });
    // 저장된 블록을 그대로 보내므로 SDK 파라미터 타입으로 단언한다.
    const body = {
      model: p.spec.id,
      max_tokens: Math.min(64_000, p.spec.maxOutput),
      system: p.system,
      messages: [...p.history, { role: 'user', content: p.userContent }],
      cache_control: { type: 'ephemeral' },
      ...params,
      ...(betas.length ? { betas } : {}),
    } as unknown as BetaMessageStreamParams;

    stream = client.beta.messages.stream(body);
    let phase = '';
    stream.on('streamEvent', (event) => {
      if (event.type !== 'content_block_start') return;
      const block = event.content_block;
      let next = phase;
      if (block.type === 'thinking' || block.type === 'redacted_thinking') next = 'thinking';
      else if (block.type === 'text') next = 'writing';
      else if (block.type === 'fallback') {
        sse.send('status', { phase: 'fallback', from: block.from?.model ?? null, to: block.to?.model ?? null });
        return;
      }
      if (next !== phase) {
        phase = next;
        sse.send('status', { phase });
      }
    });
    stream.on('text', (delta) => sse.text(delta));

    const msg = await stream.finalMessage();
    const usage = normalizeUsage(msg.usage);
    const servedModel = normalizeModelId(msg.model);
    const cost = costMicros(servedModel, usage);
    const text = visibleText(msg.content);
    const durationMs = Date.now() - started;
    const usageBase = {
      ym,
      feature: 'chat' as const,
      model: servedModel,
      requestedModel: p.spec.id,
      effort: p.effort,
      usage,
      costMicros: cost,
      durationMs,
      userName: p.userName,
      conversationId: p.isNew ? null : p.conversationId,
      at: nowIso(),
    };

    if (msg.stop_reason === 'refusal') {
      sse.send('error', {
        code: 'refusal',
        message: '안전 정책에 따라 AI가 답변하지 않았습니다. 질문 표현을 바꿔 다시 시도해 보세요.',
        retryable: false,
        category: msg.stop_details?.category ?? null,
        partial: !!text,
        persisted: false,
      });
      await insertUsage(p.db, { ...usageBase, status: 'refusal', errorCode: 'refusal' }).catch(() => {});
      return;
    }
    if (msg.stop_reason === 'max_tokens' && !text.trim()) {
      sse.send('error', {
        code: 'max_tokens',
        message: '응답이 길이 제한에 걸려 내용을 만들지 못했습니다. 질문을 나눠서 다시 시도하세요.',
        retryable: false,
        partial: false,
        persisted: false,
      });
      await insertUsage(p.db, { ...usageBase, status: 'max_tokens', errorCode: 'max_tokens' }).catch(() => {});
      return;
    }
    // prefix_binding_mismatch = 저장된 히스토리 앞부분이 바뀌었다는 뜻(append-only 위반) — 응답은 정상이지만 원인을 찾아야 한다.
    // (대화 중 모델을 바꾸면 생기는 model_binding_mismatch 는 정상)
    const prefixDrops = (msg.input_transformations ?? []).filter(
      (t) => (t as { reason?: string }).reason === 'prefix_binding_mismatch',
    );
    if (prefixDrops.length > 0) {
      console.warn('[ai-chat] prefix_binding_mismatch', p.conversationId, JSON.stringify(prefixDrops).slice(0, 500));
    }

    // 사용자가 중지했거나 연결이 끊겼으면 저장하지 않는다 (화면에는 "중지됨 · 저장되지 않음")
    if (!(await sse.probe())) {
      await insertUsage(p.db, { ...usageBase, status: 'aborted', errorCode: 'client_gone' }).catch(() => {});
      return;
    }

    const contextTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens;
    const record: TurnRecord = {
      conversationId: p.conversationId,
      create: p.isNew
        ? {
            persona: p.persona,
            title: p.title,
            systemJson: p.systemJson,
            snapshotChars: p.snapshot?.chars ?? 0,
            snapshotAt: p.snapshot?.at ?? usageBase.at,
            createdBy: p.userName,
          }
        : undefined,
      seq: p.seq,
      modelOverride: p.modelOverride,
      snapshotRefresh: !p.isNew && p.snapshot ? p.snapshot : undefined,
      requestedModel: p.spec.id,
      servedModel,
      effort: p.effort,
      user: {
        contentJson: JSON.stringify(p.userContent),
        displayText: p.message,
        userName: p.userName,
        hasSnapshot: !p.isNew && !!p.snapshot,
      },
      // parsed_output 등 SDK 보조 속성은 열거 불가라 JSON 에 들어가지 않는다 — API 응답 원본 그대로
      assistant: { contentJson: JSON.stringify(msg.content), displayText: text, stopReason: msg.stop_reason, anthropicId: msg.id },
      usage,
      costMicros: cost,
      contextTokens,
      durationMs,
      at: usageBase.at,
      ym,
    };

    const persisted = await persistTurn(p.db, record);
    if (persisted !== 'ok') {
      sse.send('error', {
        code: persisted,
        message:
          persisted === 'conflict'
            ? '다른 사용자가 먼저 메시지를 추가했습니다. 새로고침 후 다시 시도하세요.'
            : '응답은 생성됐지만 저장하지 못했습니다. 다시 시도해 주세요.',
        retryable: persisted !== 'conflict',
        partial: true,
        persisted: false,
      });
      await insertUsage(p.db, { ...usageBase, status: 'error', errorCode: persisted }).catch(() => {});
      return;
    }

    sse.send('done', {
      conversationId: p.conversationId,
      title: p.title,
      stopReason: msg.stop_reason,
      model: servedModel,
      userSeq: p.seq,
      assistantSeq: p.seq + 1,
      messageCount: p.seq + 2,
      usage,
      costUsd: cost / 1e6,
      contextTokens,
    });
  } catch (err) {
    const e = mapError(err);
    if (!sse.closed) {
      sse.send('error', {
        code: e.code,
        message: e.message,
        retryable: e.retryable,
        ...(e.retryAfterSec ? { retryAfterSec: e.retryAfterSec } : {}),
        partial: false,
        persisted: false,
      });
    }
    const partial = normalizeUsage(stream?.currentMessage?.usage);
    if (partial.inputTokens || partial.outputTokens) {
      await insertUsage(p.db, {
        ym,
        feature: 'chat',
        model: p.spec.id,
        requestedModel: p.spec.id,
        effort: p.effort,
        status: e.code === 'aborted' ? 'aborted' : 'error',
        errorCode: e.code,
        usage: partial,
        costMicros: costMicros(p.spec.id, partial),
        durationMs: Date.now() - started,
        userName: p.userName,
        conversationId: p.isNew ? null : p.conversationId,
        at: nowIso(),
      }).catch(() => {});
    }
  } finally {
    clearInterval(watch);
    await sse.close();
  }
}

async function persistTurn(db: D1Database, record: TurnRecord): Promise<'ok' | 'conflict' | 'persist_failed'> {
  try {
    await db.batch(turnStatements(db, record));
    return 'ok';
  } catch (err) {
    if (/UNIQUE|constraint/i.test(String(err))) return 'conflict';
    console.error('[ai-chat] persist failed, retrying', String(err).slice(0, 300));
  }
  // 오류가 났어도 첫 batch 가 실제로는 커밋됐을 수 있다 — 같은 응답이 이미 있으면 성공으로 본다
  if (await turnCommitted(db, record)) return 'ok';
  try {
    await db.batch(turnStatements(db, record));
    return 'ok';
  } catch (err) {
    console.error('[ai-chat] persist failed', String(err).slice(0, 300));
    if (await turnCommitted(db, record)) return 'ok';
    return /UNIQUE|constraint/i.test(String(err)) ? 'conflict' : 'persist_failed';
  }
}

async function turnCommitted(db: D1Database, record: TurnRecord): Promise<boolean> {
  if (!record.assistant.anthropicId) return false;
  try {
    const row = await db
      .prepare('SELECT anthropic_id FROM ai_messages WHERE conversation_id = ? AND seq = ?')
      .bind(record.conversationId, record.seq + 1)
      .first<{ anthropic_id: string | null }>();
    return row?.anthropic_id === record.assistant.anthropicId;
  } catch {
    return false;
  }
}
