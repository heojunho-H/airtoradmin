// AI 기업정보 — Claude 웹 검색(server tool)으로 기업을 조사해 본문 + 출처를 돌려준다.
// Gemini 2.5 Flash + Google Search grounding 을 대체한다.
//
// 웹 검색 + pause_turn 이어가기까지 20~90초 걸릴 수 있어 SSE 로 진행 상태를 보낸다.
//   meta → status{searching(query)|writing|continuing} → text(임시) → done{text(확정), sources, sourcesCited, ...}
// done.text 가 화면 본문을 대체한다(검색 전 서두 문장 제외). stream:false 면 JSON 한 번에.

import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { collectSources, createClient, finalAnswerText, mapError, normalizeUsage } from './ai-client';
import { AiError, cleanUserName, jsonFor, kstMonth, nowIso, openSse, type AiEnv, type SseChannel } from './ai-http';
import {
  DEFAULT_SETTINGS,
  addUsage,
  buildModelParams,
  costMicros,
  emptyUsage,
  getModel,
  normalizeModelId,
  resolveEffort,
  type ModelSpec,
} from './ai-models';
import { COMPANY_INFO_SYSTEM, companyInfoUserMessage } from './ai-prompts';
import { insertUsage, loadSettings } from './ai-store';

type BetaContentBlock = Anthropic.Beta.BetaContentBlock;

const MAX_COMPANY_CHARS = 100;
const MAX_CONTINUATIONS = 3;

interface CompanyResult {
  text: string;
  sources: { url: string; title: string }[];
  /** true = 답변이 직접 인용한 출처, false = 인용이 없어 회사명이 들어간 검색 결과로 대체 */
  sourcesCited: boolean;
  model: string;
  usage: ReturnType<typeof emptyUsage>;
  costUsd: number;
  stopReason: string | null;
}

export async function handleCompanyInfo(
  env: AiEnv,
  request: Request,
  waitUntil: (p: Promise<unknown>) => void,
  body: Record<string, unknown>,
): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AiError(503, 'not_configured', 'AI API 키가 설정되지 않았습니다(관리자 확인 필요).');
  }
  const company = typeof body.company === 'string' ? body.company.trim() : '';
  if (!company) throw new AiError(400, 'bad_request', '기업명이 없습니다.');
  if (company.length > MAX_COMPANY_CHARS) throw new AiError(413, 'too_large', '기업명이 너무 깁니다.');

  const settings = await loadSettings(env.AI_DB);
  const conf = settings.company_info;
  if (!conf.enabled) throw new AiError(503, 'feature_disabled', '관리자가 AI 기업정보를 일시 중지했습니다.');
  const spec = getModel(conf.model) ?? (getModel(DEFAULT_SETTINGS.company_info.model) as ModelSpec);
  const userName = cleanUserName(body.userName);

  if (body.stream === false) {
    let result: CompanyResult;
    try {
      result = await research(env, spec, conf.effort, company, null);
    } catch (err) {
      throw mapError(err);
    }
    const status =
      result.stopReason === 'refusal'
        ? 'refusal'
        : !result.text.trim()
          ? 'invalid_output'
          : result.stopReason === 'max_tokens'
            ? 'max_tokens'
            : 'ok';
    waitUntil(logUsage(env, spec, conf.effort, userName, company, result, status));
    if (status === 'refusal') throw new AiError(422, 'refusal', '안전 정책에 따라 AI가 조사하지 않았습니다.');
    if (status === 'invalid_output') throw new AiError(502, 'invalid_output', '조사 결과를 만들지 못했습니다. 다시 시도해 주세요.', { retryable: true });
    return jsonFor(request, env, { ok: true, ...result });
  }

  const sse = openSse(request, env);
  waitUntil(
    (async () => {
      const started = Date.now();
      try {
        const result = await research(env, spec, conf.effort, company, sse);
        if (result.stopReason === 'refusal') {
          sse.send('error', { code: 'refusal', message: '안전 정책에 따라 AI가 조사하지 않았습니다.', retryable: false });
          await logUsage(env, spec, conf.effort, userName, company, result, 'refusal', Date.now() - started);
          return;
        }
        if (!result.text.trim()) {
          sse.send('error', { code: 'invalid_output', message: '조사 결과를 만들지 못했습니다. 다시 시도해 주세요.', retryable: true });
          await logUsage(env, spec, conf.effort, userName, company, result, 'invalid_output', Date.now() - started);
          return;
        }
        sse.send('done', result);
        await logUsage(env, spec, conf.effort, userName, company, result, result.stopReason === 'max_tokens' ? 'max_tokens' : 'ok', Date.now() - started);
      } catch (err) {
        const e = mapError(err);
        if (!sse.closed) sse.send('error', { code: e.code, message: e.message, retryable: e.retryable });
      } finally {
        await sse.close();
      }
    })(),
  );
  return sse.response;
}

async function research(
  env: AiEnv,
  spec: ModelSpec,
  effortSetting: ReturnType<typeof resolveEffort> | null,
  company: string,
  sse: SseChannel | null,
): Promise<CompanyResult> {
  const client = createClient(env, { maxRetries: 1 });
  const { params, betas } = buildModelParams(spec, { feature: 'company_info', effort: effortSetting });
  const tools = [
    {
      type: spec.webSearchTool,
      name: 'web_search',
      max_uses: 5,
      user_location: { type: 'approximate', country: 'KR', timezone: 'Asia/Seoul' },
    },
  ];
  const messages: unknown[] = [{ role: 'user', content: companyInfoUserMessage(company) }];
  const contents: BetaContentBlock[][] = [];
  let usage = emptyUsage();
  let last: Anthropic.Beta.BetaMessage | null = null;

  sse?.send('meta', { model: spec.id, effort: resolveEffort(spec, effortSetting) ?? null });

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const stream = client.beta.messages.stream({
      model: spec.id,
      max_tokens: Math.min(32_000, spec.maxOutput),
      system: COMPANY_INFO_SYSTEM,
      messages,
      tools,
      ...params,
      ...(betas.length ? { betas } : {}),
    } as unknown as BetaMessageStreamParams);

    const watch = setInterval(() => {
      if (sse?.closed) stream.abort();
    }, 1000);
    if (sse) {
      stream.on('streamEvent', (event) => {
        if (event.type !== 'content_block_start') return;
        if (event.content_block.type === 'server_tool_use') sse.send('status', { phase: 'searching' });
        else if (event.content_block.type === 'text') sse.send('status', { phase: 'writing' });
      });
      stream.on('contentBlock', (block) => {
        if (block.type !== 'server_tool_use') return;
        const query = (block.input as { query?: unknown } | null)?.query;
        if (typeof query === 'string') sse.send('status', { phase: 'searching', query: query.slice(0, 100) });
      });
      stream.on('text', (delta) => sse.text(delta));
    }

    try {
      last = await stream.finalMessage();
    } finally {
      clearInterval(watch);
    }
    usage = addUsage(usage, normalizeUsage(last.usage));
    contents.push(last.content);
    if (last.stop_reason !== 'pause_turn') break;
    // 서버 도구 반복 한도 — 받은 어시스턴트 블록을 그대로 붙여 다시 보내면 이어서 진행한다
    messages.push({ role: 'assistant', content: last.content });
    sse?.send('status', { phase: 'continuing' });
  }

  const servedModel = last ? normalizeModelId(last.model) : spec.id;
  const cost = costMicros(servedModel, usage);
  const sources = collectSources(contents, { mustInclude: company });
  return {
    text: last ? finalAnswerText(last.content).trim() : '',
    sources: sources.items,
    sourcesCited: sources.cited,
    model: servedModel,
    usage,
    costUsd: cost / 1e6,
    stopReason: last?.stop_reason ?? null,
  };
}

async function logUsage(
  env: AiEnv,
  spec: ModelSpec,
  effort: ReturnType<typeof resolveEffort> | null,
  userName: string,
  company: string,
  result: CompanyResult,
  status: 'ok' | 'refusal' | 'max_tokens' | 'invalid_output',
  durationMs?: number,
): Promise<void> {
  if (!env.AI_DB) return;
  await insertUsage(env.AI_DB, {
    ym: kstMonth(),
    feature: 'company_info',
    model: result.model,
    requestedModel: spec.id,
    effort: resolveEffort(spec, effort) ?? null,
    status,
    errorCode: status === 'ok' ? null : status,
    usage: result.usage,
    costMicros: Math.round(result.costUsd * 1e6),
    durationMs: durationMs ?? null,
    userName,
    ref: company.slice(0, 100),
    at: nowIso(),
  }).catch(() => {});
}
