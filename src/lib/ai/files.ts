// 견적서 입력 도우미 · 고객사 파일 — /api/files 클라이언트 (서버: functions/api/files.ts)

import { AiRequestError, getJson, postJson, streamSseFetch } from './api';

export const FILES_ENDPOINT = '/api/files';

export interface StoredFile {
  id: string;
  kind: string;
  fileName: string;
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
  vat_excluded: 'VAT 별도 금액',
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

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  if (n >= 1024) return `${Math.round(n / 1024)}KB`;
  return `${n}B`;
}
