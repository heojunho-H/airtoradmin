import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Sparkles, X, Loader2, Building2, ExternalLink, Search } from 'lucide-react';
import { streamCompanyInfo, toAiRequestError } from '../../lib/ai/api';
import { formatKrw, prettyModelId } from '../../lib/ai/format';
import type { AiSource } from '../../lib/ai/types';
import { normalizeCompanyName } from '../../lib/company';

// AI 기업정보 — Claude 웹 검색(서버: functions/_lib/ai-company.ts). 모델은 설정 화면에서 지정.
// 같은 회사를 10분 안에 다시 열면 웹 검색 비용이 들지 않도록 결과를 재사용한다.

const Markdown = lazy(() => import('./ai/Markdown'));

interface CompanyResult {
  text: string;
  sources: AiSource[];
  model: string;
  costUsd: number | null;
}

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { result: CompanyResult; at: number }>();

interface AiCompanyInfoProps {
  companyName: string;
}

export function AiCompanyInfoButton({ companyName }: AiCompanyInfoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<CompanyResult | null>(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<{ phase: string; query?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cacheKey = normalizeCompanyName(companyName) || companyName.trim();

  useEffect(() => () => abortRef.current?.abort(), []);

  const runQuery = async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setIsLoading(true);
    setError(null);
    setDraft('');
    setStatus({ phase: 'connecting' });
    const userName = localStorage.getItem('user_name') || '';
    try {
      let done: CompanyResult | null = null;
      await streamCompanyInfo(
        companyName,
        userName,
        (event, data) => {
          if (event === 'status') setStatus({ phase: data.phase, query: data.query });
          else if (event === 'text') setDraft((d) => d + (data.delta || ''));
          else if (event === 'done') done = { text: data.text, sources: data.sources ?? [], model: data.model, costUsd: data.costUsd ?? null };
          else if (event === 'error') setError(data.message || '기업 정보를 가져오지 못했습니다.');
        },
        ac.signal,
      );
      if (done) {
        setResult(done);
        cache.set(cacheKey, { result: done, at: Date.now() });
      }
    } catch (err) {
      const e = toAiRequestError(err);
      if (e.code !== 'aborted') setError(e.message);
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setIsLoading(false);
      setStatus(null);
    }
  };

  const handleSearch = () => {
    setIsOpen(true);
    if (result || isLoading) return;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      setResult(hit.result);
      return;
    }
    runQuery();
  };

  const handleRetry = () => {
    cache.delete(cacheKey);
    setResult(null);
    runQuery();
  };

  // 모달을 닫아도 조회는 계속한다 — 다시 열면 결과가 보인다
  const handleClose = () => setIsOpen(false);

  const statusText =
    status?.phase === 'searching'
      ? status.query
        ? `웹 검색 중: "${status.query}"`
        : '웹을 검색하고 있습니다'
      : status?.phase === 'writing'
        ? '조사 내용을 정리하고 있습니다'
        : status?.phase === 'continuing'
          ? '추가로 조사하고 있습니다'
          : 'Claude가 웹을 검색하고 있습니다 (30초 이상 걸릴 수 있어요)';

  return (
    <>
      <button
        onClick={handleSearch}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
        title="AI 기업 정보 조회"
      >
        <Sparkles className="w-3 h-3" />
        AI 기업 정보
      </button>

      {/* 모달 */}
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={handleClose} />
          <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl max-h-[80vh] flex flex-col" role="dialog" aria-label="AI 기업 정보">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Building2 className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-slate-800">AI 기업 정보</h3>
                  <p className="text-[12px] text-slate-400">{companyName}</p>
                </div>
              </div>
              <button onClick={handleClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" aria-label="닫기">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {isLoading ? (
                <div>
                  <div className="flex items-center gap-2 text-[13px] text-slate-500">
                    {status?.phase === 'searching' ? <Search className="w-4 h-4 text-purple-400" /> : <Loader2 className="w-4 h-4 animate-spin text-purple-400" />}
                    <span>{statusText}…</span>
                  </div>
                  {draft && <div className="mt-3 text-[13px] text-slate-400 leading-relaxed whitespace-pre-wrap">{draft}</div>}
                </div>
              ) : error ? (
                <p className="text-[13px] text-red-600">{error}</p>
              ) : result ? (
                <>
                  <Suspense fallback={<div className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">{result.text}</div>}>
                    <Markdown text={result.text} />
                  </Suspense>
                  {result.sources.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-slate-100">
                      <p className="text-[11px] font-semibold text-slate-500 mb-2">참고 출처 ({result.sources.length})</p>
                      <ul className="space-y-1.5">
                        {result.sources.map((s, i) => (
                          <li key={s.url} className="flex items-start gap-1.5">
                            <span className="text-[11px] text-slate-400 mt-0.5">{i + 1}.</span>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-purple-600 hover:text-purple-700 hover:underline break-all inline-flex items-center gap-1"
                            >
                              <span className="line-clamp-1">{s.title || s.url}</span>
                              <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* 하단 */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <p className="text-[10px] text-slate-400">
                Claude 웹 검색{result?.model ? ` · ${prettyModelId(result.model)}` : ''}
                {result?.costUsd ? ` · ${formatKrw(result.costUsd)}` : ''} · 정보가 정확하지 않을 수 있습니다
              </p>
              {!isLoading && (result || error) && (
                <button onClick={handleRetry} className="flex-shrink-0 text-[12px] text-purple-600 hover:text-purple-700 font-medium">
                  다시 조회
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
