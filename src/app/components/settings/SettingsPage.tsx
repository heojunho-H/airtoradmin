// 설정 페이지 — AI 모델 설정(관리자 PIN) · AI 사용량 · 연결 상태.

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { getStatus, toAiRequestError } from '../../../lib/ai/api';
import type { AiStatus } from '../../../lib/ai/types';
import { AiModelSettingsCard } from './AiModelSettingsCard';
import { AiUsageCard } from './AiUsageCard';

export default function SettingsPage({ userName, onNotification }: { userName: string; onNotification?: (msg: string) => void }) {
  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">설정</h1>
        <p className="mt-1 text-[15px] text-slate-500">AI 모델 · 사용량 · 연결 상태</p>
      </div>
      <AiModelSettingsCard userName={userName} onNotification={onNotification} />
      <AiUsageCard />
      <ConnectionStatusCard />
    </div>
  );
}

function ConnectionStatusCard() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await getStatus());
    } catch (err) {
      setStatus(null);
      setError(toAiRequestError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const dbLabel = status?.db === 'ok' ? '연결됨' : status?.db === 'no_tables' ? '테이블 없음 (스키마 미적용)' : '바인딩 없음 (AI_DB)';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-slate-900">AI 연결 상태</h2>
          <p className="mt-0.5 text-[14px] text-slate-500">Cloudflare 환경변수·D1 연결 확인 (설정 방법: docs/ai-claude.md)</p>
        </div>
        <button onClick={check} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[14px] text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> 다시 확인
        </button>
      </div>
      {error && <p className="mt-4 text-[14px] text-red-600">{error}</p>}
      {status && (
        <ul className="mt-4 grid gap-2 md:grid-cols-3">
          <StatusItem ok={status.apiKey} label="Anthropic API 키" detail={status.apiKey ? '설정됨' : 'ANTHROPIC_API_KEY 없음'} />
          <StatusItem ok={status.db === 'ok'} label="대화 저장소 (D1)" detail={dbLabel} />
          <StatusItem ok={status.pinConfigured} label="관리자 PIN" detail={status.pinConfigured ? '설정됨' : 'AI_ADMIN_PIN 없음 — 설정 읽기 전용'} />
        </ul>
      )}
    </div>
  );
}

function StatusItem({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className={`flex items-start gap-2 rounded-lg border p-3 ${ok ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}`}>
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 text-red-500" />}
      <div>
        <p className="text-[14px] font-medium text-slate-800">{label}</p>
        <p className="text-[13px] text-slate-500">{detail}</p>
      </div>
    </li>
  );
}
