// AI 전문가 데이터 스냅샷 — 대화 시작(또는 '최신 데이터로 갱신') 시점의 운영 데이터를 전문가별 텍스트로 만든다.
// 저장된 집계 필드 대신 원본 기록에서 다시 계산한 지표를 쓰고(derive.ts), 전문가마다 판단에 필요한 섹션을 고른다.
// 연락처(이름·전화·이메일·주소)는 넣지 않는다 — 대화는 팀 전체에 공유된다. 주소는 시/도만 쓴다.

import { kstYmd } from '../format';
import type { AiDatasets, PersonaId } from '../types';
import { fitToBudget, SNAPSHOT_MAX_CHARS, type Section } from './common';
import { crmSections } from './crm';
import { buildCtx, customerFacts, dealFacts, managerFacts, projectFacts, subFacts } from './derive';
import { overviewSections } from './overview';
import { profitSections } from './profit';
import { salesSections } from './sales';
import { supplySections } from './supply';

export { SNAPSHOT_MAX_CHARS };

export interface DataSnapshot {
  persona: PersonaId;
  text: string;
  builtAt: number;
  counts: { deals: number; customers: number; managers: number; subcontractors: number; projects: number };
  /** 예산 때문에 행을 줄인 목록 설명 */
  truncated: string[];
}

export function buildSnapshot(persona: PersonaId, ds: AiDatasets, opts: { maxChars?: number; today?: string } = {}): DataSnapshot {
  const today = opts.today ?? kstYmd();
  const ctx = buildCtx(ds, today);
  let sections: Section[];
  if (persona === 'sales') {
    sections = salesSections(ctx, dealFacts(ctx));
  } else if (persona === 'crm') {
    sections = crmSections(ctx, customerFacts(ctx));
  } else if (persona === 'supply') {
    const customers = customerFacts(ctx);
    sections = supplySections(ctx, managerFacts(ctx, dealFacts(ctx), customers), subFacts(ctx));
  } else if (persona === 'profit') {
    sections = profitSections(ctx, projectFacts(ctx));
  } else {
    sections = overviewSections(ctx, dealFacts(ctx), customerFacts(ctx), subFacts(ctx), projectFacts(ctx));
  }
  const { text, truncated } = fitToBudget(`오늘 날짜(KST): ${today}`, sections, opts.maxChars ?? SNAPSHOT_MAX_CHARS);
  return {
    persona,
    text,
    builtAt: Date.now(),
    counts: {
      deals: ds.deals.length,
      customers: ds.customers.length,
      managers: ds.managers.length,
      subcontractors: ds.subcontractors.length,
      projects: ds.projects.length,
    },
    truncated,
  };
}

/** 데이터 메뉴에 보일 핵심 건수 */
export function snapshotSummary(persona: PersonaId, counts: DataSnapshot['counts']): string {
  switch (persona) {
    case 'sales':
      return `딜 ${counts.deals.toLocaleString('ko-KR')}건`;
    case 'crm':
      return `고객 ${counts.customers.toLocaleString('ko-KR')}곳`;
    case 'supply':
      return `책임자 ${counts.managers}명 · 팀장 ${counts.subcontractors}명`;
    case 'profit':
      return `프로젝트 ${counts.projects.toLocaleString('ko-KR')}건`;
    default:
      return `딜 ${counts.deals.toLocaleString('ko-KR')} · 고객 ${counts.customers.toLocaleString('ko-KR')} · 프로젝트 ${counts.projects.toLocaleString('ko-KR')}`;
  }
}
