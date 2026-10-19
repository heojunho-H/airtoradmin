// 종합 분석 AI 스냅샷 — 규칙으로 고른 "지금 챙길 일" + 영역별 핵심 지표 요약.
// 정의는 전문가 스냅샷과 같다(자동 실패 15일, 다시 계산한 관리일, 최종 점수 등급, 배치 입력 기준 순익률).

import { addDays, cell, manwon, monthOf, pct, ratio, section, shiftMonth, STAGE_LABELS, table, type Section } from './common';
import { isLowUsage, usageOf, type Ctx, type CustomerFact, type DealFact, type ProjectFact, type SubFact } from './derive';

function monthStats(deals: DealFact[], ym: string): string {
  const list = deals.filter((d) => d.date.startsWith(ym));
  const won = list.filter((d) => d.result === 'success');
  const lost = list.filter((d) => d.result === 'failed').length;
  const wonAmt = won.reduce((s, d) => s + d.amount, 0);
  return `문의 ${list.length}건, 계약 성공 ${won.length}건(${manwon(wonAmt)}), 계약 실패 ${lost}건, 계약 성공률(건수) ${pct(ratio(won.length, list.length))}, 결정 딜 수주율 ${pct(ratio(won.length, won.length + lost))}`;
}

export function overviewSections(ctx: Ctx, deals: DealFact[], customers: CustomerFact[], subs: SubFact[], projects: ProjectFact[]): Section[] {
  const thisMonth = monthOf(ctx.today);
  const open = deals.filter((d) => d.result === 'in-progress');
  const staffed = projects.filter((p) => p.hasStaffing && p.revenue > 0);
  const weighted = ratio(staffed.reduce((s, p) => s + p.profit, 0), staffed.reduce((s, p) => s + p.revenue, 0));

  // 지금 챙길 일 (규칙 고정)
  const actions: string[][] = [];
  const push = (kind: string, target: string, detail: string, owner: string) => actions.push([`${actions.length + 1}`, kind, target, detail, owner]);
  open
    .filter((d) => d.daysLeft != null && d.daysLeft <= 3)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0) || b.amount - a.amount)
    .slice(0, 4)
    .forEach((d) =>
      push('딜 자동 실패 임박', cell(d.d.company, 20), `${(d.daysLeft ?? 0) <= 0 ? '자동 실패 기한 지남(미처리)' : `자동 실패 D-${d.daysLeft}`} · ${STAGE_LABELS[d.stage] ?? d.stage} · 견적 ${manwon(d.amount)}`, d.manager),
    );
  customers
    .filter((c) => (c.grade === 'S' || c.grade === 'A') && c.daysToMgmt != null && c.daysToMgmt < 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4)
    .forEach((c) => push(`${c.grade}등급 관리 기한 초과`, cell(c.company, 20), `${-(c.daysToMgmt ?? 0)}일 초과 · 최근 작업 ${c.lastWork || '-'} · 누적 ${manwon(c.amount)}`, c.manager));
  staffed
    .filter((p) => p.status === '진행중' && p.margin != null && p.margin < 0.1)
    .sort((a, b) => (a.margin ?? 0) - (b.margin ?? 0))
    .slice(0, 3)
    .forEach((p) => push(p.margin! < 0 ? '진행중 적자 프로젝트' : '진행중 저마진 프로젝트', cell(`${p.company} ${p.service}`, 24), `순익률 ${pct(p.margin, 1)} · 인건비율 ${pct(p.laborRatio)} · 순매출 ${manwon(p.revenue)}`, '-'));
  subs
    .filter((s) => (s.grade === '퇴출 심사' || s.grade === '4등급') && (s.upcoming > 0 || s.jobs90 > 0))
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .forEach((s) => push('하위 등급 작업팀장 투입', cell(s.name, 12), `최종 점수 ${s.score}점(${s.grade}) · 최근 90일 작업 ${s.jobs90}건 · 예정 ${s.upcoming}건`, '-'));
  const usage = usageOf(ctx);
  const reportUnused = isLowUsage(usage.reportRate);
  const staleReports = reportUnused
    ? []
    : ctx.jobs.filter((j) => j.workDate && j.workDate <= addDays(ctx.today, -14) && !j.reportSent).sort((a, b) => b.workDate.localeCompare(a.workDate));
  staleReports.slice(0, 2).forEach((j) => push('리포트 미발송(14일 초과)', cell(j.company, 20), `작업일 ${j.workDate} · ${j.service}`, j.manager || '-'));

  const overdueAll = customers.filter((c) => c.daysToMgmt != null && c.daysToMgmt < 0);
  const segCount = (seg: string) => customers.filter((c) => c.segment === seg).length;
  const upcoming30 = ctx.jobs.filter((j) => j.workDate > ctx.today && j.workDate <= addDays(ctx.today, 30));
  const areas = ['서울 수도권', '충청권', '경상권'];

  return [
    section(`지금 챙길 일 (오늘 ${ctx.today}, 규칙으로 고른 목록)`, [
      '- 규칙(우선순위 순): ① 자동 실패 D-3 이내 딜(남은 일·금액순, 최대 4) ② S·A 등급 관리 기한 초과 고객(금액순, 최대 4) ③ 진행중 적자·순익률 10% 미만 프로젝트(최대 3) ④ 퇴출 심사·4등급인데 최근 90일 작업이나 예정 작업이 있는 작업팀장(최대 2) ⑤ 작업 후 14일 넘게 리포트 미발송(최근순, 최대 2).',
      `- 해당 건수 전체: ①${open.filter((d) => d.daysLeft != null && d.daysLeft <= 3).length}건 ②${overdueAll.filter((c) => c.grade === 'S' || c.grade === 'A').length}곳 ③${staffed.filter((p) => p.status === '진행중' && p.margin != null && p.margin < 0.1).length}건 ④${subs.filter((s) => (s.grade === '퇴출 심사' || s.grade === '4등급') && (s.upcoming > 0 || s.jobs90 > 0)).length}명 ⑤${staleReports.length}건`,
    ], [table('지금 챙길 일', '우선순위 순', ['순위', '구분', '대상', '내용', '담당'], actions, 15)]),
    section('영업 요약', [
      `- 이번 달(${thisMonth}): ${monthStats(deals, thisMonth)}`,
      `- 지난달(${shiftMonth(thisMonth, -1)}): ${monthStats(deals, shiftMonth(thisMonth, -1))}`,
      `- 진행중 ${open.length}건, 파이프라인 가치 ${manwon(open.reduce((s, d) => s + d.amount, 0))}, 자동 실패 D-3 이내 ${open.filter((d) => d.daysLeft != null && d.daysLeft <= 3).length}건`,
      '- 계약 성공률(건수) = 성공 ÷ 전체 딜(영업 화면 KPI), 결정 딜 수주율 = 성공 ÷ (성공+실패). 계약 실패에는 15일 자동 실패가 섞여 있다.',
    ], [
      table('진행중 큰 딜 상위 10건', '견적 큰 순', ['기업명', '단계', '견적', '자동 실패', '담당'],
        open.slice().sort((a, b) => b.amount - a.amount).slice(0, 10).map((d) => [cell(d.d.company), STAGE_LABELS[d.stage] ?? d.stage, manwon(d.amount), d.daysLeft == null ? '-' : d.daysLeft <= 0 ? '미처리' : `D-${d.daysLeft}`, cell(d.manager, 10)]), 10),
    ]),
    section('고객 요약', [
      `- 전체 ${customers.length}곳, 2회 이상 재구매율 ${pct(ratio(customers.filter((c) => c.jobCount >= 2).length, customers.length))}, 충성고객 전환율 ${pct(ratio(customers.filter((c) => c.jobCount >= 3).length, customers.length))}`,
      `- 관리 기한 초과 ${overdueAll.length}곳 (S·A ${overdueAll.filter((c) => c.grade === 'S' || c.grade === 'A').length}곳), 30일 이내 예정 ${customers.filter((c) => c.daysToMgmt != null && c.daysToMgmt >= 0 && c.daysToMgmt <= 30).length}곳 — 다음 관리일은 최근 작업일+관리 주기로 다시 계산한 값`,
      `- S·A 등급 관리 기한 초과 전체(금액순): ${overdueAll.filter((c) => c.grade === 'S' || c.grade === 'A').sort((a, b) => b.amount - a.amount).map((c) => `${cell(c.company, 16)}(${c.grade}, ${-(c.daysToMgmt ?? 0)}일 초과, ${manwon(c.amount)}, 담당 ${c.manager})`).join(', ') || '없음'}`,
      `- RFM 세그먼트: VIP ${segCount('VIP')}, 충성 ${segCount('충성')}, 재구매 ${segCount('재구매')}, 신규 ${segCount('신규')}, 이탈 위험 ${segCount('이탈 위험')}, 관리 지연 ${segCount('관리 지연')}, 휴면 ${segCount('휴면')}`,
    ], [
      table('주요 고객 상위 10곳', '누적 거래 큰 순', ['기업명', '등급', '세그먼트', '누적 거래', '다음 관리일', '담당'],
        customers.slice().sort((a, b) => b.amount - a.amount).slice(0, 10).map((c) => [cell(c.company), c.grade, c.segment, manwon(c.amount), c.nextMgmt || '-', cell(c.manager, 10)]), 10),
    ]),
    section('공급망 요약', [
      `- 작업팀장 ${subs.length}명 계산 등급: ${['1등급', '2등급', '3등급', '4등급', '퇴출 심사'].map((g) => `${g} ${subs.filter((s) => s.grade === g).length}`).join(', ')}`,
      `- 앞으로 30일 예정 작업 ${upcoming30.length}건: ${areas.map((a) => `${a} ${upcoming30.filter((j) => j.area === a).length}건(투입가능 팀장 ${subs.filter((s) => s.area === a && s.status === '투입가능').length}명)`).join(', ')}, 팀장 미배정 ${upcoming30.filter((j) => j.subcontractors.length === 0).length}건`,
      '- 최종 점수 = 기본점수(없으면 50) + 작업 점수 합 + 재구매×3 + 협력점수 (80↑ 1등급 … 20 미만 퇴출 심사).',
    ]),
    section('손익 요약', [
      `- 프로젝트 ${projects.length}건(진행중 ${projects.filter((p) => p.status === '진행중').length}, 완료 ${projects.filter((p) => p.status === '완료').length}), 배치 입력 ${staffed.length}건 기준 가중 순익률 ${pct(weighted, 1)}`,
      `- 순익률 구간: 적자 ${staffed.filter((p) => (p.margin ?? 0) < 0).length}건, 0~10% ${staffed.filter((p) => p.margin != null && p.margin >= 0 && p.margin < 0.1).length}건, 10~30% ${staffed.filter((p) => p.margin != null && p.margin >= 0.1 && p.margin < 0.3).length}건, 30% 이상 ${staffed.filter((p) => (p.margin ?? 0) >= 0.3).length}건 / 목표 40% 이상 ${staffed.filter((p) => (p.margin ?? 0) >= 0.4).length}건`,
    ]),
    section('데이터 주의사항', [
      '- 이 요약은 영역별 핵심만 담았다. 원인 분석·세부 목록이 필요하면 영업·고객관리·공급망·손익 전문가가 더 정확하다.',
      '- 고객책임자·작업팀장의 저장 실적 필드와 작업팀장 저장 등급, 고객의 저장된 다음 관리일, 프로젝트 AI 채택 표시는 쓰지 않는다(갱신되지 않음).',
      `- 기록 입력 현황: 작업 이력 ${ctx.jobs.length}건 중 작업팀장 배정 ${usage.subAssigned}건(${pct(usage.subAssignRate)}), 리포트 전송 체크 ${usage.reportSent}/${usage.pastJobs}건(${pct(usage.reportRate)}), 인력 배치가 입력된 프로젝트 ${staffed.length}/${projects.length}건.${reportUnused ? ' 리포트 체크를 거의 쓰지 않아 규칙 ⑤는 적용하지 않았다.' : ''}`,
    ]),
  ];
}
