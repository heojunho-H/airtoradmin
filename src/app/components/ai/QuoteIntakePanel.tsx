// 견적서 입력 도우미 — PDF 를 올리면 Claude 가 읽고(/api/files), 찾은 고객사·작업건과 바뀔 값을 보여준 뒤
// [시스템에 입력] 한 번으로 기존 API(/api/deals·/api/projects)에 반영한다 (src/lib/ai/intake.ts).
// 파일은 R2 에 남아 고객 관리 상세(CustomerFiles)와 아래 최근 목록에서 내려받는다.
// AI 페이지가 대화 화면으로 바뀌어도 숨김으로 유지되므로 판독 중에 다른 화면을 봐도 이어진다.

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLast,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  PanelLeft,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { normalizeCompanyName } from '../../../lib/company';
import { toAiRequestError } from '../../../lib/ai/api';
import { deleteFile, downloadUrl, formatBytes, linkFile, listRecentFiles, uploadQuote, type StoredFile, type UploadPhase, type UploadResult } from '../../../lib/ai/files';
import { formatKrw, kstYmd, prettyModelId, relativeTimeKo } from '../../../lib/ai/format';
import { applyQuote, candidateLabel, equipmentSummary, manwonText, matchQuote, planDeal, projectAmounts, serviceLabel, wonText, type ApplyResult } from '../../../lib/ai/intake';
import { INTAKE_AGENT } from '../../../lib/ai/personas';
import type { AiDatasets } from '../../../lib/ai/types';

const MAX_BYTES = 20 * 1024 * 1024;

export interface IntakeDataChange {
  company: string;
  dealId: number;
  created: boolean;
  dealSuccess: boolean;
}

interface Props {
  /** AI 페이지가 보이고 도우미 화면이 열려 있음 */
  isActive: boolean;
  userName: string;
  datasets: AiDatasets;
  loadFreshDatasets: () => Promise<AiDatasets>;
  onDataChanged?: (change: IntakeDataChange) => void;
  panelCollapsed: boolean;
  onExpandPanel: () => void;
  onOpenList: () => void;
  /** AI 대화 화면으로 */
  onBack: () => void;
}

type MatchData = Pick<AiDatasets, 'deals' | 'customers' | 'managers' | 'projects'>;

type Stage =
  | { kind: 'idle' }
  | { kind: 'uploading'; fileName: string; size: number; phase: UploadPhase | 'starting'; startedAt: number }
  | { kind: 'review'; result: UploadResult; data: MatchData }
  | { kind: 'done'; result: UploadResult; applied: ApplyResult; customerId: number | null; linkError: string | null };

function errorText(err: unknown): string {
  if (err instanceof TypeError) return '네트워크 연결을 확인한 뒤 다시 시도하세요.';
  if (err instanceof Error && !(err instanceof DOMException) && !('code' in err)) return err.message;
  return toAiRequestError(err).message;
}

function isPdf(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

// ─── 머리 ───────────────────────────────────────────────────────────────

function IntakeHeader({ panelCollapsed, onExpandPanel, onOpenList, onBack }: Pick<Props, 'panelCollapsed' | 'onExpandPanel' | 'onOpenList' | 'onBack'>) {
  const Icon = INTAKE_AGENT.icon;
  return (
    <div className="flex h-12 flex-shrink-0 items-center gap-1.5 border-b border-slate-100 bg-white px-3 md:px-5">
      <button onClick={onOpenList} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="대화 목록 열기">
        <PanelLeft className="h-[18px] w-[18px]" />
      </button>
      {panelCollapsed && (
        <button onClick={onExpandPanel} className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:inline-flex" aria-label="대화 목록 펼치기" title="대화 목록 펼치기">
          <ChevronLast className="h-[18px] w-[18px]" />
        </button>
      )}
      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-[#eef5ff] px-2 py-1 text-[12px] font-semibold text-[#1d4fb8]">
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        {INTAKE_AGENT.label}
      </span>
      <h1 className="hidden min-w-0 flex-1 truncate pl-1 text-[14px] font-semibold text-slate-800 sm:block">{INTAKE_AGENT.description}</h1>
      <span className="flex-1 sm:hidden" />
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        title="AI 대화 화면으로"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        AI 대화로
      </button>
    </div>
  );
}

// ─── 올리기 ─────────────────────────────────────────────────────────────

function DropZone({ onFile, dragging }: { onFile: (f: File) => void; dragging: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors md:py-12 ${
        dragging ? 'border-[#5b9cf2] bg-[#f3f8ff]' : 'border-[#d5dbe3] bg-white'
      }`}
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#eef5ff] text-[#3b82f6]">
        <Upload className="h-6 w-6" strokeWidth={1.9} />
      </span>
      <p className="mt-4 text-[15px] font-semibold text-slate-800">견적서 PDF를 끌어놓거나 선택하세요</p>
      <p className="mt-1 text-[13px] text-slate-500">PDF · 20MB 이하 · 한 번에 한 장</p>
      <button
        onClick={() => inputRef.current?.click()}
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[#3b82f6] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#2f6fe0]"
      >
        <FileText className="h-4 w-4" />
        파일 선택
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
    </div>
  );
}

const PHASES: Array<{ key: string; label: string }> = [
  { key: 'upload', label: '파일 올리기' },
  { key: 'read', label: 'AI 판독' },
  { key: 'review', label: '확인 후 입력' },
];

function ProgressCard({ stage, onCancel }: { stage: Extract<Stage, { kind: 'uploading' }>; onCancel: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const reading = stage.phase === 'reading' || stage.phase === 'duplicate';
  const seconds = Math.max(0, Math.round((now - stage.startedAt) / 1000));
  return (
    <section className="rounded-xl border border-[#e6e9ee] bg-white p-5 md:p-6" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <FileText className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-slate-800">{stage.fileName}</p>
          <p className="text-[12px] text-slate-500">{formatBytes(stage.size)}</p>
        </div>
        <button onClick={onCancel} className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-slate-500 hover:bg-slate-100">
          취소
        </button>
      </div>
      <ol className="mt-5 grid grid-cols-3 gap-2">
        {PHASES.map((p, i) => {
          const state = i === 0 ? (reading ? 'done' : 'active') : i === 1 ? (reading ? 'active' : 'todo') : 'todo';
          return (
            <li key={p.key} className="flex flex-col gap-1.5">
              <span className={`h-1 rounded-full ${state === 'done' ? 'bg-[#3b82f6]' : state === 'active' ? 'animate-pulse bg-[#93c0fa]' : 'bg-slate-200'}`} />
              <span className={`text-[12px] ${state === 'todo' ? 'text-slate-400' : 'font-medium text-slate-700'}`}>{p.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 flex items-center gap-2 text-[13px] text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin text-[#3b82f6]" />
        {reading ? `AI가 견적서를 읽고 있어요… ${seconds}초 (보통 20~60초)` : '파일을 올리는 중…'}
      </p>
    </section>
  );
}

// ─── 확인 카드 ──────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-[13px]">
      <dt className="w-[4.5rem] flex-shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-keep text-slate-800">{children}</dd>
    </div>
  );
}

const CONFIDENCE: Record<string, { text: string; cls: string }> = {
  high: { text: '판독 신뢰도 높음', cls: 'bg-emerald-50 text-emerald-700' },
  medium: { text: '판독 신뢰도 보통', cls: 'bg-amber-50 text-amber-700' },
  low: { text: '판독 신뢰도 낮음 — 값을 꼭 확인하세요', cls: 'bg-red-50 text-red-700' },
};

function ReviewCard({
  result,
  data,
  userName,
  applying,
  onCancel,
  onApply,
}: {
  result: UploadResult;
  data: MatchData;
  userName: string;
  applying: boolean;
  onCancel: () => void;
  onApply: (args: { company: string; dealId: number | null; manager: string }) => void;
}) {
  const ex = result.extraction;
  const file = result.file;
  const [company, setCompany] = useState(ex.recipientCompany);
  const match = useMemo(() => matchQuote({ ...ex, recipientCompany: company }, data.deals, data.customers), [ex, company, data]);
  const pickDefault = useCallback(
    (m: typeof match): number | 'new' => {
      // 이미 입력했던 파일이면 그 딜을 먼저
      if (file.dealId && m.candidates.some((c) => Number(c.deal.id) === file.dealId)) return file.dealId;
      return m.defaultDealId ?? 'new';
    },
    [file.dealId],
  );
  const [choice, setChoice] = useState<number | 'new'>(() => pickDefault(match));
  // 회사명을 고치면 후보가 바뀐다 → 기본 선택도 다시
  const lastKey = useRef(match.companyKey);
  useEffect(() => {
    if (lastKey.current === match.companyKey) return;
    lastKey.current = match.companyKey;
    setChoice(pickDefault(match));
  }, [match, pickDefault]);

  const selected = choice === 'new' ? null : (match.candidates.find((c) => Number(c.deal.id) === choice) ?? null);
  const managerNames = useMemo(
    () => [...new Set(data.managers.filter((m) => m.status !== 'leave').map((m) => String(m.name || '').trim()).filter(Boolean))],
    [data.managers],
  );
  const customer = selected?.similar ? data.customers.find((c) => normalizeCompanyName(c.company) === normalizeCompanyName(selected.deal.company)) : match.customer;
  const needsManager = !selected || !String(selected.deal.salesManager || '').trim();
  // 고객 책임자가 있으면 그 사람, 새 딜이면 올린 사람(고객책임자 명단에 있을 때). 기존 딜은 임의로 채우지 않는다
  const suggestedManager = String(customer?.accountManager || '').trim() || (!selected && managerNames.includes(userName) ? userName : '');
  const [manager, setManager] = useState(suggestedManager);
  useEffect(() => setManager(suggestedManager), [suggestedManager]);

  const plan = useMemo(
    () => planDeal({ ...ex, recipientCompany: company.trim() || ex.recipientCompany }, selected?.deal ?? null, { fileName: file.fileName, manager: needsManager ? manager : '', today: kstYmd() }),
    [ex, company, selected, file.fileName, manager, needsManager],
  );
  const changed = plan.changes.filter((c) => c.changed);
  // 수주 딜의 프로젝트는 생성 후 갱신되지 않는다 — 견적서 금액과 다르면 함께 고친다 (applyQuote)
  const project = plan.dealSuccess && selected ? data.projects.find((p) => Number(p.dealId) === Number(selected.deal.id)) : undefined;
  const projectCurrent = project ? Number(project.quotationAmount) || 0 : 0;
  const projectFix = !!project && ex.quotedTotal > 0 && projectCurrent !== ex.quotedTotal;
  const confidence = CONFIDENCE[ex.confidence] ?? CONFIDENCE.medium;
  const canApply = !applying && !!(company.trim() || selected);

  return (
    <section className="rounded-xl border border-[#e6e9ee] bg-white" aria-label="견적서 판독 결과">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 md:px-5">
        <FileText className="h-4 w-4 flex-shrink-0 text-slate-500" />
        <a href={downloadUrl(file.id)} className="min-w-0 flex-1 truncate text-[14px] font-semibold text-slate-800 hover:text-blue-700 hover:underline" title="원본 내려받기">
          {file.fileName}
        </a>
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${confidence.cls}`}>{confidence.text}</span>
      </div>

      {result.duplicate && (
        <p className="flex items-start gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[12px] text-slate-600 md:px-5">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          {file.status === 'linked'
            ? `이미 입력한 견적서입니다 (${file.linkedBy ?? file.uploadedBy}님${file.linkedAt ? `, ${relativeTimeKo(file.linkedAt)}` : ''}${file.dealId ? `, 딜 #${file.dealId}` : ''}). 아래 변경표는 지금 값과 다시 비교한 결과입니다.`
            : `${file.uploadedBy}님이 ${relativeTimeKo(file.createdAt)} 올린 파일입니다. 이전 판독 결과를 다시 사용합니다.`}
        </p>
      )}

      <div className="grid gap-x-8 px-4 py-3 md:grid-cols-2 md:px-5">
        <dl>
          <Row label="수신">{ex.recipientCompany || '-'}</Row>
          <Row label="담당자">{[ex.contactName, ex.contactPosition].filter(Boolean).join(' ') || '-'}</Row>
          <Row label="견적일">
            {ex.quoteDate || '-'}
            {ex.validDays ? <span className="text-slate-400"> · 유효 {ex.validDays}일</span> : null}
          </Row>
        </dl>
        <dl>
          <Row label="서비스">
            {serviceLabel(ex)}
            {ex.serviceName && ex.serviceName !== serviceLabel(ex) ? <span className="text-slate-400"> · {ex.serviceName}</span> : null}
          </Row>
          <Row label="장비">
            {equipmentSummary(ex)}
            {ex.totalQuantity ? <span className="text-slate-400"> · 총 {ex.totalQuantity}대</span> : null}
          </Row>
          <Row label="총 견적">
            <span className="font-semibold">{ex.quotedTotal ? `${ex.quotedTotal.toLocaleString('ko-KR')}원` : '-'}</span>
            {ex.quotedTotal ? <span className="text-slate-400"> · {ex.vatIncluded ? 'VAT 포함' : 'VAT 별도'}</span> : null}
          </Row>
        </dl>
      </div>

      <div className="border-t border-slate-100 px-4 py-4 md:px-5">
        <p className="text-[13px] font-semibold text-slate-900">어디에 입력할까요?</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-[12px] text-slate-500">고객사</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              maxLength={100}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] text-slate-800 focus:border-[#5b9cf2] focus:outline-none"
            />
            <span className="mt-1 block text-[12px] text-slate-500">
              {customer ? (
                <>
                  기존 고객 · {/^[SAB]$/.test(customer.grade) ? `${customer.grade}등급` : '등급 미설정'}
                  {customer.accountManager ? ` · 책임자 ${customer.accountManager}` : ''}
                </>
              ) : (
                '고객 관리에 없는 회사 — 수주되면 자동 등록됩니다'
              )}
            </span>
            {match.similarCompanies.length > 0 && !customer && (
              <span className="mt-1 flex flex-wrap gap-1">
                <span className="text-[12px] text-slate-400">비슷한 이름:</span>
                {match.similarCompanies.map((n) => (
                  <button key={n} onClick={() => setCompany(n)} className="rounded border border-slate-200 px-1.5 text-[12px] text-slate-600 hover:border-[#5b9cf2] hover:text-blue-700">
                    {n}
                  </button>
                ))}
              </span>
            )}
          </label>
          <label className="block">
            <span className="text-[12px] text-slate-500">작업건(딜)</span>
            <select
              value={String(choice)}
              onChange={(e) => setChoice(e.target.value === 'new' ? 'new' : Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 focus:border-[#5b9cf2] focus:outline-none"
            >
              {match.candidates.map((c) => (
                <option key={c.deal.id} value={String(c.deal.id)}>
                  {candidateLabel(c)}
                </option>
              ))}
              <option value="new">＋ 새 딜로 등록 (견적서 발송 단계)</option>
            </select>
            <span className="mt-1 block text-[12px] text-slate-500">
              {selected
                ? selected.reasons.join(' · ') || '같은 회사의 딜'
                : match.candidates.length
                  ? `같은 회사 딜 ${match.candidates.length}건이 있지만 새 딜로 등록합니다 (문의일 = 견적일)`
                  : '맞는 딜이 없어 새 딜로 등록합니다 (문의일 = 견적일)'}
            </span>
          </label>
          {needsManager && (
            <label className="block">
              <span className="text-[12px] text-slate-500">고객책임자</span>
              <select
                value={manager}
                onChange={(e) => setManager(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 focus:border-[#5b9cf2] focus:outline-none"
              >
                <option value="">지정 안 함</option>
                {managerNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 px-4 py-4 md:px-5">
        <p className="text-[13px] font-semibold text-slate-900">{plan.mode === 'create' ? '새로 등록할 값' : '바뀌는 값'}</p>
        <div className="mt-2">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 text-[12px] text-slate-500">
                <th className="py-1.5 pr-3 font-medium">항목</th>
                {plan.mode === 'update' && <th className="py-1.5 pr-3 font-medium">현재</th>}
                <th className="py-1.5 font-medium">견적서</th>
              </tr>
            </thead>
            <tbody>
              {plan.changes.map((c) => (
                <tr key={c.label} className="border-b border-slate-50 align-top last:border-0">
                  <td className="whitespace-nowrap py-1.5 pr-3 text-slate-500">{c.label}</td>
                  {plan.mode === 'update' && <td className={`py-1.5 pr-3 ${c.changed ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-500'}`}>{c.current}</td>}
                  <td className={`py-1.5 break-keep ${c.changed ? 'font-medium text-slate-900' : 'text-slate-400'}`}>
                    {c.changed ? c.next : '그대로'}
                    {c.note && c.changed && <span className="ml-1 text-[11px] font-normal text-slate-400">({c.note})</span>}
                  </td>
                </tr>
              ))}
              {projectFix && (
                <tr className="align-top">
                  <td className="whitespace-nowrap py-1.5 pr-3 text-slate-500">프로젝트 견적</td>
                  <td className="py-1.5 pr-3 text-slate-400 line-through decoration-slate-300">{wonText(projectCurrent) || '0원'}</td>
                  <td className="py-1.5 font-medium text-slate-900">
                    {wonText(ex.quotedTotal)}
                    <span className="block text-[11px] font-normal text-slate-400 sm:ml-1 sm:inline">(순매출 {wonText(projectAmounts(ex.quotedTotal).netRevenue)})</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 space-y-1 text-[12px] text-slate-500">
          {plan.mode === 'update' && changed.length === 0 ? (
            <li>딜 값은 이미 견적서와 같습니다. 입력하면 관리 메모에 “견적서 반영” 한 줄을 남기고 파일을 이 고객사에 보관합니다.</li>
          ) : (
            <li>관리 메모 끝에 “견적서 반영” 한 줄을 덧붙이고, 파일은 이 고객사에 보관됩니다.</li>
          )}
          {plan.dealSuccess && changed.length > 0 && <li className="text-slate-600">수주된 딜이라 고객 작업 이력도 함께 갱신됩니다.</li>}
          {projectFix && <li className="text-slate-600">프로젝트 관리의 견적·부가세·순매출을 견적서 금액으로 고칩니다 (인건비율·순익은 서버가 다시 계산).</li>}
          {selected?.alreadyEntered && changed.length > 0 && <li>이 딜에는 같은 견적 금액이 이미 들어 있습니다.</li>}
        </ul>
        {ex.warnings.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {ex.warnings.map((w) => (
              <li key={w} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-4 py-3 md:px-5">
        {result.model && (
          <span className="mr-auto text-[11px] text-slate-400">
            {prettyModelId(result.model)} 판독{result.costUsd ? ` · ${formatKrw(result.costUsd)}` : ''}
          </span>
        )}
        <button onClick={onCancel} disabled={applying} className="rounded-lg px-3 py-2 text-[14px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
          취소
        </button>
        <button
          onClick={() => onApply({ company: company.trim(), dealId: choice === 'new' ? null : choice, manager: needsManager ? manager : '' })}
          disabled={!canApply}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b82f6] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#2f6fe0] disabled:cursor-not-allowed disabled:bg-[#b9d3f8]"
        >
          {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {applying ? '입력하는 중…' : '시스템에 입력'}
        </button>
      </div>
    </section>
  );
}

// ─── 완료 ───────────────────────────────────────────────────────────────

function DoneCard({ stage, onRelink, relinking, onNext }: { stage: Extract<Stage, { kind: 'done' }>; onRelink: () => void; relinking: boolean; onNext: () => void }) {
  const a = stage.applied;
  const changed = a.changes.filter((c) => c.changed);
  return (
    <section className="rounded-xl border border-[#e6e9ee] bg-white p-5 md:p-6" aria-live="polite">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-6 w-6 flex-shrink-0 text-emerald-500" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-slate-900 break-keep">
            {a.created ? `${a.company} — 새 딜(#${a.dealId})로 등록했습니다` : `${a.company} 딜 #${a.dealId}에 견적서를 입력했습니다`}
          </p>
          <p className="mt-0.5 text-[12px] text-slate-500">{stage.result.file.fileName}</p>
        </div>
      </div>
      {changed.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg bg-slate-50 px-4 py-3 text-[13px]">
          {changed.map((c) => (
            <li key={c.label} className="flex gap-3">
              <span className="w-[4.5rem] flex-shrink-0 text-slate-500">{c.label}</span>
              <span className="min-w-0 flex-1 text-slate-800">{c.next}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 space-y-2 text-[12px]">
        {a.syncFailed && (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            딜은 저장됐지만 고객·프로젝트 동기화에 실패했습니다. 영업 화면에서 이 딜을 한 번 더 저장해 주세요.
          </p>
        )}
        {a.projectError && (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            {a.projectError} — 프로젝트 관리에서 견적 금액을 확인해 주세요.
          </p>
        )}
        {a.projectUpdated && <p className="text-slate-500">프로젝트 견적·부가세·순매출도 갱신했습니다.</p>}
        {stage.linkError ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="min-w-0 flex-1">파일을 고객사에 연결하지 못했습니다: {stage.linkError}</span>
            <button onClick={onRelink} disabled={relinking} className="rounded-md border border-amber-300 bg-white px-2 py-0.5 font-medium hover:bg-amber-100 disabled:opacity-50">
              {relinking ? '연결 중…' : '다시 연결'}
            </button>
          </div>
        ) : (
          <p className="text-slate-500">
            {stage.customerId != null || a.dealSuccess
              ? `원본 파일은 고객 관리 › ${a.company} 상세에서 내려받을 수 있습니다.`
              : '원본 파일은 아래 목록에서 내려받을 수 있고, 수주되어 고객으로 등록되면 고객 상세에도 보입니다.'}
          </p>
        )}
      </div>
      <div className="mt-5 flex justify-end">
        <button onClick={onNext} className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b82f6] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[#2f6fe0]">
          <Upload className="h-4 w-4" />
          다른 견적서 입력
        </button>
      </div>
    </section>
  );
}

// ─── 최근 목록 ──────────────────────────────────────────────────────────

function RecentFiles({
  items,
  loading,
  error,
  me,
  onRefresh,
  onDelete,
}: {
  items: StoredFile[];
  loading: boolean;
  error: string | null;
  me: string;
  onRefresh: () => void;
  onDelete: (f: StoredFile) => void;
}) {
  return (
    <section className="mt-8" aria-label="최근 올린 견적서">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-slate-900">최근 올린 견적서</h2>
        <button onClick={onRefresh} disabled={loading} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50" aria-label="목록 새로고침" title="새로고침">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {error ? (
        <p className="rounded-xl border border-[#e6e9ee] bg-white px-4 py-3 text-[13px] text-slate-500">목록을 불러오지 못했습니다: {error}</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-[#e6e9ee] bg-white px-4 py-3 text-[13px] text-slate-400">{loading ? '불러오는 중…' : '아직 올린 견적서가 없습니다.'}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-[#e6e9ee] bg-white">
          {items.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
              <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-slate-800">{f.fileName}</p>
                <p className="truncate text-[12px] text-slate-500">
                  {[f.company, f.quoteDate, f.quotedTotal ? manwonText(f.quotedTotal) : null, `${f.uploadedBy} · ${relativeTimeKo(f.createdAt)}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span
                className={`hidden flex-shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium sm:inline ${f.status === 'linked' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
              >
                {f.status === 'linked' ? `입력됨${f.dealId ? ` #${f.dealId}` : ''}` : '미입력'}
              </span>
              <a href={downloadUrl(f.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`${f.fileName} 내려받기`} title="내려받기">
                <Download className="h-4 w-4" />
              </a>
              {f.uploadedBy === me && (
                <button onClick={() => onDelete(f)} className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500" aria-label={`${f.fileName} 삭제`} title="삭제">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── 패널 ───────────────────────────────────────────────────────────────

export function QuoteIntakePanel({ isActive, userName, datasets, loadFreshDatasets, onDataChanged, panelCollapsed, onExpandPanel, onOpenList, onBack }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [relinking, setRelinking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [recent, setRecent] = useState<StoredFile[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const applyingRef = useRef(false);
  const datasetsRef = useRef(datasets);
  datasetsRef.current = datasets;

  const refreshRecent = useCallback(async () => {
    setRecentLoading(true);
    try {
      setRecent(await listRecentFiles(20));
      setRecentError(null);
    } catch (err) {
      setRecentError(toAiRequestError(err).message);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) refreshRecent();
  }, [isActive, refreshRecent]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async (file: File) => {
    if (stage.kind === 'uploading' || applyingRef.current) return;
    setError(null);
    if (!isPdf(file)) return setError('PDF 파일만 올릴 수 있습니다.');
    if (file.size > MAX_BYTES) return setError('파일이 너무 큽니다(20MB 이하).');
    if (file.size === 0) return setError('빈 파일입니다.');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStage({ kind: 'uploading', fileName: file.name, size: file.size, phase: 'starting', startedAt: Date.now() });
    // 매칭은 최신 딜·고객으로 — 판독하는 동안 함께 받아 둔다
    const fresh = loadFreshDatasets().catch(() => datasetsRef.current);
    try {
      const result = await uploadQuote(file, userName, (phase) => setStage((s) => (s.kind === 'uploading' ? { ...s, phase } : s)), ctrl.signal);
      const data = await fresh;
      if (ctrl.signal.aborted) return;
      setStage({ kind: 'review', result, data: { deals: data.deals, customers: data.customers, managers: data.managers, projects: data.projects } });
    } catch (err) {
      const e = toAiRequestError(err);
      setStage({ kind: 'idle' });
      if (e.code !== 'aborted') setError(e.message);
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      refreshRecent();
    }
  };

  const cancelUpload = () => abortRef.current?.abort();

  const link = async (result: UploadResult, applied: ApplyResult, customerId: number | null): Promise<string | null> => {
    try {
      await linkFile({
        id: result.file.id,
        company: applied.company,
        customerId,
        dealId: applied.dealId,
        applied: { mode: applied.created ? 'create' : 'update', dealId: applied.dealId, quotedTotal: result.extraction.quotedTotal, changes: applied.changes.filter((c) => c.changed) },
        userName,
      });
      return null;
    } catch (err) {
      return toAiRequestError(err).message;
    }
  };

  const apply = async (args: { company: string; dealId: number | null; manager: string }) => {
    if (stage.kind !== 'review' || applyingRef.current) return;
    applyingRef.current = true;
    setApplying(true);
    setError(null);
    const { result, data } = stage;
    try {
      const ex = { ...result.extraction, recipientCompany: args.company || result.extraction.recipientCompany };
      const applied = await applyQuote(ex, args.dealId, { fileName: result.file.fileName, manager: args.manager });
      const key = normalizeCompanyName(applied.company);
      const customer = data.customers.find((c) => normalizeCompanyName(c.company) === key);
      const customerId = customer ? Number(customer.id) : null;
      const linkError = await link(result, applied, customerId);
      setStage({ kind: 'done', result, applied, customerId, linkError });
      onDataChanged?.({ company: applied.company, dealId: applied.dealId, created: applied.created, dealSuccess: applied.dealSuccess });
      refreshRecent();
    } catch (err) {
      setError(errorText(err));
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  };

  const relink = async () => {
    if (stage.kind !== 'done') return;
    setRelinking(true);
    const linkError = await link(stage.result, stage.applied, stage.customerId);
    setStage((s) => (s.kind === 'done' ? { ...s, linkError } : s));
    setRelinking(false);
    if (!linkError) refreshRecent();
  };

  const remove = async (f: StoredFile) => {
    if (!window.confirm(`'${f.fileName}' 파일을 목록에서 삭제할까요?${f.status === 'linked' ? '\n이미 입력한 딜 값은 그대로 남습니다.' : ''}`)) return;
    try {
      await deleteFile(f.id, userName);
      setRecent((list) => list.filter((x) => x.id !== f.id));
    } catch (err) {
      setRecentError(null);
      setError(toAiRequestError(err).message);
    }
  };

  // 화면 어디에 놓아도 받는다 (브라우저가 PDF 를 열어 버리지 않게)
  const acceptsDrop = stage.kind === 'idle' || stage.kind === 'done';
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = acceptsDrop ? 'copy' : 'none';
    if (acceptsDrop && !dragging) setDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && acceptsDrop) start(f);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <IntakeHeader panelCollapsed={panelCollapsed} onExpandPanel={onExpandPanel} onOpenList={onOpenList} onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-8">
        <div className="mx-auto max-w-[800px] py-6 md:py-10">
          {stage.kind === 'idle' && (
            <div className="mb-6 text-center">
              <h2 className="bg-gradient-to-r from-[#8cc2f6] via-[#4a8ce8] to-[#2a5fc4] bg-clip-text text-[22px] font-bold leading-tight tracking-tight text-transparent break-keep text-balance md:text-[26px]">
                견적서를 올리면 딜·고객에 알아서 입력해드려요
              </h2>
              <p className="mx-auto mt-2 max-w-[560px] text-[13px] leading-relaxed text-slate-500 break-keep">
                AI가 견적서에서 고객사·금액·장비 대수를 읽고 맞는 작업건을 찾아 바뀔 값을 보여드려요. 확인 후 입력하면 원본 파일은 그 고객사에 보관됩니다.
              </p>
            </div>
          )}

          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p className="flex-1">{error}</p>
              <button onClick={() => setError(null)} className="rounded p-0.5 hover:bg-amber-100" aria-label="알림 닫기">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {stage.kind === 'idle' && <DropZone onFile={start} dragging={dragging} />}
          {stage.kind === 'uploading' && <ProgressCard stage={stage} onCancel={cancelUpload} />}
          {stage.kind === 'review' && (
            <ReviewCard
              key={stage.result.file.id}
              result={stage.result}
              data={stage.data}
              userName={userName}
              applying={applying}
              onCancel={() => {
                setError(null);
                setStage({ kind: 'idle' });
              }}
              onApply={apply}
            />
          )}
          {stage.kind === 'done' && (
            <>
              {dragging && <p className="mb-2 rounded-lg border-2 border-dashed border-[#5b9cf2] bg-[#f3f8ff] py-3 text-center text-[13px] font-medium text-[#1d4fb8]">놓으면 새 견적서를 읽습니다</p>}
              <DoneCard
                stage={stage}
                relinking={relinking}
                onRelink={relink}
                onNext={() => {
                  setError(null);
                  setStage({ kind: 'idle' });
                }}
              />
            </>
          )}

          <RecentFiles items={recent} loading={recentLoading} error={recentError} me={userName} onRefresh={refreshRecent} onDelete={remove} />
        </div>
      </div>
    </div>
  );
}
