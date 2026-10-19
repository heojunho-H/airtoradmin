// Cloudflare Pages Function — /api/assistant (AI 어시스턴트 · AI 기업정보 · AI 설정, Anthropic Claude)
// 프론트엔드 → 같은 도메인(/api/assistant) → Anthropic Messages API (API 키·프롬프트·모델은 서버가 소유).
//
// 경로명: "claude"/"anthropic" 토큰은 WAF 에 막힌 전례가 있어 중립적인 단어를 쓴다.
// 운영 존(airtoradmin.co.kr)에는 /api/assistant·/api/staffing 에 관리형 룰 Skip 커스텀 룰을 둔다(docs/ai-claude.md).
//
// 환경변수/바인딩 (Cloudflare Pages, Production·Preview 모두):
//   ANTHROPIC_API_KEY   Anthropic API 키
//   AI_DB               D1 바인딩 (스키마: d1/migrations/0001_ai_init.sql)
//   AI_ADMIN_PIN        설정 변경용 관리자 PIN (미설정이면 설정은 읽기 전용)
//   AI_ALLOWED_ORIGINS  (선택) 추가 허용 Origin, 쉼표 구분
//
// GET  ?action=status                      → 연결 상태 (D1·API 키·PIN 설정 여부)
// GET  ?action=config                      → 모델 목록 + 기능별 설정 + 입력 한도
// GET  ?action=conversations&limit=&cursor=&persona=&author=&q=   → 팀 공유 대화 목록
// GET  ?action=conversation&id=            → 대화 + 메시지(표시용 텍스트)
// GET  ?action=usage&month=YYYY-MM         → 월 사용량·추정 비용 (KST)
// POST { action:'chat', ... }              → SSE (ai-chat.ts)
// POST { action:'company-info', company }  → SSE 또는 { stream:false } 면 JSON (ai-company.ts)
// POST { action:'verify-pin', pin }
// POST { action:'save-settings', pin, userName, settings }
// POST { action:'rename-conversation', id, title, userName, pin? }
// POST { action:'delete-conversation', id, userName, pin? }

import { ownerOrPin, requireDb, verifyPin } from '../_lib/ai-auth';
import { prepareChat, streamChat, CHAT_LIMITS } from '../_lib/ai-chat';
import { handleCompanyInfo } from '../_lib/ai-company';
import {
  AiError,
  checkOrigin,
  cleanUserName,
  errorResponse,
  ipHash,
  isMonth,
  jsonFor,
  kstMonth,
  nowIso,
  optionsResponse,
  readJsonCapped,
  type AiEnv,
} from '../_lib/ai-http';
import {
  FEATURES,
  MODELS,
  getModel,
  isEffort,
  isSelectableFor,
  publicModel,
  resolveEffort,
  type Feature,
  type FeatureSettings,
} from '../_lib/ai-models';
import { PERSONAS, isPersona } from '../_lib/ai-prompts';
import {
  audit,
  dbState,
  getConversation,
  listConversations,
  loadDisplayMessages,
  loadSettings,
  renameConversation,
  saveSettings,
  softDeleteConversation,
  usageReport,
} from '../_lib/ai-store';

const SDK_VERSION = '0.135.0';

type Ctx = EventContext<AiEnv, string, Record<string, unknown>>;

export const onRequestGet: PagesFunction<AiEnv> = async (context) => {
  const { request, env } = context;
  try {
    const originError = checkOrigin(request, env);
    if (originError) throw originError;
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    switch (action) {
      case 'status':
        return jsonFor(request, env, {
          ok: true,
          db: await dbState(env.AI_DB),
          apiKey: !!env.ANTHROPIC_API_KEY,
          pinConfigured: !!env.AI_ADMIN_PIN,
          sdk: SDK_VERSION,
        });
      case 'config':
        return jsonFor(request, env, {
          ok: true,
          pinConfigured: !!env.AI_ADMIN_PIN,
          personas: PERSONAS,
          limits: { ...CHAT_LIMITS, companyChars: 100 },
          models: MODELS.filter((m) => m.selectable).map(publicModel),
          settings: await loadSettings(env.AI_DB),
        });
      case 'conversations': {
        const db = await requireDb(env);
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 30, 1), 100);
        const persona = url.searchParams.get('persona');
        const result = await listConversations(db, {
          limit,
          cursor: url.searchParams.get('cursor'),
          persona: persona && isPersona(persona) ? persona : null,
          author: url.searchParams.get('author')?.slice(0, 50) || null,
          q: url.searchParams.get('q')?.trim().slice(0, 50) || null,
        });
        return jsonFor(request, env, { ok: true, ...result });
      }
      case 'conversation': {
        const db = await requireDb(env);
        const id = url.searchParams.get('id') || '';
        const conv = id ? await getConversation(db, id) : null;
        if (!conv) throw new AiError(404, 'not_found', '대화를 찾을 수 없습니다. 삭제되었을 수 있습니다.');
        const settings = await loadSettings(db);
        const chat = settings.chat;
        const override =
          conv.model_override && chat.allowOverride && (chat.overrideModels ?? []).includes(conv.model_override)
            ? conv.model_override
            : null;
        return jsonFor(request, env, {
          ok: true,
          conversation: {
            id: conv.id,
            persona: conv.persona,
            title: conv.title,
            createdBy: conv.created_by,
            createdAt: conv.created_at,
            lastMessageAt: conv.last_message_at,
            messageCount: conv.message_count,
            modelOverride: override,
            effectiveModel: override ?? chat.model,
            lastModel: conv.last_model,
            snapshotAt: conv.snapshot_at,
            snapshotChars: conv.snapshot_chars,
            contextTokens: conv.context_tokens,
            costUsd: conv.total_cost_micros / 1e6,
          },
          messages: await loadDisplayMessages(db, conv.id),
        });
      }
      case 'usage': {
        const db = await requireDb(env);
        const month = url.searchParams.get('month');
        return jsonFor(request, env, { ok: true, ...(await usageReport(db, isMonth(month) ? month : kstMonth())) });
      }
      default:
        throw new AiError(400, 'bad_request', '알 수 없는 요청입니다.');
    }
  } catch (err) {
    return errorResponse(request, env, toAiError(err));
  }
};

export const onRequestPost: PagesFunction<AiEnv> = async (context) => {
  const { request, env } = context;
  try {
    const originError = checkOrigin(request, env);
    if (originError) throw originError;
    // 채팅 본문은 첫 턴 데이터 스냅샷(최대 30만 자)을 포함한다
    const body = await readJsonCapped<Record<string, unknown>>(request, CHAT_LIMITS.snapshotChars + CHAT_LIMITS.messageChars + 20_000);
    switch (body.action) {
      case 'chat': {
        const prepared = await prepareChat(env, body);
        return streamChat(env, request, (p) => context.waitUntil(p), prepared);
      }
      case 'company-info':
        return await handleCompanyInfo(env, request, (p) => context.waitUntil(p), body);
      case 'verify-pin':
        await verifyPin(context.request, context.env, body.pin, cleanUserName(body.userName));
        return jsonFor(request, env, { ok: true });
      case 'save-settings':
        return await handleSaveSettings(context, body);
      case 'rename-conversation':
        return await handleRename(context, body);
      case 'delete-conversation':
        return await handleDelete(context, body);
      default:
        throw new AiError(400, 'bad_request', '알 수 없는 요청입니다.');
    }
  } catch (err) {
    return errorResponse(request, env, toAiError(err));
  }
};

export const onRequestOptions: PagesFunction<AiEnv> = async ({ request, env }) => optionsResponse(request, env, 'GET, POST, OPTIONS');

// ─── 공통 ───────────────────────────────────────────────────────────────

function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  console.error('[assistant] unexpected', String(err).slice(0, 300));
  return new AiError(500, 'internal', '처리 중 오류가 발생했습니다.', { retryable: true });
}



// ─── 설정 저장 ──────────────────────────────────────────────────────────

async function handleSaveSettings(context: Ctx, body: Record<string, unknown>): Promise<Response> {
  const { request, env } = context;
  const actor = cleanUserName(body.userName);
  await verifyPin(request, env, body.pin, actor);
  const db = await requireDb(env);

  const patch = body.settings && typeof body.settings === 'object' ? (body.settings as Record<string, unknown>) : null;
  if (!patch) throw new AiError(400, 'bad_request', '변경할 설정이 없습니다.');

  const current = await loadSettings(db);
  const next = {} as Record<Feature, FeatureSettings>;
  for (const f of FEATURES) {
    const { source: _source, updatedBy: _by, updatedAt: _at, ...base } = current[f];
    const p = patch[f] && typeof patch[f] === 'object' ? (patch[f] as Record<string, unknown>) : {};
    const merged: FeatureSettings = { ...base };

    if (p.model !== undefined) {
      if (typeof p.model !== 'string' || !isSelectableFor(p.model, f)) {
        throw new AiError(400, 'bad_request', '선택할 수 없는 모델입니다.');
      }
      merged.model = p.model;
    }
    if (p.effort !== undefined) {
      if (p.effort !== null && !isEffort(p.effort)) throw new AiError(400, 'bad_request', '추론 강도 값이 올바르지 않습니다.');
      merged.effort = p.effort as FeatureSettings['effort'];
    }
    if (p.enabled !== undefined) merged.enabled = p.enabled === true;
    // 모델이 지원하지 않는 effort 는 실행 때와 같은 규칙으로 맞춘다 (Haiku 는 없음, Sonnet 4.6 의 xhigh → high)
    const spec = getModel(merged.model);
    merged.effort = spec ? resolveEffort(spec, merged.effort) ?? null : null;

    if (f === 'chat') {
      if (p.allowOverride !== undefined) merged.allowOverride = p.allowOverride === true;
      if (p.overrideModels !== undefined) {
        if (!Array.isArray(p.overrideModels)) throw new AiError(400, 'bad_request', '허용 모델 목록이 올바르지 않습니다.');
        const list = [...new Set(p.overrideModels.filter((m): m is string => typeof m === 'string' && isSelectableFor(m, 'chat')))];
        merged.overrideModels = list;
      }
      // 기본 모델은 항상 대화별 선택 목록에 포함
      const list = merged.overrideModels ?? [];
      if (!list.includes(merged.model)) merged.overrideModels = [merged.model, ...list];
    }
    next[f] = merged;
  }

  const at = nowIso();
  await saveSettings(db, next, actor, at);
  await audit(db, 'settings_update', actor, next, await ipHash(request), at).catch(() => {});
  return jsonFor(request, env, { ok: true, settings: await loadSettings(db) });
}

// ─── 대화 이름 변경 / 삭제 (작성자 또는 PIN) ─────────────────────────────


async function handleRename(context: Ctx, body: Record<string, unknown>): Promise<Response> {
  const { request, env } = context;
  const db = await requireDb(env);
  const id = typeof body.id === 'string' ? body.id : '';
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 100) : '';
  if (!id || !title) throw new AiError(400, 'bad_request', '대화 제목을 입력하세요.');
  const conv = await getConversation(db, id);
  if (!conv) throw new AiError(404, 'not_found', '대화를 찾을 수 없습니다.');
  await ownerOrPin(request, env, body, conv.created_by, cleanUserName(body.userName));
  await renameConversation(db, id, title, nowIso());
  return jsonFor(request, env, { ok: true, title });
}

async function handleDelete(context: Ctx, body: Record<string, unknown>): Promise<Response> {
  const { request, env } = context;
  const db = await requireDb(env);
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) throw new AiError(400, 'bad_request', '삭제할 대화가 없습니다.');
  const conv = await getConversation(db, id);
  if (!conv) throw new AiError(404, 'not_found', '대화를 찾을 수 없습니다.');
  const actor = cleanUserName(body.userName);
  await ownerOrPin(request, env, body, conv.created_by, actor);
  const at = nowIso();
  await softDeleteConversation(db, id, actor, at);
  await audit(db, 'conversation_delete', actor, { id, title: conv.title }, await ipHash(request), at).catch(() => {});
  return jsonFor(request, env, { ok: true });
}
