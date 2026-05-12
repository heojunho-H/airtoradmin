import { useState } from 'react';
import { Sparkles, X, Loader2, Building2, ExternalLink } from 'lucide-react';
import { sendCompanyInfoQuery, type CompanySource } from '../../lib/gemini';

interface AiCompanyInfoProps {
  companyName: string;
}

export function AiCompanyInfoButton({ companyName }: AiCompanyInfoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState('');
  const [sources, setSources] = useState<CompanySource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const runQuery = async () => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const { text, sources } = await sendCompanyInfoQuery(companyName);
      setResult(text);
      setSources(sources);
    } catch {
      setResult('기업 정보를 가져오는 중 오류가 발생했습니다. 다시 시도해주세요.');
      setSources([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    setIsOpen(true);
    if (hasSearched) return;
    await runQuery();
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleRetry = async () => {
    setHasSearched(false);
    setResult('');
    setSources([]);
    await runQuery();
  };

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
          <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
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
              <button onClick={handleClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-400 mb-3" />
                  <p className="text-[13px]">웹 검색으로 기업 정보를 조사하고 있습니다...</p>
                </div>
              ) : (
                <>
                  <div className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {result}
                  </div>
                  {sources.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-slate-100">
                      <p className="text-[11px] font-semibold text-slate-500 mb-2">
                        참고 출처 ({sources.length})
                      </p>
                      <ul className="space-y-1.5">
                        {sources.map((s, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-[11px] text-slate-400 mt-0.5">{i + 1}.</span>
                            <a
                              href={s.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-purple-600 hover:text-purple-700 hover:underline break-all inline-flex items-center gap-1"
                            >
                              <span className="line-clamp-1">{s.title || s.uri}</span>
                              <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 하단 */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
              <p className="text-[10px] text-slate-400">Gemini 2.5 Flash + Google Search · 정보가 정확하지 않을 수 있습니다</p>
              {!isLoading && hasSearched && (
                <button
                  onClick={handleRetry}
                  className="text-[12px] text-purple-600 hover:text-purple-700 font-medium"
                >
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
