import { useState } from 'react';
import { Sparkles, X, Loader2, Building2 } from 'lucide-react';
import { sendChatMessage, type ChatMessage } from '../../lib/gemini';

interface AiCompanyInfoProps {
  companyName: string;
}

const SYSTEM_CONTEXT = `당신은 기업 정보 조사 전문가입니다. 사용자가 기업명을 제공하면 해당 기업에 대해 알려진 정보를 정리해주세요.

다음 항목을 포함하세요 (알 수 있는 범위 내에서):
- 기업 개요 (업종, 설립연도, 규모 등)
- 주요 사업 분야 및 제품/서비스
- 본사 위치 및 주요 사업장
- 최근 동향 또는 특이사항
- 업계 내 위치 및 경쟁사

한국어로 간결하게 답변하세요. 확인되지 않은 정보는 추측하지 말고, 알 수 없는 항목은 생략하세요.
중소기업이나 정보가 부족한 경우 솔직하게 알려주세요.`;

export function AiCompanyInfoButton({ companyName }: AiCompanyInfoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    setIsOpen(true);
    if (hasSearched) return;

    setIsLoading(true);
    setHasSearched(true);

    try {
      const messages: ChatMessage[] = [{
        role: 'user',
        parts: [{ text: `"${companyName}" 기업에 대한 정보를 조사해주세요.` }],
      }];

      const response = await sendChatMessage(messages, SYSTEM_CONTEXT);
      setResult(response);
    } catch {
      setResult('기업 정보를 가져오는 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleRetry = async () => {
    setHasSearched(false);
    setResult('');
    setIsLoading(true);
    setHasSearched(true);

    try {
      const messages: ChatMessage[] = [{
        role: 'user',
        parts: [{ text: `"${companyName}" 기업에 대한 정보를 조사해주세요.` }],
      }];

      const response = await sendChatMessage(messages, SYSTEM_CONTEXT);
      setResult(response);
    } catch {
      setResult('기업 정보를 가져오는 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
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
                  <p className="text-[13px]">기업 정보를 조사하고 있습니다...</p>
                </div>
              ) : (
                <div className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {result}
                </div>
              )}
            </div>

            {/* 하단 */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
              <p className="text-[10px] text-slate-400">Gemini AI 기반 · 정보가 정확하지 않을 수 있습니다</p>
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
