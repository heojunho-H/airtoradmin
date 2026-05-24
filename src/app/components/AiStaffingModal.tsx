// AI 인력 배치 추천 모달 — Phase 9
// 패턴: AiCompanyInfo.tsx 참조 (모달 열림 → 즉시 호출 → result/error)
// 상태: 'idle' → 'loading' → 'result' | 'error'

import { useState, useEffect } from 'react';
import { X, Sparkles, AlertCircle, RefreshCw, Check } from 'lucide-react';
import { suggestProjectStaffing, type StaffingInput, type StaffingSuggestion } from '../../lib/gemini';
import { ROLE_ORDER, ROLE_LABELS, type RoleAssignments } from '../../lib/roles';

// AI 추천 호출에 필요한 Project 최소 필드
export interface ProjectRefForStaffing {
  id: number;
  projectName: string;
  serviceType: string;
  netRevenue: number;
}

// 유사 프로젝트 ref (완료된 프로젝트 중) — 5개 역할
export interface SimilarProjectRef {
  serviceType: string;
  totalQuantity: number;
  workerAssignments: RoleAssignments & { days: number };
  profitRatio: number; // fraction (0~1)
}

// 가용 작업팀장 ref
export interface AvailableSubcontractor {
  name: string;
  grade: 'S' | 'A' | 'B' | 'C';
  cooperationScore: number;
  ongoingProjects: number;
}

interface AiStaffingModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectRefForStaffing;
  totalQuantity: number; // workHistory[].totalQuantity 또는 deal 참조
  detailedQuantity?: string;
  laborRates: RoleAssignments; // 캐스케이드 적용된 현재 5역할 단가
  similarProjects: SimilarProjectRef[];
  availableSubcontractors: AvailableSubcontractor[];
  targetProfitRatio?: number; // fraction, 기본 0.30
  onAdopt: (suggestion: StaffingSuggestion) => void;
}

type ModalState = 'idle' | 'loading' | 'result' | 'error';

export function AiStaffingModal({
  isOpen,
  onClose,
  project,
  totalQuantity,
  detailedQuantity,
  laborRates,
  similarProjects,
  availableSubcontractors,
  targetProfitRatio = 0.3,
  onAdopt,
}: AiStaffingModalProps) {
  const [state, setState] = useState<ModalState>('idle');
  const [suggestion, setSuggestion] = useState<StaffingSuggestion | null>(null);
  const [error, setError] = useState<string>('');

  const handleRequest = async () => {
    setState('loading');
    setError('');
    try {
      const input: StaffingInput = {
        service: project.serviceType,
        totalQuantity,
        detailedQuantity,
        netRevenue: project.netRevenue,
        laborRates,
        similarProjects: similarProjects.slice(0, 5).map((p) => ({
          service: p.serviceType,
          quantity: p.totalQuantity,
          assignments: p.workerAssignments,
          profitRatio: p.profitRatio,
        })),
        availableSubcontractors: availableSubcontractors.slice(0, 10),
        targetProfitRatio,
      };
      const result = await suggestProjectStaffing(input);
      setSuggestion(result);
      setState('result');
    } catch (e: any) {
      setError(e?.message || 'AI 응답 처리 실패');
      setState('error');
    }
  };

  // 모달 열릴 때마다 자동 호출 + 닫힐 때 상태 초기화
  useEffect(() => {
    if (isOpen) {
      handleRequest();
    } else {
      setState('idle');
      setSuggestion(null);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleAdopt = () => {
    if (suggestion) {
      onAdopt(suggestion);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Sparkles className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">AI 인력 배치 제안</h3>
              <p className="text-[12px] text-slate-500">{project.projectName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {state === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-10 h-10 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="mt-4 text-[13px] text-slate-600">유사 프로젝트 분석 중...</p>
              <p className="mt-1 text-[11px] text-slate-400">최대 30초 정도 소요됩니다</p>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <p className="mt-3 text-[13px] font-medium text-slate-800">AI 응답 처리 실패</p>
              <p className="mt-1 text-[12px] text-slate-500 max-w-md">{error}</p>
              <button
                onClick={handleRequest}
                className="mt-4 flex items-center gap-2 px-4 py-2 text-[13px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                다시 시도
              </button>
            </div>
          )}

          {state === 'result' && suggestion && (
            <div className="space-y-4">
              {/* 추천 인력 배치 — 5역할 + 작업일수 = 6장 */}
              <div className="bg-blue-50 rounded-xl p-4">
                <h4 className="text-[12px] font-semibold text-blue-700 uppercase tracking-wide mb-3">
                  추천 인력 배치
                </h4>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  {ROLE_ORDER.map((role) => (
                    <div key={role} className="bg-white rounded-lg p-3 text-center">
                      <p className="text-[10px] text-slate-500">{ROLE_LABELS[role]}</p>
                      <p className="text-[22px] font-semibold text-slate-900 mt-1">
                        {suggestion.assignments[role] ?? 0}
                      </p>
                      <p className="text-[10px] text-slate-400">명</p>
                    </div>
                  ))}
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-[10px] text-slate-500">작업일수</p>
                    <p className="text-[22px] font-semibold text-slate-900 mt-1">
                      {suggestion.assignments.days ?? 0}
                    </p>
                    <p className="text-[10px] text-slate-400">일</p>
                  </div>
                </div>
              </div>

              {/* 예상 손익 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="border border-slate-200 rounded-xl p-3">
                  <p className="text-[10px] text-slate-500">예상 인건비</p>
                  <p className="text-[14px] font-semibold text-slate-900 mt-1">
                    {(suggestion.estimatedLaborCost / 10000).toFixed(0)}만원
                  </p>
                </div>
                <div className="border border-slate-200 rounded-xl p-3">
                  <p className="text-[10px] text-slate-500">예상 순이익</p>
                  <p
                    className={`text-[14px] font-semibold mt-1 ${
                      suggestion.estimatedNetProfit >= 0 ? 'text-slate-900' : 'text-red-600'
                    }`}
                  >
                    {(suggestion.estimatedNetProfit / 10000).toFixed(0)}만원
                  </p>
                </div>
                <div className="border border-slate-200 rounded-xl p-3">
                  <p className="text-[10px] text-slate-500">예상 순익률</p>
                  <p
                    className={`text-[14px] font-semibold mt-1 ${
                      suggestion.estimatedProfitRatio >= targetProfitRatio
                        ? 'text-blue-700'
                        : 'text-amber-600'
                    }`}
                  >
                    {(suggestion.estimatedProfitRatio * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* 추론 근거 */}
              <div>
                <h4 className="text-[12px] font-semibold text-slate-700 uppercase tracking-wide mb-2">
                  추론 근거
                </h4>
                <p className="text-[13px] text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-3 whitespace-pre-line">
                  {suggestion.rationale}
                </p>
              </div>

              {/* 경고 */}
              {suggestion.warnings.length > 0 && (
                <div>
                  <h4 className="text-[12px] font-semibold text-amber-700 uppercase tracking-wide mb-2">
                    경고
                  </h4>
                  <ul className="space-y-1.5">
                    {suggestion.warnings.map((w, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-[12px] text-amber-900 bg-amber-50 rounded-lg px-3 py-2"
                      >
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 푸터 */}
        {state === 'result' && (
          <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-slate-100 bg-slate-50/50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              닫기
            </button>
            <button
              onClick={handleAdopt}
              className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
            >
              수정해서 채택
            </button>
            <button
              onClick={handleAdopt}
              className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              채택
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
