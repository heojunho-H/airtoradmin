// Cloudflare Pages Function — /api/staffing (AI 인력배치, Anthropic Claude)
// 경로명 "claude" 회피: Cloudflare 무료 플랜 WAF 가 path 에 "claude" 가 든 POST 를 403 차단한
// 전례가 있어 2026-05-28 /api/claude → /api/staffing 으로 변경했다. (assistant 경로와 함께 WAF Skip 룰 대상)
//
// 요청 (POST, JSON):
//   { input: StaffingInput, projectId?, userName? }
//     → 200 { ok:true, data: StaffingSuggestion, model, effort, method, usage, costUsd, stopReason }
//     → 실패 { ok:false, code, message(한국어), retryable }
//   레거시(이전 배포 탭): Anthropic Messages 본문 그대로 { _model, system, tools, messages, ... }
//     → messages[0] 의 사용자 텍스트만 꺼내 서버 프롬프트로 처리하고, 응답은 예전 tool_use 형태로 돌려준다.
//     → 클라이언트의 _model·system·tools·max_tokens 는 무시한다(오픈 릴레이 차단). 1주 뒤 제거 예정.
//
// 모델·추론 강도는 설정 화면(D1 ai_settings.staffing)에서만 정한다. D1 이 없거나 장애면 코드 기본값
// (Sonnet 4.6, thinking 없음, temperature 0.3, 강제 tool — Phase 1.8 동작과 동일)으로 동작한다.

import { createClient, mapError, normalizeUsage, visibleText } from '../_lib/ai-client';
import {
  AiError,
  checkOrigin,
  cleanUserName,
  errorResponse,
  jsonFor,
  kstMonth,
  nowIso,
  optionsResponse,
  readJsonCapped,
  type AiEnv,
} from '../_lib/ai-http';
import { DEFAULT_SETTINGS, buildModelParams, costMicros, getModel, normalizeModelId, resolveEffort, type ModelSpec } from '../_lib/ai-models';
import {
  STAFFING_JSON_SCHEMA,
  STAFFING_TOOL,
  extractLegacyUserContent,
  normalizeSuggestion,
  staffingSystem,
  staffingUserContent,
  validateStaffingInput,
  type StaffingMethod,
} from '../_lib/ai-staffing';
import { insertUsage, loadSettings, type UsageStatus } from '../_lib/ai-store';
import type Anthropic from '@anthropic-ai/sdk';

const SDK_TIMEOUT_MS = 80_000; // 브라우저 큐 타임아웃(90초)보다 짧게

export const onRequestPost: PagesFunction<AiEnv> = async (context) => {
  const { request, env } = context;
  const originError = checkOrigin(request, env);
  if (originError) return errorResponse(request, env, originError);

  const started = Date.now();
  let spec: ModelSpec | undefined;
  let effort: ReturnType<typeof resolveEffort> | undefined;
  let userName: string | null = null;
  let ref = 'legacy';

  try {
    const body = await readJsonCapped<Record<string, unknown>>(request, 64_000);
    const legacy = Array.isArray(body.messages);
    const userContent = legacy ? extractLegacyUserContent(body) : staffingUserContent(validateStaffingInput(body.input));
    if (!userContent) throw new AiError(400, 'bad_request', '인력배치 입력이 없습니다.');
    if (!legacy) {
      userName = cleanUserName(body.userName);
      ref = typeof body.projectId === 'number' || typeof body.projectId === 'string' ? String(body.projectId) : 'unknown';
    }

    const settings = await loadSettings(env.AI_DB);
    if (!settings.staffing.enabled) throw new AiError(503, 'feature_disabled', '관리자가 AI 인력배치를 일시 중지했습니다.');
    spec = getModel(settings.staffing.model) ?? (getModel(DEFAULT_SETTINGS.staffing.model) as ModelSpec);
    effort = resolveEffort(spec, settings.staffing.effort);

    const method: StaffingMethod = spec.structuredOutputs ? 'structured' : 'tool';
    const thinkingOn = spec.thinking === 'on';
    const { params, betas } = buildModelParams(spec, { feature: 'staffing', effort: settings.staffing.effort });
    const outputConfig = {
      ...((params.output_config as Record<string, unknown> | undefined) ?? {}),
      ...(method === 'structured' ? { format: { type: 'json_schema', schema: STAFFING_JSON_SCHEMA } } : {}),
    };

    const client = createClient(env, { timeoutMs: SDK_TIMEOUT_MS, maxRetries: 1 });
    const msg = await client.beta.messages.create({
      model: spec.id,
      max_tokens: thinkingOn ? 16_000 : 4_096,
      // 큐가 최대 3건을 동시에 보내므로 고정된 system 을 캐시한다
      system: [{ type: 'text', text: staffingSystem(method), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userContent }],
      ...params,
      ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
      ...(method === 'tool' ? { tools: [STAFFING_TOOL], tool_choice: { type: 'tool', name: STAFFING_TOOL.name } } : {}),
      ...(spec.sampling && !thinkingOn ? { temperature: 0.3 } : {}),
      ...(betas.length ? { betas } : {}),
    } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);

    const usage = normalizeUsage(msg.usage);
    const servedModel = normalizeModelId(msg.model);
    const cost = costMicros(servedModel, usage);
    const log = (status: UsageStatus, errorCode: string | null = null) =>
      env.AI_DB
        ? context.waitUntil(
            insertUsage(env.AI_DB, {
              ym: kstMonth(),
              feature: 'staffing',
              model: servedModel,
              requestedModel: spec?.id,
              effort: effort ?? null,
              status,
              errorCode,
              usage,
              costMicros: cost,
              durationMs: Date.now() - started,
              userName,
              ref,
              at: nowIso(),
            }).catch(() => {}),
          )
        : undefined;

    if (msg.stop_reason === 'refusal') {
      log('refusal', 'refusal');
      throw new AiError(422, 'refusal', 'AI가 안전 정책상 답하지 않았습니다.');
    }
    if (msg.stop_reason === 'max_tokens') {
      log('max_tokens', 'max_tokens');
      throw new AiError(502, 'max_tokens', 'AI 응답이 너무 길어 중단되었습니다. 다시 시도해주세요.', { retryable: true });
    }

    let raw: unknown = null;
    if (method === 'structured') {
      try {
        raw = JSON.parse(visibleText(msg.content));
      } catch {
        raw = null;
      }
    } else {
      const toolUse = msg.content.find((b) => b.type === 'tool_use' && b.name === STAFFING_TOOL.name);
      raw = toolUse && toolUse.type === 'tool_use' ? toolUse.input : null;
    }
    const data = normalizeSuggestion(raw);
    if (!data) {
      log('invalid_output', 'invalid_output');
      throw new AiError(502, 'invalid_output', 'AI 응답 형식 오류 — 다시 시도해주세요.', { retryable: true });
    }
    log('ok');

    if (legacy) {
      // 이전 클라이언트는 content 에서 submit_staffing tool_use 블록을 찾는다
      return jsonFor(request, env, {
        id: msg.id,
        type: 'message',
        role: 'assistant',
        model: servedModel,
        stop_reason: 'tool_use',
        usage: msg.usage,
        content: [{ type: 'tool_use', id: 'toolu_legacy', name: STAFFING_TOOL.name, input: data }],
      });
    }
    return jsonFor(request, env, {
      ok: true,
      data,
      model: servedModel,
      effort: effort ?? null,
      method,
      usage,
      costUsd: cost / 1e6,
      stopReason: msg.stop_reason,
    });
  } catch (err) {
    const e = mapError(err);
    if (!(err instanceof AiError) && env.AI_DB && spec) {
      context.waitUntil(
        insertUsage(env.AI_DB, {
          ym: kstMonth(),
          feature: 'staffing',
          model: spec.id,
          requestedModel: spec.id,
          effort: effort ?? null,
          status: e.code === 'aborted' ? 'aborted' : 'error',
          errorCode: e.code,
          usage: normalizeUsage(null),
          costMicros: 0,
          durationMs: Date.now() - started,
          userName,
          ref,
          at: nowIso(),
        }).catch(() => {}),
      );
    }
    return errorResponse(request, env, e);
  }
};

export const onRequestOptions: PagesFunction<AiEnv> = async ({ request, env }) => optionsResponse(request, env, 'POST, OPTIONS');
