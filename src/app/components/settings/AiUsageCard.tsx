import { useEffect, useState } from 'react';
import { getUsage, toAiRequestError } from '../../../lib/ai/api';
import { formatKrw, formatTokens, formatUsd, kstMonth, USAGE_FEATURE_LABELS, USD_TO_KRW } from '../../../lib/ai/format';
import type { UsageReport } from '../../../lib/ai/types';

export function AiUsageCard() {
  const [month, setMonth] = useState(kstMonth());
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getUsage(month)
      .then((r) => !cancelled && setReport(r))
      .catch((err) => !cancelled && setError(toAiRequestError(err).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [month]);

  const t = report?.totals;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-slate-900">AI 사용량</h2>
          <p className="mt-0.5 text-[14px] text-slate-500">정가 기준 추정치 · 환율 {USD_TO_KRW.toLocaleString()}원/$ 가정 · 실제 청구는 Anthropic Console 기준</p>
        </div>
        <label className="flex items-center gap-2 text-[14px] text-slate-600">
          <input
            type="month"
            aria-label="조회 월"
            value={month}
            max={kstMonth()}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </div>

      {error && <p className="mt-4 text-[14px] text-red-600">{error}</p>}
      {loading && !report && <p className="mt-4 text-[14px] text-slate-400">불러오는 중…</p>}

      {t && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="추정 비용" value={formatKrw(t.costUsd) || '₩0'} sub={formatUsd(t.costUsd)} />
            <Kpi label="호출" value={`${t.calls.toLocaleString()}회`} sub={t.errors ? `실패 ${t.errors}회` : '실패 없음'} />
            <Kpi label="입력 토큰" value={formatTokens(t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens)} sub={`캐시 읽기 ${formatTokens(t.cacheReadTokens)}`} />
            <Kpi label="출력 토큰" value={formatTokens(t.outputTokens)} sub={t.webSearches ? `웹 검색 ${t.webSearches}회` : ' '} />
          </div>

          {report.byFeatureModel.length === 0 ? (
            <p className="mt-5 text-[14px] text-slate-400">이 달에는 사용 기록이 없습니다.</p>
          ) : (
            <div className="mt-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-[14px]">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">기능</th>
                      <th className="px-3 py-2 text-left font-semibold">모델</th>
                      <th className="px-3 py-2 text-right font-semibold">호출</th>
                      <th className="px-3 py-2 text-right font-semibold">입력/출력</th>
                      <th className="px-3 py-2 text-right font-semibold">추정 비용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byFeatureModel.map((r) => (
                      <tr key={`${r.feature}-${r.model}`} className="border-t border-slate-100">
                        <td className="px-3 py-2 whitespace-nowrap">{USAGE_FEATURE_LABELS[r.feature] ?? r.feature}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.calls}
                          {r.errors ? <span className="text-red-500"> ({r.errors})</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                          {formatTokens(r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens)} / {formatTokens(r.outputTokens)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" title={formatUsd(r.costUsd)}>
                          {formatKrw(r.costUsd) || '₩0'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-[14px]">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">사용자</th>
                      <th className="px-3 py-2 text-right font-semibold">호출</th>
                      <th className="px-3 py-2 text-right font-semibold">추정 비용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byUser.map((u) => (
                      <tr key={u.userName} className="border-t border-slate-100">
                        <td className="px-3 py-2">{u.userName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{u.calls}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatKrw(u.costUsd) || '₩0'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-[13px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-[24px] font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-0.5 text-[12px] text-slate-400">{sub}</p>
    </div>
  );
}
