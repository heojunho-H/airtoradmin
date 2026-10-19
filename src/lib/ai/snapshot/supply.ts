// 공급망 전문가 스냅샷 — 고객책임자 실적(기록에서 계산), 작업팀장 점수·감점·추세, 수요 대비 여력, 쏠림, 평가 누락.

import { addDays, cell, manwon, pct, ratio, scrub, section, table, ymd, type Section } from './common';
import { EVAL_ITEMS, isLowUsage, usageOf, type Ctx, type ManagerFact, type SubFact } from './derive';

const AREAS = ['서울 수도권', '충청권', '경상권'];

function avgText(v: number | null) {
  return v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
}

function mainNegatives(s: SubFact, top = 2): string {
  const list = Object.entries(s.negatives)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([k, n]) => `${k} ${n}회`);
  return list.join(', ') || '-';
}

export function supplySections(ctx: Ctx, managers: ManagerFact[], subs: SubFact[]): Section[] {
  // 고객책임자
  const managerRows = managers
    .slice()
    .sort((a, b) => b.wonAmount - a.wonAmount || b.deals - a.deals)
    .map((m) => [
      cell(m.name, 10),
      m.status,
      cell(m.area, 8),
      `${m.deals}건`,
      `${m.won}건`,
      `${m.lost}건`,
      `${m.open}건`,
      pct(ratio(m.won, m.won + m.lost)),
      manwon(m.wonAmount),
      `${m.urgent}건`,
      `${m.customers}곳`,
      ['S', 'A', 'B', '미설정'].map((g) => `${g} ${m.byGrade[g] ?? 0}`).join('/'),
      `${m.overdue}곳`,
      pct(ratio(m.repeatCustomers, m.customers)),
      `${m.jobs90}건`,
      `${m.upcoming}건`,
    ]);

  // 작업팀장
  const usage = usageOf(ctx);
  const sparse = isLowUsage(usage.subAssignRate);
  const sorted = subs.slice().sort((a, b) => b.score - a.score);
  const gradeCount = ['1등급', '2등급', '3등급', '4등급', '퇴출 심사'].map((g) => `${g} ${subs.filter((s) => s.grade === g).length}명`).join(', ');
  const pastJobs = subs.reduce((sum, s) => sum + s.pastJobs, 0);
  const evaluatedPast = subs.reduce((sum, s) => sum + s.pastEvaluated, 0);

  const scoreRows = sorted.map((s) => [
    cell(s.name, 10),
    cell(s.s.company, 14),
    s.status,
    cell(s.area, 8),
    cell(s.specialization || '-', 12),
    `${s.teamSize}명`,
    `${s.score}점`,
    s.grade,
    `${s.base}`,
    `${s.evalSum >= 0 ? '+' : ''}${s.evalSum}`,
    `+${s.repurchase * 3}`,
    `${s.coop >= 0 ? '+' : ''}${s.coop}`,
    `${s.jobCount}/${s.jobs90}건`,
    s.lastJob || '-',
    `${s.upcoming}건`,
    s.coverage == null ? '-' : pct(s.coverage),
    avgText(s.avgJobScore),
    avgText(s.recentAvg),
    avgText(s.prevAvg),
  ]);

  const negRows = sorted
    .filter((s) => s.evaluated > 0)
    .map((s) => ({ s, total: Object.values(s.negatives).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
    .map(({ s, total }) => [cell(s.name, 10), `${s.evaluated}건`, ...EVAL_ITEMS.map(([, label]) => `${s.negatives[label]}`), `${total}`]);

  const watch = sorted.filter((s) => s.grade === '퇴출 심사' || s.grade === '4등급' || (s.recentAvg != null && s.recentAvg < 0));
  const watchRows = watch
    .slice()
    .sort((a, b) => a.score - b.score)
    .map((s) => [cell(s.name, 10), `${s.score}점`, s.grade, mainNegatives(s), avgText(s.recentAvg), s.lastJob || '-', `${s.upcoming}건`, s.status, scrub(s.lastCoopMemo, 40)]);

  // 평가 미입력 작업 (작업팀장 기록 기준)
  const unevaluated: string[][] = [];
  for (const s of subs) {
    for (const a of Array.isArray(s.s.recentActivities) ? s.s.recentActivities : []) {
      const d = ymd(a.workDate);
      if (!d || d > ctx.today) continue;
      const done = EVAL_ITEMS.some(([k]) => a[k] !== undefined && a[k] !== null && a[k] !== '');
      if (!done) unevaluated.push([d, cell(a.customerCompany), cell(a.projectName, 14), cell(s.name, 10)]);
    }
  }
  unevaluated.sort((a, b) => b[0].localeCompare(a[0]));

  // 수요 대비 여력 (앞으로 30일)
  const until = addDays(ctx.today, 30);
  const week = addDays(ctx.today, 7);
  const upcoming = ctx.jobs.filter((j) => j.workDate > ctx.today && j.workDate <= until).sort((a, b) => a.workDate.localeCompare(b.workDate));
  const capacityRows = [...AREAS, '기타·주소 없음'].map((area) => {
    const inArea = upcoming.filter((j) => (area === '기타·주소 없음' ? !AREAS.includes(j.area) : j.area === area));
    const teams = subs.filter((s) => (area === '기타·주소 없음' ? !AREAS.includes(s.area) : s.area === area));
    return [
      area,
      `${inArea.filter((j) => j.workDate <= week).length}건`,
      `${inArea.filter((j) => j.workDate > week).length}건`,
      `${inArea.filter((j) => j.subcontractors.length === 0).length}건`,
      `${teams.filter((s) => s.status === '투입가능').length}명`,
      `${teams.length}명`,
    ];
  });
  const projectsNoDate = ctx.ds.projects.filter((p) => p.status !== 'completed' && !ymd(p.workDate)).length;

  // 쏠림 (최근 6개월)
  const since = addDays(ctx.today, -180);
  const recentJobs = ctx.jobs.filter((j) => j.workDate && j.workDate >= since && j.workDate <= ctx.today);
  const perSub = new Map<string, number>();
  for (const j of recentJobs) for (const name of j.subcontractors) perSub.set(name, (perSub.get(name) ?? 0) + 1);
  const ranked = [...perSub.entries()].sort((a, b) => b[1] - a[1]);
  const assignedJobs = recentJobs.filter((j) => j.subcontractors.length > 0).length;
  const top3 = ranked.slice(0, 3);
  const top3Jobs = recentJobs.filter((j) => j.subcontractors.some((n) => top3.some(([t]) => t === n))).length;

  return [
    section(`고객책임자 (${managers.length}명, 오늘 ${ctx.today})`, [
      `- 상태별: ${['근무중', '휴가', '퇴사'].map((st) => `${st} ${managers.filter((m) => m.status === st).length}명`).join(', ')}`,
      '- 실적은 딜(담당 고객책임자)·고객(담당)·작업 이력에서 다시 계산했다. 수주율 = 결정 딜 수주율(성공 ÷ (성공+실패)).',
    ], [
      table('고객책임자 실적', '성공 금액 큰 순',
        ['이름', '상태', '권역', '담당 딜', '성공', '실패', '진행중', '수주율', '성공 금액', 'D-3 이내 딜', '담당 고객', '등급(S/A/B/미설정)', '기한 초과 고객', '재구매 고객 비중', '최근 90일 작업', '예정 작업'],
        managerRows, 30),
    ]),
    section(`작업팀장 (${subs.length}명)`, [
      `- 기록 입력 현황: 작업 이력 ${ctx.jobs.length}건 중 작업팀장이 배정된 작업 ${usage.subAssigned}건(${pct(usage.subAssignRate)}), 평가된 작업 ${evaluatedPast}건, 협력평가 ${subs.reduce((a, s2) => a + s2.coopEvals, 0)}건.`,
      ...(sparse
        ? ['- ⚠ 작업팀장 배정·평가 기록이 거의 없어 점수는 대부분 기본점수만 반영한다. 팀장별 실력·쏠림·감점 비교는 근거가 부족하다 — 결론을 내지 말고 "데이터 부족"을 먼저 밝히고, 작업 이력에 작업팀장 배정과 작업평가 입력을 권한다.']
        : []),
      '- 최종 점수 = 기본점수(없으면 50) + 작업 점수 합 + 재구매 건수×3 + 협력점수. 80 이상 1등급, 60 이상 2등급, 40 이상 3등급, 20 이상 4등급, 20 미만 퇴출 심사.',
      '- 작업 점수(작업 1건) = 6개 항목 합: 고객클레임 −2~+1, 모든 기기 작업 −2/0, 작업 예정시간 −2~+1, A/S 발생 −2~+1, 유니폼 −2~+2, 친절 −2~+1 (범위 −12~+6).',
      '- 협력점수 = 협력평가(오더 우선 협력 ±1, 공급가 초과 요구 ±1) 누적 합.',
      `- 계산 등급 분포: ${gradeCount}`,
      `- 상태별: ${['투입가능', '업무중', '휴가'].map((st) => `${st} ${subs.filter((s) => s.status === st).length}명`).join(', ')} / 권역별: ${AREAS.map((a) => `${a} ${subs.filter((s) => s.area === a).length}명`).join(', ')}`,
      `- 평가 입력률(전체): 평가된 지난 작업 ${evaluatedPast}건 ÷ 지난 작업 ${pastJobs}건 = ${pct(ratio(evaluatedPast, pastJobs))}`,
      `- 쏠림: 최근 6개월 팀장 배정 작업 ${assignedJobs}건 중 상위 3명(${top3.map(([nm, c]) => `${nm} ${c}건`).join(', ') || '-'})이 맡은 작업 ${top3Jobs}건 = ${pct(ratio(top3Jobs, assignedJobs))}`,
    ], [
      table('작업팀장 점수표', '최종 점수 높은 순',
        ['이름', '업체', '상태', '권역', '전문분야', '팀규모', '최종 점수', '계산 등급', '기본', '작업 점수 합', '재구매×3', '협력', '작업(전체/90일)', '최근 작업일', '예정 작업', '평가 입력률', '평균 작업 점수', '최근 3건 평균', '이전 3건 평균'],
        scoreRows, 40),
      table('항목별 감점 횟수 (평가된 작업 기준)', '감점 많은 순',
        ['이름', '평가 작업', ...EVAL_ITEMS.map(([, label]) => label), '감점 합계'], negRows, 40),
      table('감시 목록 (퇴출 심사·4등급·최근 3건 평균 음수)', '점수 낮은 순',
        ['이름', '최종 점수', '계산 등급', '주된 감점', '최근 3건 평균', '최근 작업일', '예정 작업', '상태', '최근 협력평가 메모'], watchRows, 30),
      table('평가 미입력 작업 (작업일 지난 것)', '작업일 최근순', ['작업일', '기업명', '서비스', '작업팀장'], unevaluated, 40),
    ]),
    section('수요 대비 인력 여력 (앞으로 30일)', [
      `- 예정 작업 = 작업 이력에서 작업일이 내일~${until}인 작업 ${upcoming.length}건. 권역은 고객 주소의 시/도로 나눴다.`,
      `- 작업일이 비어 있는 진행중 프로젝트 ${projectsNoDate}건은 일정을 알 수 없어 빠져 있다.`,
    ], [
      table('권역별 예정 작업과 인력', '권역 순', ['권역', '7일 이내', '8~30일', '팀장 미배정', '투입가능 팀장', '전체 팀장'], capacityRows, 5),
      table('예정 작업', '작업일 순', ['작업일', '기업명', '권역', '서비스', '수량', '작업팀장', '담당'],
        upcoming.map((j) => [j.workDate, cell(j.company), cell(j.area || '-', 8), cell(j.service, 14), `${j.quantity}대`, cell(j.subcontractors.join('/') || '미배정', 20), cell(j.manager, 10)]), 40),
    ]),
    section('데이터 주의사항', [
      '- 고객책임자의 저장 필드(매출·성과평가·재구매율·진행/완료 건수)와 작업팀장의 저장 필드(진행/완료 건수)는 입력되지 않아 쓰지 않았다.',
      '- 작업팀장의 저장 등급(S/A/B/C)은 새 팀장에 C로 들어간 뒤 갱신되지 않아 쓰지 않는다. 등급은 최종 점수로 계산한 1~4등급/퇴출 심사다.',
      '- 평가는 작업팀장 화면에서 입력한 것만 있다. 평가 입력률이 낮으면 점수가 실력을 대표하지 못한다. 작업일을 고치면 그 작업의 평가가 사라질 수 있다.',
      '- 작업팀장의 작업 = 작업 이력의 작업팀장 칸에 이름이 들어간 작업. 기본점수 0은 50으로 계산한다(화면과 같음).',
    ]),
  ];
}
