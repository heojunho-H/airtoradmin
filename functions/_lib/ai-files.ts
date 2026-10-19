// 견적서 입력 도우미 — 업로드 파일(R2) 저장, Claude 의 PDF 판독(구조화 출력), 파일 메타데이터(D1 ai_files).
// 판독 결과로 딜·고객을 고치는 일은 브라우저가 사용자의 확인을 받은 뒤 기존 API 로 한다(src/lib/ai/intake.ts).
// 장비 종류는 영업 화면의 상세 수량 키 10개와 같게 맞춘다(SalesPage.tsx) — 스키마는 ASCII 키로 받고 여기서 한글 키로 바꾼다.

import type Anthropic from '@anthropic-ai/sdk';
import { normalizeCompanyName } from '../../src/lib/company';
import { createClient, normalizeUsage, visibleText } from './ai-client';
import { AiError, kstMonth, nowIso, type AiEnv } from './ai-http';
import { buildModelParams, costMicros, DEFAULT_SETTINGS, getModel, normalizeModelId, type ModelSpec } from './ai-models';
import { insertUsage, loadSettings, type UsageStatus } from './ai-store';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const SDK_TIMEOUT_MS = 150_000;

/** [스키마 키, 영업 화면 상세 수량 키] */
export const EQUIPMENT: [string, string][] = [
  ['wall', '벽걸이형'],
  ['standNormal', '스탠드 일반형'],
  ['standLarge', '스탠드 대형'],
  ['way1', '1way 천정형'],
  ['way2', '2way 천정형'],
  ['way4', '4way 천정형'],
  ['round', '원형 천정형'],
  ['fcu', 'FCU형'],
  ['duct', '매립덕트형'],
  ['outdoor', '실외기'],
];

const int = (description: string) => ({ type: 'integer', description });
const str = (description: string) => ({ type: 'string', description });

export const QUOTE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'documentType', 'otherKind', 'supplierName', 'issuedByAirtor', 'recipientCompany', 'contactName', 'contactPosition', 'quoteDate',
    'validDays', 'revision', 'variantLabel', 'quoteCount', 'serviceName', 'serviceCategory', 'equipment', 'otherItems', 'totalQuantity',
    'lineItems', 'supplyTotal', 'taxTotal', 'quotedTotal', 'vatIncluded', 'notes', 'plannedCrew', 'confidence', 'warnings',
  ],
  properties: {
    documentType: { type: 'string', enum: ['quote', 'other'], description: '견적서이면 quote, 아니면 other' },
    otherKind: str('견적서가 아니면 어떤 문서인지 짧게(예: 사업자등록증, 작업표준서, 안내문). 견적서면 빈 문자열'),
    supplierName: str('공급자(견적을 낸 회사) 상호. 모르면 빈 문자열'),
    issuedByAirtor: { type: 'boolean', description: '공급자가 에어터(㈜에어터, AIRTOR)이면 true, 다른 업체면 false' },
    recipientCompany: str('수신(고객) 회사명. 공급자(에어터)가 아니다. 모르면 빈 문자열'),
    contactName: str('수신측 담당자 이름(직책·존칭 제외). 없으면 빈 문자열'),
    contactPosition: str('수신측 담당자 직책(예: 주임). 없으면 빈 문자열'),
    quoteDate: str('견적일자 YYYY-MM-DD. 없으면 빈 문자열'),
    validDays: int('유효기간 일수. 없으면 0'),
    revision: int('문서에 적힌 견적 차수(예: "2차 견적서" → 2, "수정 견적" → 2). 표시가 없으면 1'),
    variantLabel: str('같은 고객의 다른 견적과 구분하는 현장·지점·건물 또는 안(옵션) 라벨(예: 김포, 방화, 스탠드, 반분해). 회사명은 넣지 않는다. 없으면 빈 문자열'),
    quoteCount: int('이 PDF 에 수신처나 총 견적 금액이 따로 있는 견적서가 몇 개인지. 보통 1'),
    serviceName: str('문서에 적힌 서비스명'),
    serviceCategory: { type: 'string', enum: ['에어컨세척', '해충방제', '표면소독', '실내공기질', '기타'] },
    equipment: {
      type: 'object',
      additionalProperties: false,
      required: EQUIPMENT.map(([k]) => k),
      properties: Object.fromEntries(EQUIPMENT.map(([k, label]) => [k, int(`${label} 대수. 없으면 0`)])),
    },
    otherItems: {
      type: 'array',
      description: '위 10개 종류에 없는 장비·품목(수량이 있는 것만). EVENT·무료 항목 제외',
      items: { type: 'object', additionalProperties: false, required: ['name', 'quantity'], properties: { name: str('품목명'), quantity: int('수량') } },
    },
    totalQuantity: int('의뢰 대수(또는 품목 수량) 총합. 없으면 0'),
    lineItems: {
      type: 'array',
      description: '견적 사항 표의 품목 행. 합계 행·EVENT 행 제외',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'unitPrice', 'quantity', 'supplyAmount', 'taxAmount', 'total'],
        properties: { name: str('품명'), unitPrice: int('1대 단가(원)'), quantity: int('수량'), supplyAmount: int('공급가액(원)'), taxAmount: int('세액(원)'), total: int('합계(원)') },
      },
    },
    supplyTotal: int('공급가액 합계(원). 없으면 0'),
    taxTotal: int('세액 합계(원). 없으면 0'),
    quotedTotal: int('문서의 "총 견적 금액"(원). 절삭·할인 후 최종 금액 그대로'),
    vatIncluded: { type: 'boolean', description: '총 견적 금액이 VAT 포함이면 true' },
    notes: { type: 'array', items: { type: 'string' }, description: '견적 특이사항 요약(최대 5개). 회사 홍보·실적은 제외' },
    plannedCrew: {
      type: 'array',
      description: '예정 인력 구성(있으면)',
      items: { type: 'object', additionalProperties: false, required: ['role', 'count'], properties: { role: str('역할'), count: int('인원') } },
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    warnings: { type: 'array', items: { type: 'string' }, description: '판독 중 발견한 불일치·불확실한 점' },
  },
} as const;

const QUOTE_SYSTEM = `당신은 에어터(Airtor)의 견적서 판독기입니다. 첨부된 PDF 를 읽고 지정된 JSON 형식으로만 답합니다.
에어터는 해충방제·표면소독·에어컨세척·실내공기질 서비스를 하는 B2B 회사입니다. 보통 견적서의 "공급자"는 에어터지만,
고객 폴더에는 다른 업체가 낸 견적서나 견적서가 아닌 문서(사업자등록증, 작업표준서, 안내문 등)가 섞여 있을 수 있습니다.

판독 규칙:
- 공급자(상호·대표자·등록번호가 적힌 쪽)가 에어터가 아니면 issuedByAirtor=false, supplierName 에 그 회사명을 적습니다. 에어터면 true.
- 견적서가 아니면 documentType=other, otherKind 에 문서 종류를 적고 나머지는 빈 값으로 둡니다.
- revision: 제목·본문에 "2차 견적서", "3차", "수정 견적" 같은 차수 표시가 있으면 그 숫자(수정 견적은 2), 없으면 1.
- variantLabel: 현장·지점·건물이나 안(옵션)이 따로 적혀 있으면 짧게 적습니다(예: "김포", "방화동 지점", "스탠드", "반분해"). 수신 회사명 자체는 넣지 않습니다.
- quoteCount: 수신처나 총 견적 금액이 서로 다른 견적이 한 PDF 에 여러 개 있으면 그 수. 이때 첫 번째 견적만 판독하고 warnings 에 적습니다.
- recipientCompany 는 "수신"(고객) 회사명입니다. 공급자(㈜에어터)를 넣지 않습니다. "귀 OOO 사" 같은 문구로도 확인할 수 있습니다.
- 담당자 "박재경 주임님" → contactName "박재경", contactPosition "주임". 존칭(님)은 빼고 이름과 직책을 나눕니다.
- quoteDate: "2026년 10월 16일" → "2026-10-16".
- equipment 는 "의뢰 대수" 표의 냉난방기 종류별 대수입니다. 이름이 조금 달라도 가장 가까운 종류에 넣습니다:
  벽걸이 → wall, 스탠드형·스탠드 일반형 → standNormal, 스탠드형 대형·스탠드 대형 → standLarge, 1way 천정형 → way1, 2way → way2, 4way → way4, 원형 → round, FCU → fcu, 매립덕트 → duct, 실외기 → outdoor. 해당 없으면 0.
- 에어컨이 아닌 서비스(방제·소독·공기질 측정 등)는 equipment 를 모두 0 으로 두고 otherItems 에 품목과 수량을 넣습니다.
  면적·횟수·기간이 기준이면 이름에 단위를 붙입니다(예: "방역 면적(㎡)" 1200, "방문 횟수(회)" 12).
  월·연 정기 계약이면 quotedTotal 은 문서의 총 견적 금액을 그대로 쓰고, 그 금액의 기준(월/연/회당)을 warnings 에 적습니다.
- EVENT, 무료, "All" 같은 행은 수량·품목이 아닙니다. lineItems 와 otherItems 에서 뺍니다.
- quotedTotal 은 문서의 "총 견적 금액"을 그대로 씁니다(천원 단위 절삭·할인 후 최종 금액). 품목 합계와 다르면 warnings 에 두 금액과 이유(예: 천원 단위 절삭)를 적습니다.
- 회사 소개·실적·포트폴리오 쪽은 무시합니다(notes 에 넣지 않음).
- 숫자는 쉼표 없는 정수(원)입니다. 읽을 수 없는 값은 0 이나 빈 문자열로 두고 warnings 에 적습니다.
- 확실하지 않은 값이 있으면 confidence 를 medium 이나 low 로 둡니다.`;

// ─── 판독 결과 ──────────────────────────────────────────────────────────

export interface QuoteExtraction {
  documentType: 'quote' | 'other';
  /** 견적서가 아닐 때 문서 종류 */
  otherKind: string;
  supplierName: string;
  /** 공급자가 에어터인가 — 아니면 타사 견적서로 거른다 */
  issuedByAirtor: boolean;
  recipientCompany: string;
  contactName: string;
  contactPosition: string;
  quoteDate: string;
  validDays: number;
  /** 견적 차수 — 문서 표시와 파일명 "N차견적서" 중 큰 값, 없으면 1 */
  revision: number;
  /** 현장·지점·안 구분 라벨 — 문서 또는 파일명 "견적서(김포)" */
  variantLabel: string;
  /** PDF 하나에 든 견적서 수 */
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
  /** 코드가 판정한 확인 필요 사유 (화면의 "분명한 건" 판정에 쓴다) — QUOTE_FLAGS */
  flags: string[];
}

/** 확인 필요 사유 — 이 중 하나라도 있으면 일괄 입력에서 미리 체크하지 않는다 */
export const QUOTE_FLAGS = ['multi_quote', 'vat_excluded', 'no_date', 'no_amount', 'no_company', 'qty_mismatch', 'amount_mismatch'] as const;

const toInt = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const toStr = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** "2차견적서_…", "3차 견적서" → 2·3 (없으면 1) */
export function fileRevision(fileName: string): number {
  const m = /(\d{1,2})\s*차\s*견적/.exec(fileName || '');
  const n = m ? Number(m[1]) : 1;
  return n >= 1 && n <= 20 ? n : 1;
}

/** "견적서(김포)_…", "2차견적서(스탠드)_…" → 김포·스탠드 */
export function fileVariant(fileName: string): string {
  const m = /견적서\s*\(([^)]{1,20})\)/.exec(fileName || '');
  return m ? m[1].trim() : '';
}

const sumEquipment = (ex: Pick<QuoteExtraction, 'equipment' | 'otherItems'>) =>
  Object.values(ex.equipment ?? {}).reduce((a, b) => a + (Number(b) || 0), 0) + (ex.otherItems ?? []).reduce((a, o) => a + (Number(o.quantity) || 0), 0);

/**
 * 새 필드 기본값 채우기 + 파일명 정보 + 플래그 다시 계산.
 * 모델 판독 직후와, sha 로 재사용하는 이전 판독 결과(필드가 없을 수 있음) 모두에 쓴다.
 */
export function upgradeExtraction(ex: Partial<QuoteExtraction> & Record<string, unknown>, fileName: string): QuoteExtraction {
  const out = {
    otherKind: '',
    supplierName: '',
    issuedByAirtor: true,
    revision: 1,
    variantLabel: '',
    quoteCount: 1,
    equipment: {},
    otherItems: [],
    lineItems: [],
    notes: [],
    plannedCrew: [],
    warnings: [],
    ...ex,
  } as QuoteExtraction;
  out.revision = Math.max(toInt(out.revision) || 1, fileRevision(fileName));
  out.variantLabel = toStr(out.variantLabel, 40) || fileVariant(fileName);
  out.quoteCount = toInt(out.quoteCount) || 1;
  out.issuedByAirtor = out.issuedByAirtor !== false;

  const flags: string[] = [];
  if (out.quoteCount > 1) flags.push('multi_quote');
  if (out.quotedTotal && out.vatIncluded === false) flags.push('vat_excluded');
  if (!out.quoteDate) flags.push('no_date');
  if (!out.quotedTotal) flags.push('no_amount');
  if (!out.recipientCompany) flags.push('no_company');
  const eqSum = sumEquipment(out);
  if (eqSum && out.totalQuantity && eqSum !== out.totalQuantity) flags.push('qty_mismatch');
  const linesTotal = out.lineItems.reduce((a, l) => a + (Number(l.total) || 0), 0);
  // 천원·만원 단위 절삭(1만 원 이하)은 정상으로 본다. 그보다 크고 1% 이상이면 할인·오기 확인
  const gap = Math.abs(linesTotal - out.quotedTotal);
  if (linesTotal && out.quotedTotal && gap > 10_000 && gap / out.quotedTotal >= 0.01) flags.push('amount_mismatch');
  out.flags = flags;
  return out;
}

/** 모델 출력 검증·정리 + 금액·수량 교차 확인(코드로 다시 계산해 경고를 붙인다) */
export function normalizeExtraction(raw: unknown, fileName = ''): QuoteExtraction | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const eq = (r.equipment && typeof r.equipment === 'object' ? r.equipment : {}) as Record<string, unknown>;
  const equipment: Record<string, number> = {};
  for (const [k, label] of EQUIPMENT) equipment[label] = toInt(eq[k]);
  const otherItems = (Array.isArray(r.otherItems) ? r.otherItems : [])
    .map((o: any) => ({ name: toStr(o?.name, 60), quantity: toInt(o?.quantity) }))
    .filter((o: { name: string; quantity: number }) => o.name && o.quantity > 0)
    .slice(0, 20);
  const lineItems = (Array.isArray(r.lineItems) ? r.lineItems : [])
    .map((l: any) => ({
      name: toStr(l?.name, 60),
      unitPrice: toInt(l?.unitPrice),
      quantity: toInt(l?.quantity),
      supplyAmount: toInt(l?.supplyAmount),
      taxAmount: toInt(l?.taxAmount),
      total: toInt(l?.total),
    }))
    .filter((l: { name: string }) => l.name)
    .slice(0, 40);
  const quoteDate = /^\d{4}-\d{2}-\d{2}$/.test(toStr(r.quoteDate)) ? toStr(r.quoteDate) : '';
  const warnings = (Array.isArray(r.warnings) ? r.warnings : []).map((w: unknown) => toStr(w, 200)).filter(Boolean).slice(0, 8);

  const equipmentSum = sumEquipment({ equipment, otherItems });
  const totalQuantity = toInt(r.totalQuantity) || equipmentSum;
  if (equipmentSum && totalQuantity && equipmentSum !== totalQuantity) {
    warnings.push(`종류별 대수 합계 ${equipmentSum}대와 총 수량 ${totalQuantity}대가 다릅니다.`);
  }
  const quotedTotal = toInt(r.quotedTotal);
  const linesTotal = lineItems.reduce((a: number, l: { total: number }) => a + l.total, 0);
  if (quotedTotal && linesTotal && linesTotal !== quotedTotal && !warnings.some((w: string) => w.includes(linesTotal.toLocaleString('ko-KR')))) {
    warnings.push(`품목 합계 ${linesTotal.toLocaleString('ko-KR')}원과 총 견적 금액 ${quotedTotal.toLocaleString('ko-KR')}원이 다릅니다 — 총 견적 금액으로 입력합니다.`);
  }
  if (!quoteDate) warnings.push('견적일자를 읽지 못했습니다.');
  // 딜 견적 금액·프로젝트 부가세 계산은 VAT 포함 기준이다 (deals_api.php syncDealToProject)
  if (quotedTotal && r.vatIncluded === false) warnings.push('총 견적 금액이 VAT 별도로 보입니다 — 시스템 견적 금액은 VAT 포함 기준이니 확인하세요.');
  const quoteCount = toInt(r.quoteCount) || 1;
  if (quoteCount > 1) warnings.push(`이 PDF 에 견적서가 ${quoteCount}개 들어 있습니다 — 첫 번째 견적만 읽었습니다. 한 파일에 하나씩 올려 주세요.`);

  return upgradeExtraction(
    {
      documentType: r.documentType === 'quote' ? 'quote' : 'other',
      otherKind: toStr(r.otherKind, 40),
      supplierName: toStr(r.supplierName, 100),
      issuedByAirtor: r.issuedByAirtor !== false,
      recipientCompany: toStr(r.recipientCompany, 100),
      contactName: toStr(r.contactName, 40),
      contactPosition: toStr(r.contactPosition, 40),
      quoteDate,
      validDays: toInt(r.validDays),
      revision: toInt(r.revision) || 1,
      variantLabel: toStr(r.variantLabel, 40),
      quoteCount,
      serviceName: toStr(r.serviceName, 80),
      serviceCategory: toStr(r.serviceCategory, 20) || '기타',
      equipment,
      otherItems,
      totalQuantity,
      lineItems,
      supplyTotal: toInt(r.supplyTotal),
      taxTotal: toInt(r.taxTotal),
      quotedTotal,
      vatIncluded: r.vatIncluded !== false,
      notes: (Array.isArray(r.notes) ? r.notes : []).map((n: unknown) => toStr(n, 200)).filter(Boolean).slice(0, 5),
      plannedCrew: (Array.isArray(r.plannedCrew) ? r.plannedCrew : [])
        .map((c: any) => ({ role: toStr(c?.role, 30), count: toInt(c?.count) }))
        .filter((c: { role: string }) => c.role)
        .slice(0, 12),
      confidence: r.confidence === 'high' || r.confidence === 'low' ? r.confidence : 'medium',
      warnings,
    },
    fileName,
  );
}

/** 견적서로 받지 않는 이유 — null 이면 받는다 */
export function rejectReason(ex: QuoteExtraction): string | null {
  if (ex.documentType !== 'quote') return `견적서로 보이지 않습니다${ex.otherKind ? `(${ex.otherKind})` : ''}. 견적서 PDF 를 올려 주세요.`;
  if (!ex.issuedByAirtor) return `에어터가 낸 견적서가 아닙니다(공급자: ${ex.supplierName || '확인 불가'}).`;
  return null;
}

// ─── 바이트 도구 ────────────────────────────────────────────────────────

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** %PDF 로 시작하는지 (확장자·MIME 만 믿지 않는다) */
export function looksLikePdf(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf, 0, Math.min(5, buf.byteLength));
  return String.fromCharCode(...b) === '%PDF-';
}

// ─── Claude 판독 ────────────────────────────────────────────────────────

export interface ExtractResult {
  extraction: QuoteExtraction;
  model: string;
  costUsd: number;
}

/** 판독 모델 = 설정의 AI 어시스턴트 기본 모델(구조화 출력 지원), 추론 강도 low */
export async function extractQuote(env: AiEnv, pdf: ArrayBuffer, userName: string, ref: string, fileName: string): Promise<ExtractResult> {
  const started = Date.now();
  const settings = await loadSettings(env.AI_DB);
  let spec = getModel(settings.chat.model);
  if (!spec || !spec.structuredOutputs) spec = getModel(DEFAULT_SETTINGS.chat.model) as ModelSpec;
  const { params, betas } = buildModelParams(spec, { feature: 'company_info', effort: 'low' });
  const outputConfig = { ...((params.output_config as Record<string, unknown> | undefined) ?? {}), format: { type: 'json_schema', schema: QUOTE_JSON_SCHEMA } };

  const client = createClient(env, { timeoutMs: SDK_TIMEOUT_MS, maxRetries: 1 });
  const msg = await client.beta.messages.create({
    model: spec.id,
    max_tokens: spec.thinking === 'on' ? 16_000 : 8_000,
    system: [{ type: 'text', text: QUOTE_SYSTEM }],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: toBase64(pdf) } },
          { type: 'text', text: '이 견적서를 판독해 주세요.' },
        ],
      },
    ],
    ...params,
    output_config: outputConfig,
    ...(betas.length ? { betas } : {}),
  } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);

  const usage = normalizeUsage(msg.usage);
  const servedModel = normalizeModelId(msg.model);
  const cost = costMicros(servedModel, usage);
  const log = (status: UsageStatus, errorCode: string | null = null) =>
    env.AI_DB
      ? insertUsage(env.AI_DB, {
          ym: kstMonth(),
          feature: 'intake',
          model: servedModel,
          requestedModel: spec.id,
          effort: 'low',
          status,
          errorCode,
          usage,
          costMicros: cost,
          durationMs: Date.now() - started,
          userName,
          ref,
          at: nowIso(),
        }).catch(() => {})
      : Promise.resolve();

  if (msg.stop_reason === 'refusal') {
    await log('refusal', 'refusal');
    throw new AiError(422, 'refusal', 'AI가 안전 정책상 이 문서를 판독하지 않았습니다.');
  }
  if (msg.stop_reason === 'max_tokens') {
    await log('max_tokens', 'max_tokens');
    throw new AiError(502, 'max_tokens', '판독 결과가 너무 길어 중단되었습니다. 다시 시도해 주세요.', { retryable: true });
  }
  let raw: unknown = null;
  try {
    raw = JSON.parse(visibleText(msg.content));
  } catch {
    raw = null;
  }
  const extraction = normalizeExtraction(raw, fileName);
  if (!extraction) {
    await log('invalid_output', 'invalid_output');
    throw new AiError(502, 'invalid_output', '판독 결과 형식 오류 — 다시 시도해 주세요.', { retryable: true });
  }
  await log('ok');
  return { extraction, model: servedModel, costUsd: cost / 1e6 };
}

// ─── D1 ai_files ────────────────────────────────────────────────────────

export interface FileRow {
  id: string;
  kind: string;
  file_name: string;
  content_type: string;
  size: number;
  sha256: string;
  r2_key: string;
  company: string | null;
  company_key: string | null;
  customer_id: number | null;
  deal_id: number | null;
  status: string;
  extraction_json: string | null;
  applied_json: string | null;
  uploaded_by: string;
  created_at: string;
  linked_at: string | null;
  linked_by: string | null;
}

export function companyKey(name: string | null | undefined): string {
  return normalizeCompanyName(name ?? '');
}

export function r2KeyFor(id: string, at: string): string {
  return `quotes/${at.slice(0, 4)}/${at.slice(5, 7)}/${id}.pdf`;
}

export async function insertFile(db: D1Database, f: Omit<FileRow, 'linked_at' | 'linked_by'>): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ai_files (id, kind, file_name, content_type, size, sha256, r2_key, company, company_key, customer_id, deal_id, status, extraction_json, applied_json, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(f.id, f.kind, f.file_name, f.content_type, f.size, f.sha256, f.r2_key, f.company, f.company_key, f.customer_id, f.deal_id, f.status, f.extraction_json, f.applied_json, f.uploaded_by, f.created_at)
    .run();
}

export async function getFile(db: D1Database, id: string): Promise<FileRow | null> {
  return db.prepare('SELECT * FROM ai_files WHERE id = ? AND deleted_at IS NULL').bind(id).first<FileRow>();
}

export async function findBySha(db: D1Database, sha: string): Promise<FileRow | null> {
  return db.prepare('SELECT * FROM ai_files WHERE sha256 = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1').bind(sha).first<FileRow>();
}

export async function saveExtraction(db: D1Database, id: string, ex: QuoteExtraction): Promise<void> {
  await db
    .prepare('UPDATE ai_files SET extraction_json = ?, company = COALESCE(company, ?), company_key = COALESCE(company_key, ?) WHERE id = ?')
    .bind(JSON.stringify(ex), ex.recipientCompany || null, companyKey(ex.recipientCompany) || null, id)
    .run();
}

export async function listFiles(db: D1Database, opts: { companyKey?: string; limit: number }): Promise<FileRow[]> {
  const sql = opts.companyKey
    ? 'SELECT * FROM ai_files WHERE company_key = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM ai_files WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?';
  const stmt = opts.companyKey ? db.prepare(sql).bind(opts.companyKey, opts.limit) : db.prepare(sql).bind(opts.limit);
  return (await stmt.all<FileRow>()).results;
}

export async function linkFile(
  db: D1Database,
  id: string,
  l: { company: string; customerId: number | null; dealId: number | null; applied: unknown; by: string; at: string },
): Promise<void> {
  await db
    .prepare('UPDATE ai_files SET status = ?, company = ?, company_key = ?, customer_id = ?, deal_id = ?, applied_json = ?, linked_at = ?, linked_by = ? WHERE id = ? AND deleted_at IS NULL')
    .bind('linked', l.company, companyKey(l.company) || null, l.customerId, l.dealId, JSON.stringify(l.applied ?? null).slice(0, 8000), l.at, l.by, id)
    .run();
}

export async function softDeleteFile(db: D1Database, id: string, actor: string, at: string): Promise<void> {
  await db.prepare('UPDATE ai_files SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL').bind(at, actor, id).run();
}

/** 브라우저에 주는 모양 (R2 키·해시는 숨긴다) */
export function publicFile(f: FileRow) {
  let ex: Partial<QuoteExtraction> | null = null;
  try {
    ex = f.extraction_json ? JSON.parse(f.extraction_json) : null;
  } catch {
    ex = null;
  }
  return {
    id: f.id,
    kind: f.kind,
    fileName: f.file_name,
    size: f.size,
    company: f.company,
    status: f.status,
    customerId: f.customer_id,
    dealId: f.deal_id,
    uploadedBy: f.uploaded_by,
    createdAt: f.created_at,
    linkedAt: f.linked_at,
    linkedBy: f.linked_by,
    quoteDate: ex?.quoteDate ?? null,
    quotedTotal: ex?.quotedTotal ?? null,
    totalQuantity: ex?.totalQuantity ?? null,
    serviceName: ex?.serviceName ?? null,
  };
}
