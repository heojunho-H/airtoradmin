// D1(AI_DB) 접근 — AI 설정·대화·메시지·사용량·감사 로그의 SQL 전부.
// 스키마: d1/migrations/0001_ai_init.sql. 모든 값은 bind 파라미터로만 넣는다.

import {
  DEFAULT_SETTINGS,
  FEATURES,
  getModel,
  isEffort,
  isSelectableFor,
  type Effort,
  type Feature,
  type FeatureSettings,
  type NormalizedUsage,
} from './ai-models';

export type DbState = 'ok' | 'unbound' | 'no_tables';

export async function dbState(db?: D1Database): Promise<DbState> {
  if (!db) return 'unbound';
  try {
    await db.prepare('SELECT 1 FROM ai_settings LIMIT 1').all();
    return 'ok';
  } catch {
    return 'no_tables';
  }
}

// ─── 설정 ───────────────────────────────────────────────────────────────

export type SettingsView = Record<
  Feature,
  FeatureSettings & { source: 'default' | 'db'; updatedBy?: string | null; updatedAt?: string | null }
>;

interface SettingsRow {
  feature: string;
  model: string;
  effort: string | null;
  enabled: number;
  allow_override: number;
  override_models: string;
  updated_by: string | null;
  updated_at: string;
}

function cloneDefaults(): SettingsView {
  const out = {} as SettingsView;
  for (const f of FEATURES) {
    const d = DEFAULT_SETTINGS[f];
    out[f] = { ...d, overrideModels: d.overrideModels ? [...d.overrideModels] : undefined, source: 'default' };
  }
  return out;
}

function parseModelList(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && isSelectableFor(x, 'chat')) : [];
  } catch {
    return [];
  }
}

/** D1 장애·미설정이면 코드 기본값을 돌려준다 (인력배치 큐가 D1에 의존하지 않도록). */
export async function loadSettings(db?: D1Database): Promise<SettingsView> {
  const view = cloneDefaults();
  if (!db) return view;
  let rows: SettingsRow[] = [];
  try {
    rows = (await db.prepare('SELECT * FROM ai_settings').all<SettingsRow>()).results;
  } catch {
    return view;
  }
  for (const row of rows) {
    const f = row.feature as Feature;
    if (!FEATURES.includes(f)) continue;
    const model = isSelectableFor(row.model, f) ? row.model : view[f].model;
    view[f] = {
      model,
      effort: isEffort(row.effort) ? row.effort : null,
      enabled: row.enabled !== 0,
      source: 'db',
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
      ...(f === 'chat'
        ? {
            allowOverride: row.allow_override !== 0,
            overrideModels: (() => {
              const list = parseModelList(row.override_models);
              return list.length ? list : [...(DEFAULT_SETTINGS.chat.overrideModels ?? [])];
            })(),
          }
        : {}),
    };
  }
  return view;
}

export async function saveSettings(
  db: D1Database,
  next: Record<Feature, FeatureSettings>,
  actor: string,
  at: string,
): Promise<void> {
  const stmts = FEATURES.map((f) => {
    const s = next[f];
    return db
      .prepare(
        `INSERT INTO ai_settings (feature, model, effort, enabled, allow_override, override_models, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(feature) DO UPDATE SET
           model = excluded.model, effort = excluded.effort, enabled = excluded.enabled,
           allow_override = excluded.allow_override, override_models = excluded.override_models,
           updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      )
      .bind(
        f,
        s.model,
        s.effort,
        s.enabled ? 1 : 0,
        s.allowOverride === false ? 0 : 1,
        JSON.stringify(s.overrideModels ?? []),
        actor,
        at,
      );
  });
  await db.batch(stmts);
}

// ─── 대화 ───────────────────────────────────────────────────────────────

export interface ConversationRow {
  id: string;
  persona: string;
  title: string;
  model_override: string | null;
  last_model: string | null;
  system_json: string;
  snapshot_chars: number;
  snapshot_at: string;
  message_count: number;
  context_tokens: number;
  total_cost_micros: number;
  created_by: string;
  created_at: string;
  last_message_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export async function getConversation(db: D1Database, id: string): Promise<ConversationRow | null> {
  return db.prepare('SELECT * FROM ai_conversations WHERE id = ? AND deleted_at IS NULL').bind(id).first<ConversationRow>();
}

export interface ReplayMessage {
  role: 'user' | 'assistant';
  content: unknown[];
}

/** Anthropic messages[] 를 저장된 원본 그대로 재구성 (append-only 재전송) */
export async function loadReplay(db: D1Database, id: string): Promise<ReplayMessage[]> {
  const { results } = await db
    .prepare('SELECT role, content_json FROM ai_messages WHERE conversation_id = ? ORDER BY seq')
    .bind(id)
    .all<{ role: 'user' | 'assistant'; content_json: string }>();
  return results.map((r) => ({ role: r.role, content: JSON.parse(r.content_json) as unknown[] }));
}

export interface DisplayMessage {
  seq: number;
  role: 'user' | 'assistant';
  text: string;
  userName: string | null;
  model: string | null;
  stopReason: string | null;
  costUsd: number | null;
  hasSnapshot: boolean;
  createdAt: string;
}

export async function loadDisplayMessages(db: D1Database, id: string): Promise<DisplayMessage[]> {
  const { results } = await db
    .prepare(
      `SELECT seq, role, display_text, user_name, model, stop_reason, cost_micros, has_snapshot, created_at
       FROM ai_messages WHERE conversation_id = ? ORDER BY seq`,
    )
    .bind(id)
    .all<{
      seq: number;
      role: 'user' | 'assistant';
      display_text: string;
      user_name: string | null;
      model: string | null;
      stop_reason: string | null;
      cost_micros: number | null;
      has_snapshot: number;
      created_at: string;
    }>();
  return results.map((r) => ({
    seq: r.seq,
    role: r.role,
    text: r.display_text,
    userName: r.user_name,
    model: r.model,
    stopReason: r.stop_reason,
    costUsd: r.cost_micros == null ? null : r.cost_micros / 1e6,
    hasSnapshot: r.has_snapshot === 1,
    createdAt: r.created_at,
  }));
}

export interface ConversationListItem {
  id: string;
  persona: string;
  title: string;
  createdBy: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  modelOverride: string | null;
  lastModel: string | null;
  costUsd: number;
}

/** 최근 대화순 키셋 페이지네이션 — cursor = "<last_message_at>|<id>" */
export async function listConversations(
  db: D1Database,
  q: { limit: number; cursor?: string | null; persona?: string | null; author?: string | null; q?: string | null },
): Promise<{ items: ConversationListItem[]; nextCursor: string | null }> {
  const where = ['deleted_at IS NULL'];
  const binds: unknown[] = [];
  if (q.persona) {
    where.push('persona = ?');
    binds.push(q.persona);
  }
  if (q.author) {
    where.push('created_by = ?');
    binds.push(q.author);
  }
  if (q.q) {
    where.push("title LIKE ? ESCAPE '\\'");
    binds.push(`%${q.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  }
  if (q.cursor) {
    const sep = q.cursor.lastIndexOf('|');
    if (sep > 0) {
      const at = q.cursor.slice(0, sep);
      const id = q.cursor.slice(sep + 1);
      where.push('(last_message_at < ? OR (last_message_at = ? AND id < ?))');
      binds.push(at, at, id);
    }
  }
  binds.push(q.limit + 1);
  const { results } = await db
    .prepare(
      `SELECT id, persona, title, created_by, created_at, last_message_at, message_count, model_override, last_model, total_cost_micros
       FROM ai_conversations WHERE ${where.join(' AND ')}
       ORDER BY last_message_at DESC, id DESC LIMIT ?`,
    )
    .bind(...binds)
    .all<{
      id: string;
      persona: string;
      title: string;
      created_by: string;
      created_at: string;
      last_message_at: string;
      message_count: number;
      model_override: string | null;
      last_model: string | null;
      total_cost_micros: number;
    }>();
  const page = results.slice(0, q.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({
      id: r.id,
      persona: r.persona,
      title: r.title,
      createdBy: r.created_by,
      createdAt: r.created_at,
      lastMessageAt: r.last_message_at,
      messageCount: r.message_count,
      modelOverride: r.model_override,
      lastModel: r.last_model,
      costUsd: r.total_cost_micros / 1e6,
    })),
    nextCursor: results.length > q.limit && last ? `${last.last_message_at}|${last.id}` : null,
  };
}

export async function renameConversation(db: D1Database, id: string, title: string, at: string): Promise<void> {
  await db.prepare('UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').bind(title, at, id).run();
}

export async function softDeleteConversation(db: D1Database, id: string, actor: string, at: string): Promise<void> {
  await db
    .prepare('UPDATE ai_conversations SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .bind(at, actor, at, id)
    .run();
}

// ─── 한 턴 저장 (원자 batch) ─────────────────────────────────────────────

export interface TurnRecord {
  conversationId: string;
  /** 새 대화면 INSERT 할 값 */
  create?: { persona: string; title: string; systemJson: string; snapshotChars: number; snapshotAt: string; createdBy: string };
  /** 사용자 메시지의 seq (= 저장 전 message_count) */
  seq: number;
  /** undefined = 유지, null = 해제, 문자열 = 지정 */
  modelOverride: string | null | undefined;
  snapshotRefresh?: { chars: number; at: string };
  requestedModel: string;
  servedModel: string;
  effort: Effort | null;
  user: { contentJson: string; displayText: string; userName: string; hasSnapshot: boolean };
  assistant: { contentJson: string; displayText: string; stopReason: string | null; anthropicId: string | null };
  usage: NormalizedUsage;
  costMicros: number;
  contextTokens: number;
  durationMs: number;
  at: string;
  ym: string;
}

/**
 * 대화 행 갱신 + 사용자/어시스턴트 메시지 + 사용량을 하나의 batch(트랜잭션)로.
 * 같은 대화에 두 사람이 동시에 보내면 UNIQUE(conversation_id, seq) 위반으로 뒤쪽 batch 가 통째로 실패한다.
 */
export function turnStatements(db: D1Database, t: TurnRecord): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  if (t.create) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO ai_conversations
             (id, persona, title, model_override, last_model, system_json, snapshot_chars, snapshot_at,
              message_count, context_tokens, total_cost_micros, created_by, created_at, last_message_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 2, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          t.conversationId,
          t.create.persona,
          t.create.title,
          t.modelOverride ?? null,
          t.servedModel,
          t.create.systemJson,
          t.create.snapshotChars,
          t.create.snapshotAt,
          t.contextTokens,
          t.costMicros,
          t.create.createdBy,
          t.at,
          t.at,
          t.at,
        ),
    );
  } else {
    stmts.push(
      db
        .prepare(
          `UPDATE ai_conversations SET
             message_count = message_count + 2,
             last_model = ?,
             model_override = CASE WHEN ? = 1 THEN ? ELSE model_override END,
             context_tokens = ?,
             total_cost_micros = total_cost_micros + ?,
             snapshot_chars = COALESCE(?, snapshot_chars),
             snapshot_at = COALESCE(?, snapshot_at),
             last_message_at = ?, updated_at = ?
           WHERE id = ? AND message_count = ? AND deleted_at IS NULL`,
        )
        .bind(
          t.servedModel,
          t.modelOverride === undefined ? 0 : 1,
          t.modelOverride ?? null,
          t.contextTokens,
          t.costMicros,
          t.snapshotRefresh?.chars ?? null,
          t.snapshotRefresh?.at ?? null,
          t.at,
          t.at,
          t.conversationId,
          t.seq,
        ),
    );
  }
  const insertMessage = db.prepare(
    `INSERT INTO ai_messages
       (conversation_id, seq, role, content_json, display_text, user_name, has_snapshot, model, requested_model,
        effort, stop_reason, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_micros, anthropic_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  stmts.push(
    insertMessage.bind(
      t.conversationId, t.seq, 'user', t.user.contentJson, t.user.displayText, t.user.userName,
      t.user.hasSnapshot ? 1 : 0, null, null, null, null, null, null, null, null, null, null, t.at,
    ),
    insertMessage.bind(
      t.conversationId, t.seq + 1, 'assistant', t.assistant.contentJson, t.assistant.displayText, null, 0,
      t.servedModel, t.requestedModel, t.effort, t.assistant.stopReason, t.usage.inputTokens, t.usage.outputTokens,
      t.usage.cacheReadTokens, t.usage.cacheWriteTokens, t.costMicros, t.assistant.anthropicId, t.at,
    ),
  );
  stmts.push(
    usageStatement(db, {
      ym: t.ym,
      feature: 'chat',
      model: t.servedModel,
      requestedModel: t.requestedModel,
      effort: t.effort,
      status: t.assistant.stopReason === 'max_tokens' ? 'max_tokens' : 'ok',
      usage: t.usage,
      costMicros: t.costMicros,
      durationMs: t.durationMs,
      userName: t.user.userName,
      conversationId: t.conversationId,
      at: t.at,
    }),
  );
  return stmts;
}

// ─── 사용량 ─────────────────────────────────────────────────────────────

export type UsageStatus = 'ok' | 'max_tokens' | 'refusal' | 'error' | 'aborted' | 'invalid_output';

export interface UsageRecord {
  ym: string;
  feature: Feature;
  model: string;
  requestedModel?: string | null;
  effort?: Effort | null;
  status: UsageStatus;
  errorCode?: string | null;
  usage: NormalizedUsage;
  costMicros: number;
  durationMs?: number | null;
  userName?: string | null;
  conversationId?: string | null;
  ref?: string | null;
  at: string;
}

function usageStatement(db: D1Database, u: UsageRecord): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO ai_usage
         (ym, feature, model, requested_model, effort, status, error_code, input_tokens, output_tokens,
          cache_read_tokens, cache_write_tokens, web_searches, cost_micros, duration_ms, user_name, conversation_id, ref, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      u.ym, u.feature, u.model, u.requestedModel ?? null, u.effort ?? null, u.status, u.errorCode ?? null,
      u.usage.inputTokens, u.usage.outputTokens, u.usage.cacheReadTokens, u.usage.cacheWriteTokens,
      u.usage.webSearches, u.costMicros, u.durationMs ?? null, u.userName ?? null, u.conversationId ?? null,
      u.ref ?? null, u.at,
    );
}

export async function insertUsage(db: D1Database, u: UsageRecord): Promise<void> {
  await usageStatement(db, u).run();
}

interface AggRow {
  calls: number;
  errors: number;
  cost_micros: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  web_searches: number;
}

const AGG_SELECT = `COUNT(*) AS calls,
  SUM(CASE WHEN status IN ('ok', 'max_tokens') THEN 0 ELSE 1 END) AS errors,
  COALESCE(SUM(cost_micros), 0) AS cost_micros,
  COALESCE(SUM(input_tokens), 0) AS input_tokens,
  COALESCE(SUM(output_tokens), 0) AS output_tokens,
  COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
  COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
  COALESCE(SUM(web_searches), 0) AS web_searches`;

function agg(r: AggRow | null | undefined) {
  return {
    calls: r?.calls ?? 0,
    errors: r?.errors ?? 0,
    costUsd: (r?.cost_micros ?? 0) / 1e6,
    inputTokens: r?.input_tokens ?? 0,
    outputTokens: r?.output_tokens ?? 0,
    cacheReadTokens: r?.cache_read_tokens ?? 0,
    cacheWriteTokens: r?.cache_write_tokens ?? 0,
    webSearches: r?.web_searches ?? 0,
  };
}

export async function usageReport(db: D1Database, ym: string) {
  const [totals, byFeatureModel, byUser, daily] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT ${AGG_SELECT} FROM ai_usage WHERE ym = ?`).bind(ym),
    db
      .prepare(`SELECT feature, model, ${AGG_SELECT} FROM ai_usage WHERE ym = ? GROUP BY feature, model ORDER BY cost_micros DESC`)
      .bind(ym),
    db
      .prepare(
        `SELECT COALESCE(user_name, '자동') AS user_name, COUNT(*) AS calls, COALESCE(SUM(cost_micros), 0) AS cost_micros
         FROM ai_usage WHERE ym = ? GROUP BY user_name ORDER BY cost_micros DESC LIMIT 30`,
      )
      .bind(ym),
    db
      .prepare(
        `SELECT date(created_at, '+9 hours') AS day, COUNT(*) AS calls, COALESCE(SUM(cost_micros), 0) AS cost_micros
         FROM ai_usage WHERE ym = ? GROUP BY day ORDER BY day`,
      )
      .bind(ym),
  ]);
  return {
    month: ym,
    estimate: true,
    totals: agg(totals.results[0] as unknown as AggRow),
    byFeatureModel: (byFeatureModel.results as unknown as Array<AggRow & { feature: string; model: string }>).map((r) => ({
      feature: r.feature,
      model: r.model,
      label: getModel(r.model)?.label ?? r.model,
      ...agg(r),
    })),
    byUser: (byUser.results as unknown as Array<{ user_name: string; calls: number; cost_micros: number }>).map((r) => ({
      userName: r.user_name,
      calls: r.calls,
      costUsd: r.cost_micros / 1e6,
    })),
    daily: (daily.results as unknown as Array<{ day: string; calls: number; cost_micros: number }>).map((r) => ({
      date: r.day,
      calls: r.calls,
      costUsd: r.cost_micros / 1e6,
    })),
  };
}

// ─── 감사 로그 ──────────────────────────────────────────────────────────

export async function audit(
  db: D1Database,
  action: 'settings_update' | 'conversation_delete' | 'pin_fail' | 'pin_attempt',
  actor: string | null,
  detail: unknown,
  ipHashValue: string | null,
  at: string,
): Promise<void> {
  await db
    .prepare('INSERT INTO ai_audit (action, actor, ip_hash, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(action, actor, ipHashValue, detail == null ? null : JSON.stringify(detail).slice(0, 4000), at)
    .run();
}

/**
 * PIN 시도를 기록하고, 같은 batch(=트랜잭션) 안에서 최근 시도 횟수를 센다.
 * D1 batch 는 하나씩 직렬 실행되므로 동시에 몰려와도 N번째 요청은 정확히 N을 본다.
 */
export async function recordPinAttempt(
  db: D1Database,
  ipHashValue: string,
  actor: string,
  at: string,
  sinceIso: string,
): Promise<number> {
  const [, counted] = await db.batch<{ n: number }>([
    db
      .prepare('INSERT INTO ai_audit (action, actor, ip_hash, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind('pin_attempt', actor, ipHashValue, null, at),
    db
      .prepare('SELECT COUNT(*) AS n FROM ai_audit WHERE action = ? AND ip_hash = ? AND created_at >= ?')
      .bind('pin_attempt', ipHashValue, sinceIso),
  ]);
  return counted.results[0]?.n ?? 0;
}
