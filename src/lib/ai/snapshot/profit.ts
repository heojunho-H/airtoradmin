// 손익 전문가 스냅샷 — 두 가지 평균 순익률, 구간 분포, 서비스별 손익, 단가 민감도, AI 배치 제안 대비 실제, 단가표 추이.

import { ROLE_LABELS, ROLE_ORDER, type RoleCode } from '../../roles';
import { cell, eok, manwon, pct, ratio, section, shiftMonth, table, monthOf, type Section } from './common';
import type { Ctx, ProjectFact } from './derive';

const TARGET = 0.4;

function staffingText(p: ProjectFact): string {
  const parts = ROLE_ORDER.filter((r) => p.roles[r] > 0).map((r) => `${ROLE_LABELS[r]} ${p.roles[r]}`);
  if (p.extras) parts.push(`추가 ${p.extras}`);
  return parts.length ? parts.join('/') : '-';
}

function band(m: number | null): string {
  if (m == null) return '-';
  if (m < 0) return '적자';
  if (m < 0.1) return '0~10%';
  if (m < 0.3) return '10~30%';
  return '30% 이상';
}

function weighted(list: ProjectFact[], laborBump = 0): number | null {
  const rev = list.reduce((s, p) => s + p.revenue, 0);
  const profit = list.reduce((s, p) => s + p.profit - p.labor * laborBump, 0);
  return ratio(profit, rev);
}

function pp(a: number | null, b: number | null): string {
  if (a == null || b == null) return '-';
  const d = (b - a) * 100;
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)}%p`;
}

export function profitSections(ctx: Ctx, projects: ProjectFact[]): Section[] {
  const staffed = projects.filter((p) => p.hasStaffing && p.revenue > 0);
  const unstaffed = projects.filter((p) => !p.hasStaffing);
  const noRevenue = projects.filter((p) => p.hasStaffing && p.revenue <= 0);
  const inProgress = projects.filter((p) => p.status === '진행중');
  const completed = projects.filter((p) => p.status === '완료');
  const simpleAvg = (list: ProjectFact[]) => {
    const ms = list.map((p) => p.margin).filter((m): m is number => m != null);
    return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null;
  };
  const rev = staffed.reduce((s, p) => s + p.revenue, 0);
  const cost = staffed.reduce((s, p) => s + p.total, 0);
  const varTotal = staffed.reduce((s, p) => s + p.variable, 0);
  const bands = ['적자', '0~10%', '10~30%', '30% 이상'].map((b) => `${b} ${staffed.filter((p) => band(p.margin) === b).length}건`).join(', ');
  const laborBands = [
    ['30% 이하', (r: number) => r <= 0.3],
    ['30~50%', (r: number) => r > 0.3 && r <= 0.5],
    ['50% 초과', (r: number) => r > 0.5],
  ] as const;

  // 서비스별
  const services = new Map<string, ProjectFact[]>();
  for (const p of staffed) services.set(p.service, [...(services.get(p.service) ?? []), p]);
  const svcList = [...services.entries()].sort((a, b) => b[1].length - a[1].length);
  const serviceRows = svcList.map(([svc, list]) => {
    const r = list.reduce((s, p) => s + p.revenue, 0);
    const avgRoles = ROLE_ORDER.map((role) => `${ROLE_LABELS[role]} ${(list.reduce((s, p) => s + p.roles[role], 0) / list.length).toFixed(1)}`).join('/');
    return [
      cell(svc, 16),
      `${list.length}건`,
      manwon(r),
      pct(weighted(list), 1),
      pct(ratio(list.reduce((s, p) => s + p.labor, 0), r)),
      pct(ratio(list.reduce((s, p) => s + p.variable, 0), r), 1),
      avgRoles,
      `${(list.reduce((s, p) => s + p.days, 0) / list.length).toFixed(1)}일`,
    ];
  });
  const sensRows = [...svcList, ['전체', staffed] as [string, ProjectFact[]]].map(([svc, list]) => {
    const now = weighted(list);
    const p5 = weighted(list, 0.05);
    const p10 = weighted(list, 0.1);
    return [cell(svc, 16), pct(now, 1), pct(p5, 1), pct(p10, 1), pp(now, p10)];
  });

  const low = staffed
    .filter((p) => p.margin != null && p.margin < 0.1)
    .sort((a, b) => (a.margin ?? 0) - (b.margin ?? 0));
  const row = (p: ProjectFact) => [
    cell(p.name, 20),
    cell(p.company, 16),
    cell(p.service, 14),
    p.status,
    p.workDate || '-',
    p.quantity ? `${p.quantity}대` : '-',
    manwon(p.revenue),
    `${manwon(p.labor)}(${pct(p.laborRatio)})`,
    `${manwon(p.meal)}/${manwon(p.transport)}/${manwon(p.other)}`,
    p.hasStaffing ? `${manwon(p.profit)}(${pct(p.margin, 1)})` : '배치 없음',
    staffingText(p),
    p.days ? `${p.days}일` : '-',
    cell(p.aiStatus, 8),
  ];
  const COLS = ['프로젝트', '고객사', '서비스', '상태', '작업일', '수량', '순매출', '인건비(비율)', '식비/교통비/기타', '순이익(순익률)', '배치', '일수', 'AI 상태'];

  const aiRows = projects
    .filter((p) => p.aiDiff && p.hasStaffing)
    .map((p) => [
      cell(p.name, 20),
      cell(p.service, 14),
      pct(p.aiMargin, 1),
      pct(p.margin, 1),
      pp(p.aiMargin, p.margin),
      [...ROLE_ORDER, 'days']
        .map((k) => {
          const v = p.aiDiff?.[k] ?? 0;
          return v ? `${k === 'days' ? '일수' : ROLE_LABELS[k as RoleCode]} ${v > 0 ? '+' : ''}${v}` : '';
        })
        .filter(Boolean)
        .join('/') || '차이 없음',
    ]);

  // 단가표 추이 (최근 12개월)
  const latestYm = monthOf(ctx.today);
  const since = shiftMonth(latestYm, -11);
  const rateRows = ROLE_ORDER.map((role) => {
    const list = ctx.ds.laborRates
      .filter((r) => r.role === role && String(r.yearMonth || '') <= latestYm)
      .map((r) => ({ ym: String(r.yearMonth), rate: Number(r.dailyRate) || 0 }))
      .sort((a, b) => a.ym.localeCompare(b.ym));
    if (!list.length) return [ROLE_LABELS[role], '단가 없음', '-', '-', '-'];
    const cur = list[list.length - 1];
    const prev = list.length > 1 ? list[list.length - 2] : null;
    const old = [...list].reverse().find((r) => r.ym <= since) ?? list[0];
    const changes = list
      .filter((r) => r.ym >= since)
      .filter((r, i, arr) => i === 0 || r.rate !== arr[i - 1].rate)
      .map((r) => `${r.ym} ${r.rate.toLocaleString('ko-KR')}`)
      .join(', ');
    return [
      ROLE_LABELS[role],
      `${cur.rate.toLocaleString('ko-KR')}원(${cur.ym})`,
      prev ? `${(cur.rate - prev.rate >= 0 ? '+' : '')}${(cur.rate - prev.rate).toLocaleString('ko-KR')}원` : '-',
      old && old.ym !== cur.ym ? pct(ratio(cur.rate - old.rate, old.rate), 1) : '-',
      changes || '-',
    ];
  });

  return [
    section(`프로젝트 손익 (전체 ${projects.length}건: 진행중 ${inProgress.length}, 완료 ${completed.length}, 오늘 ${ctx.today})`, [
      `- 통계는 인력 배치와 견적이 모두 있는 ${staffed.length}건 기준이다. 배치가 비어 있는 ${unstaffed.length}건은 비용이 0이라 순익률이 부풀려져 제외했다${unstaffed.length ? ` (${unstaffed.slice(0, 8).map((p) => cell(p.company, 12)).join(', ')}${unstaffed.length > 8 ? ' 외' : ''})` : ''}.${noRevenue.length ? ` 배치는 있는데 견적(순매출)이 0인 ${noRevenue.length}건도 제외했다(${noRevenue.slice(0, 5).map((p) => cell(p.company, 12)).join(', ')}${noRevenue.length > 5 ? ' 외' : ''}).` : ''}`,
      `- 순매출 ${eok(rev)}, 총비용 ${eok(cost)}, 순이익 ${eok(rev - cost)}`,
      `- 가중 순익률 = 순이익 합 ÷ 순매출 합 = ${pct(weighted(staffed), 1)}`,
      `- 화면 기준 단순 평균 순익률(프로젝트마다 같은 비중): 전체 ${pct(simpleAvg(staffed), 1)}, 진행중 ${pct(simpleAvg(staffed.filter((p) => p.status === '진행중')), 1)}, 완료 ${pct(simpleAvg(staffed.filter((p) => p.status === '완료')), 1)}`,
      `- 순익률 구간(화면 색 기준): ${bands}. 목표 ${pct(TARGET)} 이상 ${staffed.filter((p) => (p.margin ?? -1) >= TARGET).length}건 (${pct(ratio(staffed.filter((p) => (p.margin ?? -1) >= TARGET).length, staffed.length))})`,
      `- 인건비율 구간: ${laborBands.map(([label, f]) => `${label} ${staffed.filter((p) => p.laborRatio != null && f(p.laborRatio)).length}건`).join(', ')}`,
      `- 변동비 합계 ${manwon(varTotal)} (순매출의 ${pct(ratio(varTotal, rev), 1)}): 식비 ${manwon(staffed.reduce((s, p) => s + p.meal, 0))}, 교통비 ${manwon(staffed.reduce((s, p) => s + p.transport, 0))}, 기타 ${manwon(staffed.reduce((s, p) => s + p.other, 0))}`,
    ], [
      table('서비스별 손익 (배치 입력 기준)', '건수 많은 순', ['서비스', '건수', '순매출', '가중 순익률', '인건비율', '변동비 비중', '평균 배치', '평균 일수'], serviceRows, 20),
      table('단가 민감도 (일당 인상 시 가중 순익률)', '서비스 순', ['서비스', '현재', '일당 +5%', '일당 +10%', '+10% 변화'], sensRows, 20),
    ]),
    section('프로젝트', [`- 순익률 = 순이익 ÷ 순매출, 인건비율 = 인건비 ÷ 순매출. 순매출 = VAT 포함 견적 − 부가세(견적 × 10/110).`], [
      table('적자·저마진 프로젝트 (순익률 10% 미만)', '순익률 낮은 순', COLS, low.map(row), 30),
      table('프로젝트 목록', '작업일 최근순', COLS, projects.slice().sort((a, b) => b.workDate.localeCompare(a.workDate)).map(row), 60),
    ]),
    section('AI 인력배치 제안 대비 실제', [
      '- AI 제안은 진행중 프로젝트의 배치 칸에 바로 들어가고, 이후 사람이 고칠 수 있다. 차이 = 현재 배치 − AI 제안. AI 예상 순익률은 변동비를 인건비의 약 12%로 가정한 값이다.',
    ], [table('AI 제안이 있는 프로젝트', '목록 순', ['프로젝트', '서비스', 'AI 예상 순익률', '실제 순익률', '차이', '역할별 차이(실제−AI)'], aiRows, 30)]),
    section('단가표 (역할별 일당, 최근 12개월)', [
      '- 일당은 작업월의 단가를 쓰고, 그 달이 없으면 12개월 이내 가장 가까운 이전 달 단가를 쓴다.',
    ], [table('단가 추이', '역할 순', ['역할', '현재 일당', '전월 대비', '12개월 전 대비', '변경 이력'], rateRows, 5)]),
    section('데이터 주의사항', [
      "- 'AI 채택' 표시는 더 이상 켜지지 않아 쓰지 않는다. AI 효과는 위의 제안 대비 실제로 판단한다.",
      '- 프로젝트는 수주 때 한 번 만들어지고 이후 딜의 견적 변경은 반영되지 않는다. 작업일이 비어 있는 프로젝트가 있다.',
      '- 인력 배치가 비어 있는 프로젝트는 비용이 0이라 통계에서 뺐다. 프로젝트별 수량은 작업 이력에서 가져왔다.',
    ]),
  ];
}
