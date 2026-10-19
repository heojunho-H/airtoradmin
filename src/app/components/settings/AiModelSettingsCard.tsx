// 설정 > AI 모델 — 기능별 기본 모델·추론 강도·사용 여부, 어시스턴트의 대화별 모델 변경 허용.
// 저장은 관리자 PIN(Cloudflare 환경변수 AI_ADMIN_PIN)으로 서버에서 확인한다.

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, Building2, Users2 } from 'lucide-react';
import { saveSettings, toAiRequestError } from '../../../lib/ai/api';
import { EFFORT_LABELS, FEATURE_LABELS } from '../../../lib/ai/format';
import type { AiConfig, AiFeature, AiModel, AiSettings, Effort, FeatureSettings } from '../../../lib/ai/types';
import { useAiConfig } from '../ai/useAiConfig';
import { PinPromptModal } from './PinPromptModal';

const FEATURE_ORDER: AiFeature[] = ['chat', 'company_info', 'staffing'];
const FEATURE_META: Record<AiFeature, { icon: typeof Bot; help: string }> = {
  chat: { icon: Bot, help: 'AI 어시스턴트 페이지의 기본 모델입니다. 일상 분석은 보통 이하의 추론 강도로 충분합니다.' },
  company_info: { icon: Building2, help: '영업·고객 상세의 "AI 기업정보"(웹 검색)에 쓰입니다. 검색을 기다리므로 낮음~보통을 권장합니다.' },
  staffing: { icon: Users2, help: '프로젝트 관리의 AI 인력배치 자동 추천에 쓰입니다. 한 건당 90초 제한이 있어 너무 높은 추론 강도는 실패할 수 있습니다.' },
};

type Draft = Record<AiFeature, FeatureSettings>;

function toDraft(settings: AiSettings): Draft {
  const out = {} as Draft;
  for (const f of FEATURE_ORDER) {
    const s = settings[f];
    out[f] = { model: s.model, effort: s.effort, enabled: s.enabled, allowOverride: s.allowOverride, overrideModels: s.overrideModels ? [...s.overrideModels] : undefined };
  }
  return out;
}

function sameDraft(a: Draft, b: Draft) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-purple-600' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

export function AiModelSettingsCard({ userName, onNotification }: { userName: string; onNotification?: (msg: string) => void }) {
  const { config, error, loading, reload } = useAiConfig();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const base = useMemo(() => (config ? toDraft(config.settings) : null), [config]);
  useEffect(() => {
    if (base) setDraft(base);
  }, [base]);

  if (loading && !config) return <Card><p className="text-[13px] text-slate-400">AI 설정을 불러오는 중…</p></Card>;
  if (!config || !draft || !base) {
    return (
      <Card>
        <p className="text-[13px] text-red-600">AI 설정을 불러오지 못했습니다{error ? `: ${error}` : ''}</p>
        <button onClick={reload} className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] hover:bg-slate-50">
          다시 시도
        </button>
      </Card>
    );
  }

  const dirty = !sameDraft(draft, base);
  const update = (f: AiFeature, changes: Partial<FeatureSettings>) => setDraft((d) => (d ? { ...d, [f]: { ...d[f], ...changes } } : d));

  const save = async (pin: string) => {
    setSaving(true);
    setPinError(null);
    setSaveError(null);
    try {
      await saveSettings(pin, userName, draft);
      setPinOpen(false);
      onNotification?.('AI 모델 설정이 변경되었습니다');
      await reload();
    } catch (err) {
      const e = toAiRequestError(err);
      if (e.code === 'bad_pin' || e.code === 'pin_locked') setPinError(e.message);
      else {
        setPinOpen(false);
        setSaveError(e.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-slate-900">AI 모델 설정</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">기능별 기본 Claude 모델과 추론 강도를 정합니다. 가격은 100만 토큰당 입력/출력(USD)입니다.</p>
        </div>
        {!config.pinConfigured && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            관리자 PIN이 설정되지 않아 읽기 전용입니다 (Cloudflare 환경변수 <code>AI_ADMIN_PIN</code>)
          </p>
        )}
      </div>

      <div className="mt-5 divide-y divide-slate-100">
        {FEATURE_ORDER.map((f) => (
          <FeatureRow key={f} feature={f} config={config} value={draft[f]} onChange={(c) => update(f, c)} readOnly={!config.pinConfigured} />
        ))}
      </div>

      {saveError && <p className="mt-3 text-[13px] text-red-600">{saveError}</p>}
      {config.pinConfigured && (
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => setDraft(base)}
            disabled={!dirty || saving}
            className="rounded-xl px-4 py-2.5 text-[14px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            되돌리기
          </button>
          <button
            onClick={() => {
              setPinError(null);
              setPinOpen(true);
            }}
            disabled={!dirty || saving}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
          >
            변경사항 저장
          </button>
        </div>
      )}

      <PinPromptModal
        open={pinOpen}
        title="관리자 확인"
        description="AI 모델 설정을 바꾸려면 관리자 PIN을 입력하세요. 변경 내역은 기록됩니다."
        submitting={saving}
        error={pinError}
        onSubmit={save}
        onClose={() => setPinOpen(false)}
      />
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">{children}</div>;
}

function FeatureRow({
  feature,
  config,
  value,
  onChange,
  readOnly,
}: {
  feature: AiFeature;
  config: AiConfig;
  value: FeatureSettings;
  onChange: (c: Partial<FeatureSettings>) => void;
  readOnly: boolean;
}) {
  const Icon = FEATURE_META[feature].icon;
  const models = config.models.filter((m) => m.features.includes(feature));
  const model: AiModel | undefined = config.models.find((m) => m.id === value.model);
  const effortLevels = model?.effortLevels ?? [];
  const server = config.settings[feature];
  const risky = feature === 'staffing' && (value.effort === 'xhigh' || value.effort === 'max' || value.model === 'claude-fable-5-1');

  const changeModel = (id: string) => {
    const next = config.models.find((m) => m.id === id);
    const levels = next?.effortLevels ?? [];
    // 새 모델이 지원하지 않는 추론 강도는 초기화
    const effort: Effort | null = value.effort && levels.includes(value.effort) ? value.effort : levels.includes('medium') ? 'medium' : null;
    const changes: Partial<FeatureSettings> = { model: id, effort };
    if (feature === 'chat') {
      const list = value.overrideModels ?? [];
      if (!list.includes(id)) changes.overrideModels = [id, ...list];
    }
    onChange(changes);
  };

  return (
    <div className="grid gap-4 py-5 md:grid-cols-[220px_1fr]">
      <div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50">
            <Icon className="h-4 w-4 text-purple-600" />
          </span>
          <span className="text-[15px] font-semibold text-slate-800">{FEATURE_LABELS[feature]}</span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-500">{FEATURE_META[feature].help}</p>
        {server.updatedBy && (
          <p className="mt-1 text-[11px] text-slate-400">
            최근 변경: {server.updatedBy}
            {server.updatedAt ? ` · ${server.updatedAt.slice(0, 10)}` : ''}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[12px] font-medium text-slate-600">모델</span>
            <select
              value={value.model}
              disabled={readOnly}
              onChange={(e) => changeModel(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
            >
              {!model && <option value={value.model}>{value.model} (목록에 없음)</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — ${m.price.input} / ${m.price.output}
                  {m.badge ? ` · ${m.badge}` : ''}
                  {m.legacy ? ' · 레거시' : ''}
                </option>
              ))}
            </select>
          </label>
          {effortLevels.length > 0 && (
            <label className="flex w-40 flex-col gap-1">
              <span className="text-[12px] font-medium text-slate-600">추론 강도</span>
              <select
                value={value.effort ?? ''}
                disabled={readOnly}
                onChange={(e) => onChange({ effort: (e.target.value || null) as Effort | null })}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
              >
                <option value="">모델 기본값{model?.defaultEffort ? ` (${EFFORT_LABELS[model.defaultEffort].split(' ')[0]})` : ''}</option>
                {effortLevels.map((e) => (
                  <option key={e} value={e}>
                    {EFFORT_LABELS[e]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col items-start gap-2">
            <span className="text-[12px] font-medium text-slate-600">사용</span>
            <Toggle checked={value.enabled} onChange={(v) => !readOnly && onChange({ enabled: v })} label={`${FEATURE_LABELS[feature]} 사용`} />
          </label>
        </div>
        {model && <p className="text-[12px] text-slate-500">{model.description}{effortLevels.length === 0 ? ' · 추론 강도 설정 없음' : ''}</p>}
        {risky && (
          <p className="flex items-center gap-1.5 text-[12px] text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" /> 인력배치는 90초 안에 끝나야 합니다. 이 조합은 시간 초과로 실패할 수 있습니다.
          </p>
        )}

        {feature === 'chat' && (
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-slate-700">대화별 모델 변경 허용</p>
                <p className="text-[12px] text-slate-500">켜면 직원이 대화마다 아래 모델 중에서 고를 수 있습니다.</p>
              </div>
              <Toggle checked={!!value.allowOverride} onChange={(v) => !readOnly && onChange({ allowOverride: v })} label="대화별 모델 변경 허용" />
            </div>
            {value.allowOverride && (
              <div className="mt-3 flex flex-wrap gap-2">
                {models.map((m) => {
                  const checked = (value.overrideModels ?? []).includes(m.id) || m.id === value.model;
                  return (
                    <label key={m.id} className={`flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-[12px] ${checked ? 'border-purple-300 text-purple-800' : 'border-slate-200 text-slate-600'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={readOnly || m.id === value.model}
                        onChange={(e) => {
                          const list = new Set(value.overrideModels ?? []);
                          if (e.target.checked) list.add(m.id);
                          else list.delete(m.id);
                          onChange({ overrideModels: [...list] });
                        }}
                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                      />
                      {m.label}
                      {m.badge ? <span className="text-[10px] text-slate-400">({m.badge})</span> : null}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
