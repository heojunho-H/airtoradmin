// 견적서 입력 도우미 · 고객사 파일 — /api/files 클라이언트 (서버: functions/api/files.ts)
// 고객사 파일: 고객 상세·영업 딜 상세에서 직접 올리고(판독 없음) 나중에 내려받는다 — CompanyFiles.tsx

import { AiRequestError, getJson, postJson, streamSseFetch } from './api';

export const FILES_ENDPOINT = '/api/files';

export interface StoredFile {
  id: string;
  /** quote(견적서 도우미) | file(직접 올린 고객사 파일) */
  kind: string;
  fileName: string;
  /** 서버가 확장자로 정한 형식 — 보기(새 탭) 가능 여부 판단 */
  contentType?: string;
  size: number;
  company: string | null;
  status: 'uploaded' | 'linked' | string;
  customerId: number | null;
  dealId: number | null;
  uploadedBy: string;
  createdAt: string;
  linkedAt: string | null;
  linkedBy: string | null;
  quoteDate: string | null;
  quotedTotal: number | null;
  totalQuantity: number | null;
  serviceName: string | null;
}

/** 서버 판독 결과 (functions/_lib/ai-files.ts QuoteExtraction 과 같은 모양) */
export interface QuoteExtraction {
  documentType: 'quote' | 'other';
  otherKind: string;
  supplierName: string;
  issuedByAirtor: boolean;
  recipientCompany: string;
  contactName: string;
  contactPosition: string;
  quoteDate: string;
  validDays: number;
  /** 견적 차수 (문서·파일명 "N차견적서" 중 큰 값, 없으면 1) */
  revision: number;
  /** 현장·지점·안 구분 라벨 (예: 김포, 스탠드) */
  variantLabel: string;
  quoteCount: number;
  /** quotedTotal 의 기준 — one_off(1회 작업)가 아니면 확인 필요 */
  pricingBasis: 'one_off' | 'per_visit' | 'monthly' | 'annual' | 'multi_year';
  serviceName: string;
  serviceCategory: string;
  /** 영업 화면 상세 수량 키(한글) → 대수 */
  equipment: Record<string, number>;
  otherItems: { name: string; quantity: number }[];
  totalQuantity: number;
  lineItems: { name: string; unitPrice: number; quantity: number; supplyAmount: number; taxAmount: number; total: number }[];
  supplyTotal: number;
  taxTotal: number;
  quotedTotal: number;
  vatIncluded: boolean;
  notes: string[];
  plannedCrew: { role: string; count: number }[];
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
  /** 서버가 판정한 확인 필요 사유 (functions/_lib/ai-files.ts QUOTE_FLAGS) */
  flags: string[];
}

/** 확인 필요 사유 → 화면 문구 */
export const FLAG_LABELS: Record<string, string> = {
  multi_quote: '한 파일에 견적서 여러 개',
  vat_excluded: 'VAT 별도·면세 금액',
  recurring: '정기·회당 금액(1회 작업 아님)',
  no_date: '견적일 없음',
  no_amount: '총 견적 금액 없음',
  no_company: '수신 회사명 없음',
  qty_mismatch: '종류별 대수 합 ≠ 총 수량',
  amount_mismatch: '품목 합계와 총액 차이 큼',
};

export interface UploadResult {
  file: StoredFile;
  extraction: QuoteExtraction;
  duplicate: boolean;
  model: string | null;
  costUsd: number;
}

export type UploadPhase = 'uploading' | 'duplicate' | 'reading';

/** 업로드 + 판독 (SSE). 판독은 PDF 크기에 따라 수십 초 걸린다. */
export async function uploadQuote(file: File, userName: string, onPhase: (phase: UploadPhase, data: any) => void, signal: AbortSignal): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('userName', userName);
  let result: UploadResult | null = null;
  let failure: AiRequestError | null = null;
  await streamSseFetch(
    FILES_ENDPOINT,
    { method: 'POST', body: form },
    (event, data) => {
      if (event === 'status') onPhase(data.phase, data);
      else if (event === 'done') result = data as UploadResult;
      else if (event === 'error') failure = new AiRequestError(data.code || 'error', data.message || '판독에 실패했습니다.', { retryable: !!data.retryable });
    },
    signal,
    { idleMs: 180_000 },
  );
  if (failure) throw failure;
  if (!result) throw new AiRequestError('stream_incomplete', '판독 결과를 받지 못했습니다. 다시 시도해 주세요.', { retryable: true });
  return result;
}

export async function listCompanyFiles(company: string): Promise<StoredFile[]> {
  return (await getJson<{ items: StoredFile[] }>({ action: 'list', company }, FILES_ENDPOINT)).items;
}

// ─── 고객사 파일 ──────────────────────────────────────────────────────

/** 같은 고객사 — 회사명(정규화)·고객 ID·딜 ID 중 하나라도 맞으면 같은 목록 (서버 FileScope) */
export interface FileScope {
  company: string;
  customerId?: number | null;
  dealId?: number | null;
  /** 고객 상세: 이 고객 작업이력과 연결된 딜들 (딜 상세에서 올린 파일도 보이게) */
  dealIds?: number[];
}

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 10;
/** functions/_lib/ai-files.ts BLOCKED_EXTENSIONS 와 같은 목록 */
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh',
  'jar', 'apk', 'app', 'dmg', 'pkg', 'sh', 'bash', 'reg', 'lnk', 'dll', 'sys', 'hta', 'msc', 'gadget',
]);
const VIEWABLE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export function fileExtension(name: string): string {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec((name || '').trim());
  return m ? m[1].toLowerCase() : '';
}

/** 올리기 전에 거를 사유 (서버도 같은 검사를 한다) */
export function uploadBlockReason(file: File): string | null {
  if (BLOCKED_EXTENSIONS.has(fileExtension(file.name))) return '실행 파일은 올릴 수 없습니다';
  if (file.size > MAX_UPLOAD_BYTES) return `30MB를 넘습니다(${formatBytes(file.size)})`;
  if (file.size === 0) return '빈 파일입니다';
  return null;
}

/** 새 탭에서 바로 볼 수 있는 파일 (이미지·PDF) */
export function canView(f: Pick<StoredFile, 'contentType' | 'fileName'>): boolean {
  if (f.contentType) return VIEWABLE_TYPES.has(f.contentType);
  return ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension(f.fileName));
}

export async function listScopeFiles(scope: FileScope): Promise<StoredFile[]> {
  const params: Record<string, string | number | null> = {
    action: 'list',
    company: scope.company || null,
    customerId: scope.customerId || null,
    dealId: scope.dealId || null,
    dealIds: scope.dealIds?.length ? [...new Set(scope.dealIds)].slice(0, 50).join(',') : null,
  };
  return (await getJson<{ items: StoredFile[] }>(params, FILES_ENDPOINT)).items;
}

export interface CompanyUploadResult {
  file: StoredFile | null;
  /** 같은 고객사에 이미 같은 파일이 있어 새로 저장하지 않음 */
  duplicate: boolean;
}

/** 고객사 파일 올리기 — 진행률을 받으려고 XMLHttpRequest 를 쓴다 (fetch 는 업로드 진행률이 없다) */
export function uploadCompanyFile(
  file: File,
  scope: FileScope,
  userName: string,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<CompanyUploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('purpose', 'company');
    form.append('file', file, file.name);
    form.append('userName', userName);
    form.append('company', scope.company || '');
    if (scope.customerId) form.append('customerId', String(scope.customerId));
    if (scope.dealId) form.append('dealId', String(scope.dealId));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', FILES_ENDPOINT);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.ok) {
        resolve({ file: (body.file as StoredFile) ?? null, duplicate: !!body.duplicate });
        return;
      }
      const message = typeof body?.message === 'string' && body.message ? body.message : `파일을 올리지 못했습니다 (${xhr.status || '연결 실패'})`;
      reject(new AiRequestError(body?.code || 'error', message, { status: xhr.status, retryable: xhr.status === 0 || xhr.status === 429 || xhr.status >= 500 }));
    };
    xhr.onerror = () => reject(new AiRequestError('network', '네트워크 오류로 올리지 못했습니다.', { retryable: true }));
    xhr.onabort = () => reject(new AiRequestError('aborted', '올리기를 취소했습니다.'));
    if (signal) {
      if (signal.aborted) {
        reject(new AiRequestError('aborted', '올리기를 취소했습니다.'));
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
}

export async function listRecentFiles(limit = 20): Promise<StoredFile[]> {
  return (await getJson<{ items: StoredFile[] }>({ action: 'recent', limit }, FILES_ENDPOINT)).items;
}

export async function linkFile(req: { id: string; company: string; customerId: number | null; dealId: number | null; applied: unknown; userName: string }): Promise<StoredFile | null> {
  return (await postJson<{ file: StoredFile | null }>({ action: 'link', ...req }, { endpoint: FILES_ENDPOINT })).file;
}

export async function deleteFile(id: string, userName: string, pin?: string): Promise<void> {
  await postJson({ action: 'delete', id, userName, pin }, { endpoint: FILES_ENDPOINT });
}

export function downloadUrl(id: string): string {
  return `${FILES_ENDPOINT}?action=download&id=${encodeURIComponent(id)}`;
}

/** 새 탭에서 보기 — 서버는 이미지·PDF 만 inline 으로 보낸다 */
export function viewUrl(id: string): string {
  return `${downloadUrl(id)}&inline=1`;
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  if (n >= 1024) return `${Math.round(n / 1024)}KB`;
  return `${n}B`;
}
