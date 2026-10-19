// 고객관리(CRM) 전문가 스냅샷 — 다시 계산한 관리일, RFM 세그먼트, 재구매 간격, 교차판매 후보, 사후 관리.

import { daysBetween } from '../format';
import { addDays, cell, eok, manwon, pct, ratio, section, table, type Section } from './common';
import { isLowUsage, SEGMENT_RULES, usageOf, type Ctx, type CustomerFact } from './derive';

const SEGMENT_ORDER = ['VIP', '충성', '재구매', '신규', '이탈 위험', '관리 지연', '휴면', '작업 이력 없음'];
const GRADE_ORDER = ['S', 'A', 'B', '미설정'];

function gradeRank(g: string) {
  const i = GRADE_ORDER.indexOf(g);
  return i < 0 ? 9 : i;
}

export function crmSections(ctx: Ctx, customers: CustomerFact[]): Section[] {
  const total = customers.reduce((s, c) => s + c.amount, 0);
  const n = customers.length;
  const repeat2 = customers.filter((c) => c.jobCount >= 2).length;
  const loyal3 = customers.filter((c) => c.jobCount >= 3).length;
  const top10 = customers.slice().sort((a, b) => b.amount - a.amount).slice(0, 10).reduce((s, c) => s + c.amount, 0);
  const rec = { d90: 0, d180: 0, d365: 0, older: 0, none: 0 };
  for (const c of customers) {
    if (c.recency == null) rec.none++;
    else if (c.recency <= 90) rec.d90++;
    else if (c.recency <= 180) rec.d180++;
    else if (c.recency <= 365) rec.d365++;
    else rec.older++;
  }
  const gradeLine = GRADE_ORDER.map((g) => {
    const list = customers.filter((c) => c.grade === g);
    return `${g === '미설정' ? '등급 미설정' : `${g}등급`} ${list.length}곳(매출 ${pct(ratio(list.reduce((s, c) => s + c.amount, 0), total))})`;
  }).join(', ');
  const statuses = new Map<string, number>();
  for (const c of customers) statuses.set(c.status, (statuses.get(c.status) ?? 0) + 1);
  const news = new Map<string, number>();
  const NEWS: Record<string, string> = { subscribed: '구독', unsubscribed: '수신거부', bounced: '반송', none: '미등록' };
  for (const c of customers) news.set(NEWS[c.newsletter] ?? c.newsletter, (news.get(NEWS[c.newsletter] ?? c.newsletter) ?? 0) + 1);

  const segRows = SEGMENT_ORDER.map((seg) => {
    const list = customers.filter((c) => c.segment === seg).sort((a, b) => b.amount - a.amount);
    if (!list.length) return null;
    const amt = list.reduce((s, c) => s + c.amount, 0);
    return [seg, `${list.length}곳`, manwon(amt), pct(ratio(amt, total)), list.slice(0, 3).map((c) => cell(c.company, 14)).join(', ')];
  }).filter((r): r is string[] => !!r);

  const overdue = customers
    .filter((c) => c.daysToMgmt != null && c.daysToMgmt < 0)
    .sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || b.amount - a.amount);
  const soon = customers
    .filter((c) => c.daysToMgmt != null && c.daysToMgmt >= 0 && c.daysToMgmt <= 30)
    .sort((a, b) => (a.daysToMgmt ?? 0) - (b.daysToMgmt ?? 0));
  const late = customers
    .filter((c) => c.avgInterval != null && c.avgInterval > c.cycle)
    .sort((a, b) => (b.avgInterval ?? 0) - b.cycle - ((a.avgInterval ?? 0) - a.cycle));
  const crossAll = customers.filter((c) => c.jobCount > 0 && c.categories.length === 1).sort((a, b) => b.amount - a.amount);
  const cross = crossAll.slice(0, 40);
  const noReport = ctx.jobs
    .filter((j) => j.workDate && j.workDate <= ctx.today && !j.reportSent)
    .sort((a, b) => b.workDate.localeCompare(a.workDate));
  const stale14 = noReport.filter((j) => j.workDate <= addDays(ctx.today, -14)).length;
  const usage = usageOf(ctx);
  const reportUnused = isLowUsage(usage.reportRate);

  const byManager = new Map<string, CustomerFact[]>();
  for (const c of customers) byManager.set(c.manager, [...(byManager.get(c.manager) ?? []), c]);
  const managerRows = [...byManager.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([m, list]) => [
      cell(m, 10),
      `${list.length}곳`,
      GRADE_ORDER.map((g) => `${g === '미설정' ? '미설정' : g} ${list.filter((c) => c.grade === g).length}`).join('/'),
      `${list.filter((c) => c.daysToMgmt != null && c.daysToMgmt < 0).length}곳`,
      pct(ratio(list.filter((c) => c.jobCount >= 2).length, list.length)),
      manwon(list.reduce((s, c) => s + c.amount, 0)),
    ]);

  const mgmt = (c: CustomerFact) => (c.nextMgmt ? c.nextMgmt : '-');
  const lastService = (c: CustomerFact) => cell(c.jobs[0]?.service, 14);

  return [
    section(`고객 포트폴리오 (전체 ${n}곳, 누적 거래 ${eok(total)}, 오늘 ${ctx.today})`, [
      `- 등급별 고객 수와 매출 비중: ${gradeLine}`,
      `- 상태별: ${[...statuses.entries()].map(([k, v]) => `${k} ${v}곳`).join(', ')}`,
      `- 2회 이상 재구매율 = 작업 2회 이상 ${repeat2}곳 ÷ 전체 ${n}곳 = ${pct(ratio(repeat2, n))} (고객 화면 KPI)`,
      `- 충성고객 전환율 = 작업 3회 이상 ${loyal3}곳 ÷ 전체 ${n}곳 = ${pct(ratio(loyal3, n))} (고객 화면 KPI)`,
      `- 매출 집중도: 상위 10곳이 누적 거래의 ${pct(ratio(top10, total))}`,
      `- 최근 작업 경과: 90일 이내 ${rec.d90}곳, 91~180일 ${rec.d180}곳, 181~365일 ${rec.d365}곳, 1년 초과 ${rec.older}곳, 작업일 없음 ${rec.none}곳`,
      `- 관리 기한 초과 ${overdue.length}곳 (S·A 등급 ${overdue.filter((c) => c.grade === 'S' || c.grade === 'A').length}곳), 30일 이내 관리 예정 ${soon.length}곳`,
      reportUnused
        ? `- 리포트 전송 체크 사용률: 지난 작업 ${usage.pastJobs}건 중 ${usage.reportSent}건(${pct(usage.reportRate)}) — 기능을 거의 쓰지 않아 미발송 목록은 넣지 않았다. 미발송 여부로 사후 관리를 판단하지 말 것.`
        : `- 리포트 미발송 작업 ${noReport.length}건 (작업 후 14일 넘은 것 ${stale14}건), 리포트 전송 체크 사용률 ${pct(usage.reportRate)}`,
      `- 뉴스레터: ${[...news.entries()].map(([k, v]) => `${k} ${v}곳`).join(', ')}`,
    ], [
      table('RFM 세그먼트', '세그먼트 순', ['세그먼트', '고객 수', '누적 거래', '매출 비중', '대표 고객(금액순)'], segRows, 10),
    ]),
    section('관리 일정 (다음 관리일 = 최근 작업일 + 관리 주기, 다시 계산한 값)', [
      '- 관리 주기 30·90·180·365·730일은 1·3·6·12·24개월로, 그 외는 일수로 더한다 (고객 상세 화면과 같은 계산).',
    ], [
      table('관리 기한 초과 고객', '등급·금액순', ['기업명', '등급', '세그먼트', '최근 작업일', '관리 주기', '다음 관리일', '초과', '작업 횟수', '누적 거래', '최근 서비스', '담당'],
        overdue.map((c) => [cell(c.company), c.grade, c.segment, c.lastWork || '-', `${c.cycle}일`, mgmt(c), `${-(c.daysToMgmt ?? 0)}일`, `${c.jobCount}회`, manwon(c.amount), lastService(c), cell(c.manager, 10)]), 60),
      table('30일 이내 관리 예정 고객', '기한 가까운 순', ['기업명', '등급', '다음 관리일', '남은 일', '작업 횟수', '누적 거래', '최근 서비스', '담당'],
        soon.map((c) => [cell(c.company), c.grade, mgmt(c), `D-${c.daysToMgmt}`, `${c.jobCount}회`, manwon(c.amount), lastService(c), cell(c.manager, 10)]), 40),
      table('재구매 간격이 관리 주기보다 긴 고객', '초과 큰 순', ['기업명', '등급', '실제 평균 간격', '관리 주기', '작업 횟수', '최근 작업일', '누적 거래', '담당'],
        late.map((c) => [cell(c.company), c.grade, `${c.avgInterval}일`, `${c.cycle}일`, `${c.jobCount}회`, c.lastWork || '-', manwon(c.amount), cell(c.manager, 10)]), 30),
    ]),
    section('성장 기회와 사후 관리', [
      `- 교차판매 후보 = 지금까지 한 가지 서비스 분류(에어컨세척·해충방제·표면소독·실내공기질·기타)만 이용한 고객 ${crossAll.length}곳. 아래 표는 누적 거래 상위 40곳.`,
    ], [
      table('교차판매 후보', '누적 거래 큰 순', ['기업명', '등급', '세그먼트', '이용 서비스', '작업 횟수', '누적 거래', '최근 작업일', '담당'],
        cross.map((c) => [cell(c.company), c.grade, c.segment, cell(c.services.join('/'), 24), `${c.jobCount}회`, manwon(c.amount), c.lastWork || '-', cell(c.manager, 10)]), 40),
      ...(reportUnused
        ? []
        : [
            table('리포트 미발송 작업', '작업일 최근순', ['작업일', '경과', '기업명', '서비스', '금액', '담당', '리마인드 발송'],
              noReport.map((j) => [j.workDate, `${daysBetween(j.workDate, ctx.today)}일`, cell(j.company), cell(j.service, 14), manwon(j.amount), cell(j.manager, 10), `${j.remindersSent}회`]), 40),
          ]),
      table('담당 책임자별 고객', '고객 많은 순', ['담당', '고객 수', '등급(S/A/B/미설정)', '기한 초과', '재구매 고객 비중', '누적 거래'], managerRows, 30),
    ]),
    section('고객 목록', [], [
      table('고객 목록', '누적 거래 큰 순', ['기업명', '등급', '상태', '세그먼트', '작업 횟수', '누적 거래', '최근 작업일', '관리 주기', '다음 관리일', '이용 서비스', '담당', '지역'],
        customers
          .slice()
          .sort((a, b) => b.amount - a.amount)
          .map((c) => [cell(c.company), c.grade, cell(c.status, 6), c.segment, `${c.jobCount}회`, manwon(c.amount), c.lastWork || '-', `${c.cycle}일`, mgmt(c), cell(c.services.join('/'), 24), cell(c.manager, 10), cell(c.sido || '-', 4)]), 80),
    ]),
    section('데이터 주의사항', [
      `- RFM 세그먼트 규칙: ${SEGMENT_RULES.join(' / ')}. 금액 상위 20% = 누적 거래 기준.`,
      '- 저장된 "다음 관리 예정일"은 고객 생성 때만 계산되고 갱신되지 않아 쓰지 않았다. 위의 다음 관리일은 다시 계산한 값이다.',
      '- 등급은 사람이 직접 지정한다. 수주로 자동 생성된 고객은 "미설정"이다. 고객 업종 정보는 없다.',
      '- 누적 거래·작업 금액은 VAT 포함 견적 기준이다. 연락처는 넣지 않았다.',
    ]),
  ];
}
