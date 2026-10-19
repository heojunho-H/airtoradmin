// 영업 전문가 스냅샷 — 파이프라인, 자동 실패 카운트다운, 담당자·구간별 성과, 종료 딜.

import { cell, equipmentMix, manwon, monthOf, pct, ratio, RESULT_LABELS, scrub, section, shiftMonth, STAGE_LABELS, STAGE_ORDER, table, type Section } from './common';
import { amountBand, AUTO_FAIL_DAYS, quantityBand, type Ctx, type DealFact } from './derive';

function stageLabel(s: string) {
  return STAGE_LABELS[s] ?? (s || '-');
}

function dayLabel(d: DealFact): string {
  if (d.daysLeft == null) return '-';
  return d.daysLeft <= 0 ? '자동 실패 미처리' : `D-${d.daysLeft}`;
}

interface Tally {
  total: number;
  won: number;
  lost: number;
  open: number;
  wonAmount: number;
}

function tally(list: DealFact[]): Tally {
  return {
    total: list.length,
    won: list.filter((d) => d.result === 'success').length,
    lost: list.filter((d) => d.result === 'failed').length,
    open: list.filter((d) => d.result === 'in-progress').length,
    wonAmount: list.filter((d) => d.result === 'success').reduce((s, d) => s + d.amount, 0),
  };
}

/** 계약 성공률(건수) · 결정 딜 수주율 */
function rates(t: Tally): [string, string] {
  return [pct(ratio(t.won, t.total)), pct(ratio(t.won, t.won + t.lost))];
}

function trendLine(ym: string, deals: DealFact[]): string {
  const t = tally(deals.filter((d) => d.date.startsWith(ym)));
  return `  - ${ym}: 문의 ${t.total}건, 계약 성공 ${t.won}건(${manwon(t.wonAmount)}), 계약 실패 ${t.lost}건, 결정 딜 수주율 ${rates(t)[1]}`;
}

function monthLine(label: string, ym: string, deals: DealFact[]): string {
  const inMonth = deals.filter((d) => d.date.startsWith(ym));
  const t = tally(inMonth);
  const quoted = inMonth.reduce((s, d) => s + d.amount, 0);
  const [all, decided] = rates(t);
  return `- ${label}(${ym}): 문의 ${t.total}건, 계약 성공 ${t.won}건(${manwon(t.wonAmount)}), 계약 실패 ${t.lost}건, 진행중 ${t.open}건, 계약 성공률(건수) ${all}, 금액 기준 ${pct(ratio(t.wonAmount, quoted))}, 결정 딜 수주율 ${decided}`;
}

export function salesSections(ctx: Ctx, deals: DealFact[]): Section[] {
  const t = tally(deals);
  const quoted = deals.reduce((s, d) => s + d.amount, 0);
  const [allRate, decidedRate] = rates(t);
  const thisMonth = monthOf(ctx.today);
  const open = deals.filter((d) => d.result === 'in-progress');
  const lead = deals.map((d) => d.leadDays).filter((x): x is number => x != null && x >= 0).sort((a, b) => a - b);

  // 진행중 단계별
  const stageRows = STAGE_ORDER.map((s) => {
    const list = open.filter((d) => d.stage === s);
    if (!list.length) return null;
    const ages = list.map((d) => d.age).filter(Number.isFinite);
    return [
      stageLabel(s),
      `${list.length}건`,
      manwon(list.reduce((sum, d) => sum + d.amount, 0)),
      ages.length ? `${Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)}일` : '-',
      `${list.filter((d) => d.daysLeft != null && d.daysLeft <= 3).length}건`,
    ];
  }).filter((r): r is string[] => !!r);

  // 담당자별
  const managers = [...new Set(deals.map((d) => d.manager))];
  const managerRows = managers
    .map((m) => ({ m, t: tally(deals.filter((d) => d.manager === m)), urgent: open.filter((d) => d.manager === m && d.daysLeft != null && d.daysLeft <= 3).length }))
    .sort((a, b) => b.t.total - a.t.total)
    .map(({ m, t: mt, urgent }) => {
      const [a, dcd] = rates(mt);
      return [cell(m, 10), `${mt.total}건`, `${mt.won}건`, `${mt.lost}건`, `${mt.open}건`, a, dcd, manwon(mt.wonAmount), `${urgent}건`];
    });

  // 구간별 성과
  const segRows: string[][] = [];
  const addSegments = (basis: string, key: (d: DealFact) => string, limit = 10) => {
    const groups = new Map<string, DealFact[]>();
    for (const d of deals) {
      const k = key(d);
      groups.set(k, [...(groups.get(k) ?? []), d]);
    }
    [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, limit)
      .forEach(([k, list]) => {
        const st = tally(list);
        const [a, dcd] = rates(st);
        segRows.push([basis, cell(k, 20), `${st.total}건`, `${st.won}건`, `${st.lost}건`, a, dcd, manwon(st.wonAmount)]);
      });
  };
  addSegments('서비스', (d) => d.service);
  addSegments('수량', (d) => quantityBand(d.quantity));
  addSegments('견적 규모', (d) => amountBand(d.amount));
  addSegments('권역', (d) => d.area || '주소 없음');
  addSegments('고객 구분', (d) => (d.existing ? '기존 고객' : '신규 고객'));

  // 실패 딜의 마지막 단계 (최근 6개월)
  const since6 = shiftMonth(thisMonth, -5);
  const lost6 = deals.filter((d) => d.result === 'failed' && monthOf(d.date) >= since6);
  const lostStages = STAGE_ORDER.map((s) => [s, lost6.filter((d) => d.stage === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${stageLabel(s)} ${n}건`)
    .join(', ');

  const openRows = open
    .slice()
    .sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99) || b.amount - a.amount)
    .map((d) => [
      cell(d.date, 10),
      Number.isFinite(d.age) ? `${d.age}일` : '-',
      dayLabel(d),
      cell(d.d.company),
      stageLabel(d.stage),
      cell(d.service, 16),
      `${d.quantity}대`,
      equipmentMix(d.d.detailedQuantity, 40),
      d.amount ? manwon(d.amount) : '-',
      cell(d.manager, 10),
      d.existing ? '기존' : '신규',
      cell(d.sido || '-', 4),
      cell(d.d.requirements, 50),
      scrub(d.d.managementMemo, 50),
    ]);

  const closedRows = deals
    .filter((d) => d.result !== 'in-progress')
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((d) => [
      cell(d.date, 10),
      cell(d.d.company),
      RESULT_LABELS[d.result] ?? (d.result || '-'),
      stageLabel(d.stage),
      cell(d.service, 16),
      `${d.quantity}대`,
      d.amount ? manwon(d.amount) : '-',
      cell(d.manager, 10),
      d.existing ? '기존' : '신규',
      cell(d.sido || '-', 4),
      cell(d.d.confirmedWorkDate, 10),
      scrub(d.d.managementMemo, 50),
    ]);

  return [
    section(`영업 현황 (전체 딜 ${t.total}건, 오늘 ${ctx.today})`, [
      `- 결과별: 진행중 ${t.open}건, 계약 성공 ${t.won}건, 계약 실패 ${t.lost}건, 미견적 ${deals.filter((d) => d.result === 'no-quote').length}건`,
      `- 계약 성공률(건수) = 계약 성공 ÷ 전체 딜 = ${t.won} ÷ ${t.total} = ${allRate} (영업 화면 KPI와 같은 정의)`,
      `- 계약 성공률(금액) = 성공 금액 ÷ 총 견적 = ${manwon(t.wonAmount)} ÷ ${manwon(quoted)} = ${pct(ratio(t.wonAmount, quoted))}`,
      `- 결정 딜 수주율 = 계약 성공 ÷ (계약 성공 + 계약 실패) = ${t.won} ÷ ${t.won + t.lost} = ${decidedRate}`,
      `- 진행중 파이프라인 가치(견적 합계): ${manwon(open.reduce((s, d) => s + d.amount, 0))}, 자동 실패 D-3 이내 ${open.filter((d) => d.daysLeft != null && d.daysLeft <= 3).length}건, 이미 지났는데 미처리 ${open.filter((d) => d.daysLeft != null && d.daysLeft <= 0).length}건`,
      monthLine('이번 달', thisMonth, deals),
      monthLine('지난달', shiftMonth(thisMonth, -1), deals),
      '- 최근 6개월 추이(문의 등록월 기준):',
      ...[5, 4, 3, 2, 1, 0].map((i) => trendLine(shiftMonth(thisMonth, -i), deals)),
      lead.length
        ? `- 수주 딜의 문의→확정작업일: 평균 ${Math.round(lead.reduce((a, b) => a + b, 0) / lead.length)}일, 중앙값 ${lead[Math.floor(lead.length / 2)]}일 (확정작업일이 있는 ${lead.length}건)`
        : '- 수주 딜의 문의→확정작업일: 확정작업일이 입력된 딜 없음',
      `- 최근 6개월 실패 딜(${lost6.length}건)의 마지막 단계: ${lostStages || '없음'}`,
    ], [
      table('진행중 단계별 파이프라인', '단계 순', ['단계', '건수', '견적 합계', '평균 경과일', 'D-3 이내'], stageRows, 10),
      table('담당자별 실적', '딜 많은 순', ['담당', '전체', '계약 성공', '계약 실패', '진행중', '계약 성공률(건수)', '결정 딜 수주율', '성공 금액', 'D-3 이내'], managerRows, 30),
      table('구간별 성과', '기준별 딜 많은 순', ['기준', '구간', '딜', '계약 성공', '계약 실패', '계약 성공률(건수)', '결정 딜 수주율', '성공 금액'], segRows, 60),
    ]),
    section('진행중 딜 — 자동 실패 카운트다운', [
      `- 문의 등록 후 ${AUTO_FAIL_DAYS}일을 넘기도록 진행중이면 계약 실패로 자동 처리된다. D-n = 자동 실패까지 남은 일수(D-1 = 내일 실패 처리).`,
      '- "자동 실패 미처리" = 기한이 지났지만 아직 진행중 (자동 처리는 영업 화면을 열 때만 돈다).',
    ], [
      table('진행중 딜', '남은 일수 적은 순', ['등록일', '경과', '자동 실패', '기업명', '단계', '서비스', '수량', '장비 구성', '견적', '담당', '고객', '지역', '요구사항', '관리 메모'], openRows, 80),
    ]),
    section('종료 딜', [`- 최근 등록순. 계약 실패에는 실제 실주와 자동 실패가 섞여 있다.`], [
      table('종료 딜 목록', '최근 등록순', ['등록일', '기업명', '결과', '마지막 단계', '서비스', '수량', '견적', '담당', '고객', '지역', '확정작업일', '관리 메모'], closedRows, 80),
    ]),
    section('데이터 주의사항', [
      `- 계약 실패 = 실제 실주 + 등록 ${AUTO_FAIL_DAYS}일 초과 자동 실패. 둘을 구분하는 필드가 없고, 실패 사유는 관리 메모에만 적힌다.`,
      '- 단계 변경 시각은 저장되지 않아 단계별 체류 시간·정확한 전환율은 알 수 없다. "마지막 단계"는 종료 시점에 남아 있던 단계다.',
      '- 리드 출처(유입 채널)·업종 정보는 없다. 지역은 주소의 시/도다. 견적 금액은 VAT 포함이다.',
      '- 고객 구분: 기존 = 이 딜 문의일 이전에 작업 이력이 있는 회사.',
      '- 영업 화면 KPI는 선택한 문의 등록 월(기본 이번 달) 기준이라 여기 전체 지표와 기간이 다를 수 있다.',
    ]),
  ];
}
