// 견적서 입력 도우미 — PDF 를 여러 개(최대 10개) 올리면 Claude 가 3개씩 동시에 읽고(/api/files),
// 대상 딜별로 묶어(src/lib/ai/intakeBatch.ts) 목록으로 보여 준다. 분명한 건은 미리 체크되고, 애매한 건은 펼쳐서 확인한다.
// [선택한 N건 입력]은 묶음을 하나씩 차례로 반영한다 — 딜 PUT 이 행 전체를 덮어쓰므로 동시에 보내지 않는다.
// 파일은 R2 에 남아 고객 관리 상세(CustomerFiles)와 아래 최근 목록에서 내려받는다.
// AI 페이지가 대화 화면으로 바뀌어도 숨김으로 유지되므로 판독 중에 다른 화면을 봐도 이어진다.

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLast,
  Download,
  FileText,
  Info,
  Loader2,
  MessageSquare,
  PanelLeft,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { normalizeCompanyName } from '../../../lib/company';
import { toAiRequestError } from '../../../lib/ai/api';
import { deleteFile, downloadUrl, formatBytes, linkFile, listRecentFiles, uploadQuote, type StoredFile } from '../../../lib/ai/files';
import { formatKrw, kstYmd, prettyModelId, relativeTimeKo } from '../../../lib/ai/format';
import { candidateLabel, equipmentSummary, manwonText, planDeal, projectAmounts, serviceLabel, wonText } from '../../../lib/ai/intake';
import {
  defaultDecisions,
  MAX_BATCH,
  mergeExtractions,
  planRun,
  READ_CONCURRENCY,
  resolveBatch,
  runGroup,
  type BatchItem,
  type GroupPick,
  type GroupView,
  type ItemView,
  type MatchData,
} from '../../../lib/ai/intakeBatch';
import { INTAKE_AGENT } from '../../../lib/ai/personas';
import type { AiDatasets } from '../../../lib/ai/types';

const MAX_BYTES = 20 * 1024 * 1024;

export interface IntakeDataChange {
  company: string;
  dealId: number;
  created: boolean;
  dealSuccess: boolean;
  /** 이 딜에 연결한 파일 수 */
  files: number;
}

interface Props {
  /** AI 페이지가 보이고 도우미 화면이 열려 있음 */
  isActive: boolean;
  userName: string;
  datasets: AiDatasets;
  loadFreshDatasets: () => Promise<AiDatasets>;
  /** 반영이 끝나면 한 번 — App 이 딜(수주 딜이 있으면 고객·프로젝트도)을 다시 불러온다 */
  onDataChanged?: (changes: IntakeDataChange[]) => void;
  panelCollapsed: boolean;
  onExpandPanel: () => void;
  onOpenList: () => void;
  /** AI 대화 화면으로 */
  onBack: () => void;
}

const READING = ['queued', 'uploading', 'reading'];
/** 상한에 세는 항목 (끝났거나 빠진 항목은 세지 않는다) */
const ACTIVE = ['queued', 'uploading', 'reading', 'ready', 'applying', 'error'];

let keySeq = 0;
const newKey = () => `q${Date.now().toString(36)}${(keySeq++).toString(36)}`;

function errorText(err: unknown): string {
  if (err instanceof TypeError) return '네트워크 연결을 확인한 뒤 다시 시도하세요.';
  if (err instanceof Error && !(err instanceof DOMException) && !('code' in err)) return err.message;
  return toAiRequestError(err).message;
}

function isPdf(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function splitFiles(files: File[]): { pdfs: File[]; skipped: number } {
  return {
    pdfs: files.filter(isPdf).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    // .DS_Store 같은 숨김 파일은 세지 않는다
    skipped: files.filter((f) => !isPdf(f) && !f.name.startsWith('.')).length,
  };
}

/** 끌어놓은 파일·폴더에서 PDF 모으기 (폴더는 3단계까지) — entries 는 drop 이벤트 안에서 미리 꺼내 둔다 */
async function collectDropped(entries: (FileSystemEntry | null)[], loose: File[]): Promise<{ pdfs: File[]; skipped: number }> {
  if (!entries.some((e) => e?.isDirectory)) return splitFiles(loose);
  const files: File[] = [];
  const walk = async (entry: FileSystemEntry, depth: number): Promise<void> => {
    if (entry.isFile) {
      files.push(await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)));
    } else if (entry.isDirectory && depth < 3) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve) => reader.readEntries(resolve, () => resolve([])));
        if (!batch.length) break;
        for (const e of batch) await walk(e, depth + 1);
      }
    }
  };
  for (const e of entries) if (e) await walk(e, 0);
  return splitFiles(files);
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
      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-[#eef5ff] px-2 py-1 text-[13px] font-semibold text-[#1d4fb8]">
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        {INTAKE_AGENT.label}
      </span>
      <h1 className="hidden min-w-0 flex-1 truncate pl-1 text-[15px] font-semibold text-slate-800 sm:block">{INTAKE_AGENT.description}</h1>
      <span className="flex-1 sm:hidden" />
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        title="AI 대화 화면으로"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        AI 대화로
      </button>
    </div>
  );
}

// ─── 올리기 ─────────────────────────────────────────────────────────────

function FilePicker({ onFiles, children, className }: { onFiles: (files: File[]) => void; children: ReactNode; className: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button onClick={() => inputRef.current?.click()} className={className}>
        {children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (list.length) onFiles(list);
        }}
      />
    </>
  );
}

function DropZone({ onFiles, dragging }: { onFiles: (files: File[]) => void; dragging: boolean }) {
  return (
    <div
      className={`flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors md:py-12 ${
        dragging ? 'border-[#5b9cf2] bg-[#f3f8ff]' : 'border-[#d5dbe3] bg-white'
      }`}
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#eef5ff] text-[#3b82f6]">
        <Upload className="h-6 w-6" strokeWidth={1.9} />
      </span>
      <p className="mt-4 text-[16px] font-semibold text-slate-800">견적서 PDF를 끌어놓거나 선택하세요</p>
      <p className="mt-1 text-[14px] text-slate-500 break-keep">
        한 번에 최대 {MAX_BATCH}개 · 고객 폴더째 끌어놓아도 PDF만 골라 읽어요 · 파일당 20MB 이하
      </p>
      <FilePicker
        onFiles={onFiles}
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[#3b82f6] px-4 py-2 text-[15px] font-semibold text-white hover:bg-[#2f6fe0]"
      >
        <FileText className="h-4 w-4" />
        파일 선택
      </FilePicker>
    </div>
  );
}

// ─── 공용 조각 ──────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-[4.5rem] flex-shrink-0 pt-px text-[14px] text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-keep text-[16px] text-slate-800">{children}</dd>
    </div>
  );
}

const CONFIDENCE: Record<string, { text: string; cls: string }> = {
  high: { text: '판독 신뢰도 높음', cls: 'bg-emerald-50 text-emerald-700' },
  medium: { text: '판독 신뢰도 보통', cls: 'bg-amber-50 text-amber-700' },
  low: { text: '판독 신뢰도 낮음 — 값을 꼭 확인하세요', cls: 'bg-red-50 text-red-700' },
};

function Chip({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'blue' | 'amber' | 'green' | 'red' }) {
  const cls = {
    slate: 'bg-slate-100 text-slate-600',
    blue: 'bg-[#eef5ff] text-[#1d4fb8]',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
  }[tone];
  return <span className={`inline-flex flex-shrink-0 items-center rounded-md px-1.5 py-0.5 text-[12px] font-medium ${cls}`}>{children}</span>;
}

function targetText(item: BatchItem): string {
  return item.target === 'new' ? '새 딜' : `딜 #${item.target}`;
}

// ─── 판독 중·제외 항목 ──────────────────────────────────────────────────

const PHASE_TEXT: Record<string, string> = {
  queued: '대기',
  uploading: '올리는 중',
  reading: 'AI 판독 중',
  applying: '입력 중',
  rejected: '제외',
  duplicate: '중복',
  error: '오류',
};

function StatusRow({ item, onRetry, onRemove }: { item: BatchItem; onRetry: () => void; onRemove: () => void }) {
  const busy = READING.includes(item.phase) || item.phase === 'applying';
  const tone = item.phase === 'error' ? 'red' : item.phase === 'rejected' || item.phase === 'duplicate' ? 'slate' : 'blue';
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {busy ? <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-[#3b82f6]" /> : <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-slate-800">{item.fileName}</p>
        <p className={`text-[13px] break-keep ${item.phase === 'error' ? 'text-red-600' : 'text-slate-500'}`}>
          {item.message ?? (item.phase === 'queued' ? `${formatBytes(item.size)} · 차례를 기다리는 중` : formatBytes(item.size))}
        </p>
      </div>
      <Chip tone={tone}>{PHASE_TEXT[item.phase] ?? item.phase}</Chip>
      {item.phase === 'error' && item.file && (
        <button onClick={onRetry} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={`${item.fileName} 다시 시도`} title="다시 시도">
          <RotateCcw className="h-4 w-4" />
        </button>
      )}
      {item.phase !== 'applying' && (
        <button onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={`${item.fileName} 목록에서 빼기`} title={busy ? '취소' : '목록에서 빼기'}>
          <X className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

// ─── 확인 항목 ──────────────────────────────────────────────────────────

interface DetailProps {
  view: ItemView;
  group: GroupView;
  groupViews: ItemView[];
  data: MatchData;
  userName: string;
  disabled: boolean;
  runnable: boolean;
  onDecide: (p: Partial<Pick<BatchItem, 'company' | 'target' | 'manager'>>) => void;
  onRun: () => void;
}

function ItemDetail({ view, group, groupViews, data, userName, disabled, runnable, onDecide, onRun }: DetailProps) {
  const { item, ex, match } = view;
  const result = item.result!;
  const file = result.file;
  const deal = item.target === 'new' ? null : (data.deals.find((d) => Number(d.id) === item.target) ?? null);
  const selected = item.target === 'new' ? null : (match.candidates.find((c) => Number(c.deal.id) === item.target) ?? null);
  const managerNames = useMemo(
    () => [...new Set(data.managers.filter((m) => m.status !== 'leave').map((m) => String(m.name || '').trim()).filter(Boolean))],
    [data.managers],
  );
  const needsManager = !deal || !String(deal.salesManager || '').trim();
  const merging = group.pick === 'merge';
  const valuesEx = merging ? mergeExtractions(groupViews.map((v) => v.ex)) : ex;
  const plan =
    view.role === 'values'
      ? planDeal(valuesEx, deal, {
          fileName: merging ? `${groupViews.map((v) => v.item.fileName).join(' + ')} 합산` : item.fileName,
          manager: needsManager ? item.manager : '',
          today: kstYmd(),
        })
      : null;
  const changed = plan ? plan.changes.filter((c) => c.changed) : [];
  // 수주 딜의 프로젝트는 생성 후 갱신되지 않는다 — 견적서 금액과 다르면 함께 고친다 (applyQuote)
  const project = plan?.dealSuccess && deal ? data.projects.find((p) => Number(p.dealId) === Number(deal.id)) : undefined;
  const projectCurrent = project ? Number(project.quotationAmount) || 0 : 0;
  const projectFix = !!project && valuesEx.quotedTotal > 0 && projectCurrent !== valuesEx.quotedTotal;
  const confidence = CONFIDENCE[ex.confidence] ?? CONFIDENCE.medium;
  const customer = selected?.similar ? data.customers.find((c) => normalizeCompanyName(c.company) === normalizeCompanyName(selected.deal.company)) : match.customer;
  const valuesFrom = merging ? '합산' : groupViews.find((v) => v.role === 'values')?.item.fileName;

  return (
    <div className="border-t border-slate-100 bg-[#fbfcfd]">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 md:px-5">
        <a href={downloadUrl(file.id)} className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-blue-700 hover:underline" title="원본 내려받기">
          <Download className="h-3.5 w-3.5" />
          원본
        </a>
        <span className={`rounded-md px-2 py-0.5 text-[12px] font-medium ${confidence.cls}`}>{confidence.text}</span>
        {result.duplicate && (
          <span className="text-[13px] text-slate-500">
            {file.status === 'linked'
              ? `이미 입력한 견적서 (${file.linkedBy ?? file.uploadedBy}님${file.linkedAt ? `, ${relativeTimeKo(file.linkedAt)}` : ''}${file.dealId ? `, 딜 #${file.dealId}` : ''})`
              : `${file.uploadedBy}님이 ${relativeTimeKo(file.createdAt)} 올린 파일 — 이전 판독 결과를 다시 사용`}
          </span>
        )}
      </div>

      <div className="grid gap-x-8 px-4 py-2 md:grid-cols-2 md:px-5">
        <dl>
          <Row label="수신">{ex.recipientCompany || '-'}</Row>
          <Row label="담당자">{[ex.contactName, ex.contactPosition].filter(Boolean).join(' ') || '-'}</Row>
          <Row label="견적일">
            {ex.quoteDate || '-'}
            {ex.validDays ? <span className="text-slate-400"> · 유효 {ex.validDays}일</span> : null}
            {ex.revision > 1 ? <span className="text-slate-400"> · {ex.revision}차</span> : null}
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

      {view.reviewReasons.length > 0 && (
        <div className="mx-4 mb-2 flex flex-wrap items-center gap-1.5 md:mx-5">
          <span className="text-[13px] font-medium text-amber-700">확인할 점</span>
          {view.reviewReasons.map((r) => (
            <Chip key={r} tone="amber">
              {r}
            </Chip>
          ))}
        </div>
      )}

      <div className="border-t border-slate-100 px-4 py-3 md:px-5">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-[13px] text-slate-500">고객사</span>
            <input
              value={item.company}
              onChange={(e) => onDecide({ company: e.target.value })}
              maxLength={100}
              disabled={disabled}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] text-slate-800 focus:border-[#5b9cf2] focus:outline-none disabled:opacity-60"
            />
            <span className="mt-1 block text-[13px] text-slate-500">
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
                <span className="text-[13px] text-slate-400">비슷한 이름:</span>
                {match.similarCompanies.map((n) => (
                  <button key={n} onClick={() => onDecide({ company: n })} disabled={disabled} className="rounded border border-slate-200 bg-white px-1.5 text-[13px] text-slate-600 hover:border-[#5b9cf2] hover:text-blue-700">
                    {n}
                  </button>
                ))}
              </span>
            )}
          </label>
          <label className="block">
            <span className="text-[13px] text-slate-500">작업건(딜)</span>
            <select
              value={String(item.target)}
              onChange={(e) => onDecide({ target: e.target.value === 'new' ? 'new' : Number(e.target.value) })}
              disabled={disabled}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] text-slate-800 focus:border-[#5b9cf2] focus:outline-none disabled:opacity-60"
            >
              {match.candidates.map((c) => (
                <option key={c.deal.id} value={String(c.deal.id)}>
                  {candidateLabel(c)}
                </option>
              ))}
              {item.target !== 'new' && !selected && <option value={String(item.target)}>#{item.target} (직접 고른 딜)</option>}
              <option value="new">＋ 새 딜로 등록 (견적서 발송 단계)</option>
            </select>
            <span className="mt-1 block text-[13px] text-slate-500 break-keep">
              {selected ? selected.reasons.join(' · ') || '같은 회사의 딜' : (match.note ?? '맞는 딜이 없어 새 딜로 등록합니다 (문의일 = 견적일)')}
            </span>
          </label>
          {view.role === 'values' && needsManager && (
            <label className="block">
              <span className="text-[13px] text-slate-500">고객책임자</span>
              <select
                value={item.manager}
                onChange={(e) => onDecide({ manager: e.target.value })}
                disabled={disabled}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] text-slate-800 focus:border-[#5b9cf2] focus:outline-none disabled:opacity-60"
              >
                <option value="">지정 안 함</option>
                {managerNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                    {n === userName ? ' (나)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 px-4 py-3 md:px-5">
        {plan ? (
          <>
            <p className="text-[14px] font-semibold text-slate-900">
              {plan.mode === 'create' ? '새로 등록할 값' : '바뀌는 값'}
              {merging && <span className="ml-1.5 text-[13px] font-normal text-slate-500">(견적서 {groupViews.length}건 합산)</span>}
            </p>
            <table className="mt-2 w-full text-left text-[15px]">
              <thead>
                <tr className="border-b border-slate-100 text-[13px] text-slate-500">
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
                      {c.note && c.changed && <span className="ml-1 text-[12px] font-normal text-slate-400">({c.note})</span>}
                    </td>
                  </tr>
                ))}
                {projectFix && (
                  <tr className="align-top">
                    <td className="whitespace-nowrap py-1.5 pr-3 text-slate-500">프로젝트 견적</td>
                    <td className="py-1.5 pr-3 text-slate-400 line-through decoration-slate-300">{wonText(projectCurrent) || '0원'}</td>
                    <td className="py-1.5 font-medium text-slate-900">
                      {wonText(valuesEx.quotedTotal)}
                      <span className="block text-[12px] font-normal text-slate-400 sm:ml-1 sm:inline">(순매출 {wonText(projectAmounts(valuesEx.quotedTotal).netRevenue)})</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <ul className="mt-2 space-y-1 text-[13px] text-slate-500">
              {plan.mode === 'update' && changed.length === 0 ? (
                <li>딜 값은 이미 견적서와 같습니다. 입력하면 관리 메모에 “견적서 반영” 한 줄을 남기고 파일을 이 고객사에 보관합니다.</li>
              ) : (
                <li>관리 메모 끝에 “견적서 반영” 한 줄을 덧붙이고, 파일은 이 고객사에 보관됩니다.</li>
              )}
              {plan.dealSuccess && changed.length > 0 && <li className="text-slate-600">수주된 딜이라 고객 작업 이력도 함께 갱신됩니다.</li>}
              {projectFix && <li className="text-slate-600">프로젝트 관리의 견적·부가세·순매출을 견적서 금액으로 고칩니다 (인건비율·순익은 서버가 다시 계산).</li>}
            </ul>
          </>
        ) : (
          <p className="flex items-start gap-1.5 text-[14px] text-slate-600 break-keep">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
            {group.pick === null
              ? '이 묶음은 딜에 넣을 견적서를 먼저 골라야 합니다 (위 묶음 선택).'
              : `이 견적서는 딜 값을 바꾸지 않고 ${targetText(item)}에 파일로만 보관합니다. 딜 값은 ${valuesFrom ?? '선택한 견적'} 기준입니다.`}
          </p>
        )}
        {ex.warnings.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            {ex.warnings.map((w) => (
              <li key={w} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-4 py-2.5 md:px-5">
        {result.model && (
          <span className="mr-auto text-[12px] text-slate-400">
            {prettyModelId(result.model)} 판독{result.costUsd ? ` · ${formatKrw(result.costUsd)}` : ''}
          </span>
        )}
        <button
          onClick={onRun}
          disabled={disabled || !runnable}
          title={runnable ? undefined : '체크한 견적서가 없거나 묶음 선택이 필요합니다'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#3b82f6] px-3 py-1.5 text-[14px] font-semibold text-[#2f6fe0] hover:bg-[#f3f8ff] disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-transparent"
        >
          <Check className="h-4 w-4" />
          {group.itemKeys.length > 1 ? '이 묶음만 입력' : '이 견적서만 입력'}
        </button>
      </div>
    </div>
  );
}

function ItemRow({
  view,
  expanded,
  onToggleExpand,
  onCheck,
  disabled,
  children,
}: {
  view: ItemView;
  expanded: boolean;
  onToggleExpand: () => void;
  onCheck: (checked: boolean) => void;
  disabled: boolean;
  children: ReactNode;
}) {
  const { item, ex } = view;
  const status = view.blocked ? (
    <Chip>선택 필요</Chip>
  ) : view.reviewReasons.length ? (
    <Chip tone="amber">확인 필요 {view.reviewReasons.length}</Chip>
  ) : (
    <Chip tone="green">분명</Chip>
  );
  return (
    <li>
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={view.checked}
          disabled={disabled || !!view.blocked}
          onChange={(e) => onCheck(e.target.checked)}
          className="h-4 w-4 flex-shrink-0 accent-[#3b82f6]"
          aria-label={`${item.fileName} 입력에 포함`}
        />
        <button onClick={onToggleExpand} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={expanded}>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[15px] font-medium text-slate-800">{item.fileName}</span>
              {ex.revision > 1 && <Chip tone="blue">{ex.revision}차</Chip>}
              {ex.variantLabel && <Chip>{ex.variantLabel}</Chip>}
            </span>
            <span className="block truncate text-[13px] text-slate-500">
              {item.company || ex.recipientCompany || '회사명 없음'} → {targetText(item)} · {ex.quotedTotal ? manwonText(ex.quotedTotal) : '금액 없음'} ·{' '}
              {view.role === 'values' ? '딜 값 반영' : '파일만 보관'}
            </span>
          </span>
          {status}
          <ChevronDown className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {expanded && children}
    </li>
  );
}

function GroupHeader({ group, views, disabled, onPick }: { group: GroupView; views: ItemView[]; disabled: boolean; onPick: (pick: GroupPick) => void }) {
  return (
    <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-[14px] font-semibold text-slate-800">
        {group.label} — 견적서 {views.length}건
      </p>
      {group.note && <p className="mt-0.5 text-[13px] text-slate-500 break-keep">{group.note}</p>}
      <label className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
        딜에 넣을 견적
        <select
          value={group.pick ?? ''}
          onChange={(e) => onPick(e.target.value === '' ? null : e.target.value)}
          disabled={disabled}
          className={`min-w-0 max-w-full rounded-lg border bg-white px-2.5 py-1.5 text-[14px] text-slate-800 focus:border-[#5b9cf2] focus:outline-none ${group.pick === null ? 'border-amber-300' : 'border-slate-200'}`}
        >
          <option value="">고르세요</option>
          {views.map((v) => (
            <option key={v.item.key} value={v.item.key}>
              {v.item.fileName} · {v.ex.quotedTotal ? manwonText(v.ex.quotedTotal) : '금액 없음'}
              {v.item.key === group.defaultPick ? ' (기본)' : ''}
            </option>
          ))}
          <option value="merge">합산 — 현장별 견적을 모두 더함{group.suggestMerge ? ' (권장)' : ''}</option>
        </select>
      </label>
    </div>
  );
}

// ─── 완료 항목 ──────────────────────────────────────────────────────────

function DoneRow({ item, expanded, onToggle, onRelink, relinking }: { item: BatchItem; expanded: boolean; onToggle: () => void; onRelink: () => void; relinking: boolean }) {
  const a = item.applied!;
  const changed = a.changes.filter((c) => c.changed);
  return (
    <li>
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={expanded}>
        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-slate-800">{item.fileName}</span>
          <span className="block truncate text-[13px] text-slate-500">
            {a.company} → {a.created ? `새 딜 #${a.dealId}` : `딜 #${a.dealId}`} · {a.role === 'values' ? (a.merged > 1 ? `합산 ${a.merged}건으로 반영` : '딜 값 반영') : '파일만 보관'}
          </span>
        </span>
        {a.linkError || a.syncFailed || a.projectError ? <Chip tone="amber">확인 필요</Chip> : <Chip tone="green">입력됨</Chip>}
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-slate-100 bg-[#fbfcfd] px-4 py-3 text-[13px] md:px-5">
          {changed.length > 0 && (
            <ul className="space-y-1 text-[14px]">
              {changed.map((c) => (
                <li key={c.label} className="flex gap-3">
                  <span className="w-[4.5rem] flex-shrink-0 text-slate-500">{c.label}</span>
                  <span className="min-w-0 flex-1 text-slate-800">{c.next}</span>
                </li>
              ))}
            </ul>
          )}
          {a.role === 'values' && changed.length === 0 && <p className="text-slate-500">딜 값은 그대로이고 관리 메모에 한 줄을 남겼습니다.</p>}
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
          {a.linkError ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="min-w-0 flex-1">파일을 고객사에 연결하지 못했습니다: {a.linkError}</span>
              <button onClick={onRelink} disabled={relinking} className="rounded-md border border-amber-300 bg-white px-2 py-0.5 font-medium hover:bg-amber-100 disabled:opacity-50">
                {relinking ? '연결 중…' : '다시 연결'}
              </button>
            </div>
          ) : (
            <p className="text-slate-500">원본 파일은 고객 관리 › {a.company} 상세(고객으로 등록된 경우)와 아래 최근 목록에서 내려받을 수 있습니다.</p>
          )}
        </div>
      )}
    </li>
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
        <h2 className="text-[14px] font-semibold text-slate-900">최근 올린 견적서</h2>
        <button onClick={onRefresh} disabled={loading} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50" aria-label="목록 새로고침" title="새로고침">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {error ? (
        <p className="rounded-xl border border-[#e6e9ee] bg-white px-4 py-3 text-[14px] text-slate-500">목록을 불러오지 못했습니다: {error}</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-[#e6e9ee] bg-white px-4 py-3 text-[14px] text-slate-400">{loading ? '불러오는 중…' : '아직 올린 견적서가 없습니다.'}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-[#e6e9ee] bg-white">
          {items.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
              <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-slate-800">{f.fileName}</p>
                <p className="truncate text-[13px] text-slate-500">
                  {[f.company, f.quoteDate, f.quotedTotal ? manwonText(f.quotedTotal) : null, `${f.uploadedBy} · ${relativeTimeKo(f.createdAt)}`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span
                className={`hidden flex-shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-medium sm:inline ${f.status === 'linked' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
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
  const [items, setItems] = useState<BatchItem[]>([]);
  const [picks, setPicks] = useState<Record<string, GroupPick>>({});
  const [data, setData] = useState<MatchData | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [relinking, setRelinking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [recent, setRecent] = useState<StoredFile[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const datasetsRef = useRef(datasets);
  datasetsRef.current = datasets;
  const dataPromise = useRef<Promise<MatchData> | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const started = useRef(new Set<string>());
  const runningRef = useRef(false);

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

  useEffect(() => {
    const ctrls = controllers.current;
    return () => ctrls.forEach((c) => c.abort());
  }, []);

  // 매칭은 최신 딜·고객으로 — 판독하는 동안 받아 둔다
  const ensureData = useCallback(
    (fresh = false): Promise<MatchData> => {
      if (!dataPromise.current || fresh) {
        dataPromise.current = loadFreshDatasets()
          .catch(() => datasetsRef.current)
          .then((d) => {
            const m: MatchData = { deals: d.deals, customers: d.customers, managers: d.managers, projects: d.projects };
            setData(m);
            return m;
          });
      }
      return dataPromise.current;
    },
    [loadFreshDatasets],
  );

  const patch = useCallback((key: string, p: Partial<BatchItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i))), []);

  const read = useCallback(
    async (key: string) => {
      const it = itemsRef.current.find((i) => i.key === key);
      if (!it?.file || started.current.has(key)) return;
      started.current.add(key);
      const ctrl = new AbortController();
      controllers.current.set(key, ctrl);
      patch(key, { phase: 'uploading', message: null });
      try {
        const result = await uploadQuote(it.file, userName, (phase) => patch(key, { phase: phase === 'reading' ? 'reading' : 'uploading' }), ctrl.signal);
        const dup = itemsRef.current.find((o) => o.key !== key && o.result?.file.id === result.file.id && o.phase !== 'error');
        if (dup) {
          patch(key, { phase: 'duplicate', message: `같은 파일이 이미 목록에 있습니다 (${dup.fileName})`, file: null });
          return;
        }
        const d = await ensureData();
        if (ctrl.signal.aborted) return;
        patch(key, { phase: 'ready', result, file: null, ...defaultDecisions(result, result.extraction.recipientCompany, d, userName), touched: false, checkedOverride: null });
      } catch (err) {
        const e = toAiRequestError(err);
        if (e.code === 'aborted') patch(key, { phase: 'error', message: '취소했습니다.' });
        else if (e.code === 'not_quote') patch(key, { phase: 'rejected', message: e.message, file: null });
        else patch(key, { phase: 'error', message: e.message });
      } finally {
        controllers.current.delete(key);
        started.current.delete(key);
      }
    },
    [ensureData, patch, userName],
  );

  // 동시 판독 상한까지 차례로 시작
  useEffect(() => {
    let slots = READ_CONCURRENCY - items.filter((i) => i.phase === 'uploading' || i.phase === 'reading').length;
    for (const i of items) {
      if (slots <= 0) break;
      if (i.phase === 'queued' && !started.current.has(i.key)) {
        slots--;
        void read(i.key);
      }
    }
  }, [items, read]);

  const addFiles = (pdfs: File[], skipped: number) => {
    setError(null);
    const notes: string[] = [];
    if (skipped) notes.push(`PDF가 아닌 파일 ${skipped}개는 뺐습니다.`);
    const tooBig = pdfs.filter((f) => f.size > MAX_BYTES).length;
    if (tooBig) notes.push(`20MB가 넘는 파일 ${tooBig}개는 뺐습니다.`);
    const current = itemsRef.current;
    const listed = (f: File) => current.some((i) => i.fileName === f.name.normalize('NFC') && i.size === f.size && i.phase !== 'error');
    let ok = pdfs.filter((f) => f.size > 0 && f.size <= MAX_BYTES && !listed(f));
    const already = pdfs.length - tooBig - ok.length - pdfs.filter((f) => f.size === 0).length;
    if (already > 0) notes.push(`이미 목록에 있는 파일 ${already}개는 뺐습니다.`);
    const active = current.filter((i) => ACTIVE.includes(i.phase)).length;
    const room = Math.max(0, MAX_BATCH - active);
    if (ok.length > room) {
      notes.push(`한 번에 최대 ${MAX_BATCH}개까지입니다 — ${ok.length - room}개는 담지 못했습니다. 입력을 마친 뒤 이어서 올려 주세요.`);
      ok = ok.slice(0, room);
    }
    setNotice(notes.length ? notes.join(' ') : null);
    if (!ok.length) return;
    void ensureData(active === 0);
    setItems((list) => [
      ...list,
      ...ok.map(
        (f): BatchItem => ({
          key: newKey(),
          file: f,
          // macOS 파일명은 NFD(자모 분리)일 수 있다 — 화면·중복 비교는 NFC 로 (서버도 NFC 로 저장)
          fileName: f.name.normalize('NFC'),
          size: f.size,
          phase: 'queued',
          message: null,
          result: null,
          company: '',
          target: 'new',
          manager: '',
          touched: false,
          checkedOverride: null,
          applied: null,
        }),
      ),
    ]);
  };

  const onPicked = (files: File[]) => {
    const { pdfs, skipped } = splitFiles(files);
    addFiles(pdfs, skipped);
  };

  const remove = (key: string) => {
    controllers.current.get(key)?.abort();
    setItems((list) => list.filter((i) => i.key !== key));
  };

  const clearAll = () => {
    if (runningRef.current) return;
    controllers.current.forEach((c) => c.abort());
    setItems([]);
    setPicks({});
    setExpanded(new Set());
    setNotice(null);
    setError(null);
  };

  const decide = (key: string, p: Partial<Pick<BatchItem, 'company' | 'target' | 'manager'>>) => {
    setItems((list) =>
      list.map((i) => {
        if (i.key !== key) return i;
        let next: BatchItem = { ...i, ...p, touched: true };
        // 회사명을 고치면 후보가 바뀐다 → 대상·책임자 기본값을 다시
        if (p.company !== undefined && data && i.result) next = { ...next, ...defaultDecisions(i.result, p.company, data, userName) };
        return next;
      }),
    );
  };

  const toggleExpand = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const resolution = useMemo(() => (data ? resolveBatch(items, picks, data) : { groups: [], views: {} }), [items, picks, data]);
  const fullPlan = useMemo(() => planRun(resolution), [resolution]);
  const selectedFiles = fullPlan.reduce((a, p) => a + p.files.length, 0);

  const counts = useMemo(() => {
    const views = Object.values(resolution.views);
    return {
      reading: items.filter((i) => READING.includes(i.phase)).length,
      review: views.filter((v) => !v.checked).length,
      done: items.filter((i) => i.phase === 'done').length,
      excluded: items.filter((i) => i.phase === 'rejected' || i.phase === 'duplicate').length,
    };
  }, [items, resolution]);

  const run = async (groupKeys?: string[]) => {
    if (runningRef.current) return;
    const plan = planRun(resolution, groupKeys);
    if (!plan.length) return;
    runningRef.current = true;
    setRunning({ done: 0, total: plan.length });
    setError(null);
    const d = await ensureData();
    const changes: IntakeDataChange[] = [];
    let failed = 0;
    for (const [idx, rg] of plan.entries()) {
      const keys = rg.files.map((v) => v.item.key);
      setItems((list) => list.map((i) => (keys.includes(i.key) ? { ...i, phase: 'applying', message: null } : i)));
      try {
        const out = await runGroup(rg, { userName, customers: d.customers });
        setItems((list) =>
          list.map((i) => {
            if (!keys.includes(i.key)) return i;
            const role = rg.files.find((v) => v.item.key === i.key)!.role;
            const a = out.applied;
            return {
              ...i,
              phase: 'done',
              applied: {
                dealId: out.dealId,
                company: out.company,
                role,
                created: out.created,
                dealSuccess: out.dealSuccess,
                syncFailed: !!a?.syncFailed,
                projectUpdated: role === 'values' && !!a?.projectUpdated,
                projectError: role === 'values' ? (a?.projectError ?? null) : null,
                changes: role === 'values' && a ? a.changes : [],
                linkError: out.linkErrors[i.key] ?? null,
                merged: rg.values.length,
              },
            };
          }),
        );
        changes.push({ company: out.company, dealId: out.dealId, created: out.created, dealSuccess: out.dealSuccess, files: rg.files.length });
      } catch (err) {
        failed++;
        const msg = errorText(err);
        setItems((list) => list.map((i) => (keys.includes(i.key) ? { ...i, phase: 'ready', message: `입력하지 못했습니다: ${msg}` } : i)));
      }
      setRunning({ done: idx + 1, total: plan.length });
    }
    runningRef.current = false;
    setRunning(null);
    if (changes.length) onDataChanged?.(changes);
    if (failed) setError(`${failed}개 묶음을 입력하지 못했습니다 — 항목을 펼쳐 확인한 뒤 다시 시도하세요.`);
    refreshRecent();
    // 남은 항목은 최신 데이터로 다시 매칭 (방금 만든 새 딜 등)
    const fresh = await ensureData(true);
    setItems((list) =>
      list.map((i) => (i.phase === 'ready' && i.result && !i.touched ? { ...i, ...defaultDecisions(i.result, i.company || i.result.extraction.recipientCompany, fresh, userName) } : i)),
    );
  };

  const relink = async (key: string) => {
    const it = itemsRef.current.find((i) => i.key === key);
    if (!it?.applied || !it.result) return;
    setRelinking(key);
    const d = await ensureData();
    const customer = d.customers.find((c) => normalizeCompanyName(c.company) === normalizeCompanyName(it.applied!.company));
    try {
      await linkFile({
        id: it.result.file.id,
        company: it.applied.company,
        customerId: customer ? Number(customer.id) : null,
        dealId: it.applied.dealId,
        applied: { role: it.applied.role, dealId: it.applied.dealId, relinked: true },
        userName,
      });
      patch(key, { applied: { ...it.applied, linkError: null } });
      refreshRecent();
    } catch (err) {
      patch(key, { applied: { ...it.applied, linkError: toAiRequestError(err).message } });
    } finally {
      setRelinking(null);
    }
  };

  const removeRecent = async (f: StoredFile) => {
    if (!window.confirm(`'${f.fileName}' 파일을 목록에서 삭제할까요?${f.status === 'linked' ? '\n이미 입력한 딜 값은 그대로 남습니다.' : ''}`)) return;
    try {
      await deleteFile(f.id, userName);
      setRecent((list) => list.filter((x) => x.id !== f.id));
    } catch (err) {
      setError(toAiRequestError(err).message);
    }
  };

  // 화면 어디에 놓아도 받는다 (브라우저가 PDF 를 열어 버리지 않게)
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = running ? 'none' : 'copy';
    if (!running && !dragging) setDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragging(false);
    if (running) return;
    // 이벤트가 끝나면 목록을 읽을 수 없으므로 먼저 꺼낸다
    const entries = Array.from(e.dataTransfer.items ?? []).map((i) => (typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null));
    const loose = Array.from(e.dataTransfer.files ?? []);
    void collectDropped(entries, loose)
      .then(({ pdfs, skipped }) => addFiles(pdfs, skipped))
      .catch(() => setError('끌어놓은 파일을 읽지 못했습니다. 파일 선택으로 다시 시도해 주세요.'));
  };

  const statusItems = items.filter((i) => READING.includes(i.phase) || ['rejected', 'duplicate', 'error', 'applying'].includes(i.phase));
  const doneItems = items.filter((i) => i.phase === 'done');
  const readyCount = Object.keys(resolution.views).length;
  // 한 건만 확인할 때는 바로 펼친다
  const autoExpand = readyCount === 1 && items.filter((i) => ACTIVE.includes(i.phase)).length === 1;
  const room = MAX_BATCH - items.filter((i) => ACTIVE.includes(i.phase)).length;
  const busy = !!running;

  return (
    <div className="flex min-h-0 flex-1 flex-col" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <IntakeHeader panelCollapsed={panelCollapsed} onExpandPanel={onExpandPanel} onOpenList={onOpenList} onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-8">
        <div className="mx-auto max-w-[800px] py-6 md:py-10">
          {items.length === 0 && (
            <div className="mb-6 text-center">
              <h2 className="bg-gradient-to-r from-[#8cc2f6] via-[#4a8ce8] to-[#2a5fc4] bg-clip-text text-[24px] font-bold leading-tight tracking-tight text-transparent break-keep text-balance md:text-[28px]">
                견적서를 올리면 딜·고객에 알아서 입력해드려요
              </h2>
              <p className="mx-auto mt-2 max-w-[560px] text-[14px] leading-relaxed text-slate-500 break-keep">
                여러 견적서를 한 번에 올려도 돼요. AI가 고객사·금액·장비 대수를 읽고 맞는 작업건을 찾아, 차수 견적은 최신 것으로 정리하고 확인이 필요한 건만 따로 보여드려요.
              </p>
            </div>
          )}

          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[14px] text-amber-800" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p className="flex-1">{error}</p>
              <button onClick={() => setError(null)} className="rounded p-0.5 hover:bg-amber-100" aria-label="알림 닫기">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {notice && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-600" role="status">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <p className="flex-1 break-keep">{notice}</p>
              <button onClick={() => setNotice(null)} className="rounded p-0.5 hover:bg-slate-100" aria-label="안내 닫기">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {items.length === 0 ? (
            <DropZone onFiles={onPicked} dragging={dragging} />
          ) : (
            <>
              <div className="sticky top-0 z-10 -mx-1 mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-white/95 px-1 py-2 backdrop-blur">
                <p className="min-w-0 flex-1 text-[14px] text-slate-600 break-keep">
                  <span className="font-semibold text-slate-900">견적서 {items.length}건</span>
                  {[
                    counts.reading ? `판독 중 ${counts.reading}` : null,
                    counts.review ? `확인 필요 ${counts.review}` : null,
                    counts.done ? `완료 ${counts.done}` : null,
                    counts.excluded ? `제외 ${counts.excluded}` : null,
                  ]
                    .filter(Boolean)
                    .map((t) => ` · ${t}`)
                    .join('')}
                </p>
                <button onClick={clearAll} disabled={busy} className="rounded-lg px-3 py-2 text-[14px] font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                  목록 비우기
                </button>
                <button
                  onClick={() => run()}
                  disabled={busy || counts.reading > 0 || selectedFiles === 0}
                  title={counts.reading > 0 ? '판독이 모두 끝나면 입력할 수 있어요' : undefined}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b82f6] px-4 py-2 text-[15px] font-semibold text-white hover:bg-[#2f6fe0] disabled:cursor-not-allowed disabled:bg-[#b9d3f8]"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {busy ? `입력 중 ${running!.done}/${running!.total}` : `선택한 ${selectedFiles}건 입력`}
                </button>
              </div>

              {statusItems.length > 0 && (
                <ul className="mb-3 divide-y divide-slate-100 rounded-xl border border-[#e6e9ee] bg-white" aria-live="polite">
                  {statusItems.map((i) => (
                    <StatusRow key={i.key} item={i} onRetry={() => patch(i.key, { phase: 'queued', message: null })} onRemove={() => remove(i.key)} />
                  ))}
                </ul>
              )}

              {data &&
                resolution.groups.map((g) => {
                  const gViews = g.itemKeys.map((k) => resolution.views[k]).filter(Boolean);
                  const runnable = !busy && counts.reading === 0 && planRun(resolution, [g.key]).length > 0;
                  return (
                    <section key={g.key} className="mb-3 overflow-hidden rounded-xl border border-[#e6e9ee] bg-white">
                      {gViews.length > 1 && <GroupHeader group={g} views={gViews} disabled={busy} onPick={(p) => setPicks((s) => ({ ...s, [g.key]: p }))} />}
                      <ul className="divide-y divide-slate-100">
                        {gViews.map((v) => (
                          <ItemRow
                            key={v.item.key}
                            view={v}
                            expanded={autoExpand || expanded.has(v.item.key)}
                            onToggleExpand={() => toggleExpand(v.item.key)}
                            onCheck={(c) => patch(v.item.key, { checkedOverride: c })}
                            disabled={busy}
                          >
                            <ItemDetail
                              view={v}
                              group={g}
                              groupViews={gViews.filter((x) => x.role === 'values' || g.pick !== 'merge' || x === v)}
                              data={data}
                              userName={userName}
                              disabled={busy}
                              runnable={runnable}
                              onDecide={(p) => decide(v.item.key, p)}
                              onRun={() => run([g.key])}
                            />
                            {v.item.message && <p className="border-t border-slate-100 px-4 py-2 text-[13px] text-red-600 md:px-5">{v.item.message}</p>}
                          </ItemRow>
                        ))}
                      </ul>
                    </section>
                  );
                })}

              {doneItems.length > 0 && (
                <ul className="mb-3 divide-y divide-slate-100 rounded-xl border border-[#e6e9ee] bg-white" aria-label="입력한 견적서">
                  {doneItems.map((i) => (
                    <DoneRow key={i.key} item={i} expanded={expanded.has(i.key)} onToggle={() => toggleExpand(i.key)} onRelink={() => relink(i.key)} relinking={relinking === i.key} />
                  ))}
                </ul>
              )}

              {room > 0 && !busy && (
                <div
                  className={`flex flex-wrap items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 text-[14px] text-slate-500 ${
                    dragging ? 'border-[#5b9cf2] bg-[#f3f8ff]' : 'border-[#d5dbe3]'
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  <span className="break-keep">견적서를 더 끌어놓거나</span>
                  <FilePicker onFiles={onPicked} className="font-semibold text-[#2f6fe0] hover:underline">
                    파일 선택
                  </FilePicker>
                  <span className="text-slate-400">({room}개 더 가능)</span>
                </div>
              )}
            </>
          )}

          <RecentFiles items={recent} loading={recentLoading} error={recentError} me={userName} onRefresh={refreshRecent} onDelete={removeRecent} />
        </div>
      </div>
    </div>
  );
}
