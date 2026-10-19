// 고객 작업이력 → 공급망관리 고객책임자·작업팀장 작업 히스토리 (App.tsx 가 고객 목록이 바뀔 때 다시 만든다)
// 바뀐 사람만 저장하려고 비교 함수를 함께 둔다. 작업팀장 평가는 영업 딜 번호(dealId)로 먼저 찾아,
// 작업일·프로젝트명·회사명이 동기화로 바뀌어도 평가가 남게 한다(예전 항목은 프로젝트명|회사|작업일 키로).

import { linkedDealId } from './dealSync';

type AnyRecord = Record<string, any>;

const EVAL_FIELDS = [
  'workEvaluation', 'workEvaluationScore', 'evalCustomerClaim', 'evalAllDevices',
  'evalOnTime', 'evalAfterService', 'evalUniform', 'evalKindness',
] as const;

function byInquiryDesc(a: AnyRecord, b: AnyRecord): number {
  return String(b.inquiryDate || '').localeCompare(String(a.inquiryDate || ''));
}

/** 고객책임자 한 명의 작업 히스토리 (작업이력의 고객책임자가 이 사람인 항목) */
export function managerActivities(name: string, customers: AnyRecord[]): AnyRecord[] {
  const acts: AnyRecord[] = [];
  for (const customer of customers) {
    for (const work of customer.workHistory || []) {
      if (work.accountManager !== name) continue;
      acts.push({
        inquiryDate: work.inquiryDate,
        customerCompany: customer.company,
        projectName: work.projectName,
        totalQuantity: work.totalQuantity,
        detailQuantity: work.detailedQuantity,
        estimateAmount: work.quotationAmount,
        customerManager: work.accountManager,
        workDate: work.workDate,
        subcontractor: work.subcontractorManager,
      });
    }
  }
  return acts.sort(byInquiryDesc);
}

/** 작업팀장 한 명의 작업 히스토리 — 기존 평가는 dealId 우선, 다음은 프로젝트명|회사|작업일로 이어 붙인다 */
export function subcontractorActivities(sub: AnyRecord, customers: AnyRecord[]): AnyRecord[] {
  const evals = new Map<string, AnyRecord>();
  for (const act of sub.recentActivities || []) {
    const ev: AnyRecord = {};
    for (const f of EVAL_FIELDS) ev[f] = act[f];
    if (act.dealId) evals.set(`deal:${act.dealId}`, ev);
    evals.set(`${act.projectName}|${act.customerCompany}|${act.workDate}`, ev);
  }

  const acts: AnyRecord[] = [];
  for (const customer of customers) {
    for (const work of customer.workHistory || []) {
      const names = work.subcontractorManager ? String(work.subcontractorManager).split(', ').map((s: string) => s.trim()) : [];
      if (!names.includes(sub.name)) continue;
      const dealId = linkedDealId(work);
      const ev = (dealId && evals.get(`deal:${dealId}`)) || evals.get(`${work.projectName}|${customer.company}|${work.workDate}`) || {};
      acts.push({
        ...(dealId ? { dealId } : {}),
        inquiryDate: work.inquiryDate,
        customerCompany: customer.company,
        projectName: work.projectName,
        totalQuantity: work.totalQuantity,
        detailQuantity: work.detailedQuantity,
        estimateAmount: work.quotationAmount,
        customerManager: work.accountManager,
        workDate: work.workDate,
        subcontractor: sub.name,
        workEvaluation: ev.workEvaluation || '',
        workEvaluationScore: ev.workEvaluationScore || 0,
        evalCustomerClaim: ev.evalCustomerClaim,
        evalAllDevices: ev.evalAllDevices,
        evalOnTime: ev.evalOnTime,
        evalAfterService: ev.evalAfterService,
        evalUniform: ev.evalUniform,
        evalKindness: ev.evalKindness,
      });
    }
  }
  return acts.sort(byInquiryDesc);
}

// 키 순서와 빈 값(undefined)에 흔들리지 않는 비교
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') {
    const out: AnyRecord = {};
    for (const k of Object.keys(v as AnyRecord).sort()) {
      const x = (v as AnyRecord)[k];
      if (x !== undefined) out[k] = stable(x);
    }
    return out;
  }
  return v;
}

export function sameActivities(a: unknown, b: unknown): boolean {
  return JSON.stringify(stable(a ?? [])) === JSON.stringify(stable(b ?? []));
}
