// AI 어시스턴트 데이터 스냅샷 — 대화 시작(또는 '최신 데이터로 갱신') 시점의 운영 데이터를 텍스트로 만든다.
// 이전 AI 비서(드로어, 2026-10 삭제)의 buildDataContext 를 옮기면서 고친 점:
//   1) 날짜를 전부 KST 로 계산 (toISOString 의 UTC 하루 밀림 제거)
//   2) 성공여부에 '미견적' 추가, 수주율 = 계약 성공 ÷ (성공 + 실패)
//   3) 공급망: 존재하지 않던 필드 대신 recentActivities[].eval* 집계 + 공급망 화면의 최종 점수 공식
//   4) 고객 등급 S/A/B(미설정)
//   5) 종합 페르소나의 무조건 30행 자르기 제거 — 집계는 전체 기준, 행 목록만 예산에 맞춰 줄인다
//   6) 영업 정체 기준 7일 (등록 15일 초과 진행중 딜은 시스템이 자동 실패 처리하므로 30일 기준은 항상 0건이었다)
//   7) 손익: 작업일·연월 내림차순 정렬 후 자르기
// 목록은 "열:" 머리를 한 번만 쓰고 행을 " · " 로 구분한다 — 반복 라벨보다 토큰이 적다.
// 연락처(전화·이메일·주소)는 넣지 않는다 (대화는 팀 전체에 공유된다).

import { ROLE_LABELS, ROLE_ORDER, type RoleCode } from '../roles';
import { daysBetween, kstMonth, kstYmd } from './format';
import type { AiDatasets, PersonaId } from './types';

export const SNAPSHOT_MAX_CHARS = 100_000;

export interface DataSnapshot {
  persona: PersonaId;
  text: string;
  builtAt: number;
  counts: { deals: number; customers: number; managers: number; subcontractors: number; projects: number };
  /** 예산 때문에 행을 줄인 목록 설명 */
  truncated: string[];
}

const STATUS_LABELS: Record<string, string> = {
  new: '신규',
  call: '유선상담',
  'quote-sent': '견적서 발송',
  'quote-call': '유선견적상담',
  'price-negotiation': '가격조율',
  schedule: '일정조율',
  confirmed: '수주확정',
};
const SUCCESS_LABELS: Record<string, string> = {
  'in-progress': '진행중',
  success: '계약 성공',
  failed: '계약 실패',
  'no-quote': '미견적',
};
const MANAGER_STATUS: Record<string, string> = { active: '근무', vacation: '휴가', leave: '휴직' };
const SUB_STATUS: Record<string, string> = { available: '가용', busy: '작업중', unavailable: '불가' };

const STALL_DAYS = 7;

// ─── 값 정리 ────────────────────────────────────────────────────────────

function cell(v: unknown, max = 40): string {
  if (v === null || v === undefined || v === '') return '-';
  const s = String(v).replace(/\s+/g, ' ').replace(/·/g, ',').trim();
  if (!s) return '-';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** SalesPage 와 같은 규칙 — "₩12,500만" 은 만원 단위 */
function parseQuotationAmount(v: unknown): number {
  if (typeof v === 'number') return v;
  if (!v || typeof v !== 'string') return 0;
  const n = parseFloat(v.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return v.includes('만') ? n * 10_000 : n;
}

function manwon(won: number): string {
  if (!won) return '0원';
  return `${Math.round(won / 10_000).toLocaleString('ko-KR')}만원`;
}

function eok(won: number): string {
  return `${(won / 100_000_000).toFixed(2)}억원`;
}

function pct(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

function countBy<T>(items: T[], key: (t: T) => string, unit = '건'): string {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}${unit}`)
    .join(', ') || '없음';
}

function winRate(success: number, failed: number): string {
  const closed = success + failed;
  return closed > 0 ? pct(success / closed) : '-';
}

// ─── 섹션 모델 ──────────────────────────────────────────────────────────

interface Table {
  label: string;
  /** 정렬 기준 설명 (예: '최근 등록순') */
  order: string;
  columns: string[];
  rows: string[][];
  limit: number;
  minRows: number;
}

interface Section {
  title: string;
  lines: string[];
  tables: Table[];
}

function table(label: string, order: string, columns: string[], rows: string[][], minRows = 20): Table {
  return { label, order, columns, rows, limit: rows.length, minRows: Math.min(minRows, rows.length) };
}

function renderTable(t: Table): string {
  if (t.rows.length === 0) return `### ${t.label}\n(없음)`;
  const shown = t.rows.slice(0, t.limit);
  const scope = shown.length < t.rows.length ? `${t.order}, 전체 ${t.rows.length}건 중 ${shown.length}건` : `${t.order}, ${t.rows.length}건`;
  return [`### ${t.label} (${scope})`, `열: ${t.columns.join(' · ')}`, ...shown.map((r) => r.join(' · '))].join('\n');
}

function renderSections(header: string, sections: Section[]): string {
  return [
    header,
    ...sections.map((s) => [`## ${s.title}`, ...s.lines, ...s.tables.map(renderTable)].join('\n')),
  ].join('\n\n');
}

/** 예산을 넘으면 가장 긴 표부터 30%씩 줄인다 (minRows 아래로는 줄이지 않음). */
function fitToBudget(header: string, sections: Section[], maxChars: number): { text: string; truncated: string[] } {
  let text = renderSections(header, sections);
  for (let guard = 0; guard < 40 && text.length > maxChars; guard++) {
    const tables = sections.flatMap((s) => s.tables).filter((t) => t.limit > t.minRows);
    if (tables.length === 0) break;
    const biggest = tables.reduce((a, b) => (b.limit > a.limit ? b : a));
    biggest.limit = Math.max(biggest.minRows, Math.floor(biggest.limit * 0.7));
    text = renderSections(header, sections);
  }
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n…(분량 제한으로 이후 생략)`;
  const truncated = sections
    .flatMap((s) => s.tables)
    .filter((t) => t.limit < t.rows.length)
    .map((t) => `${t.label}: 전체 ${t.rows.length}건 중 ${t.limit}건`);
  return { text, truncated };
}

// ─── 공통 집계 ──────────────────────────────────────────────────────────

function dealRows(deals: any[]): string[][] {
  return [...deals]
    .sort((a, b) => String(b.registrationDate || '').localeCompare(String(a.registrationDate || '')))
    .map((d) => [
      cell(d.registrationDate, 10),
      cell(d.company),
      cell(STATUS_LABELS[d.status] ?? d.status),
      cell(SUCCESS_LABELS[d.successStatus] ?? d.successStatus),
      cell(d.desiredService, 20),
      `${num(d.totalQuantity)}대`,
      d.quotationAmount ? manwon(parseQuotationAmount(d.quotationAmount)) : '-',
      cell(d.salesManager, 10),
      cell(d.confirmedWorkDate, 10),
      cell(d.requirements, 80),
    ]);
}
const DEAL_COLUMNS = ['등록일', '기업명', '단계', '결과', '서비스', '수량', '견적', '담당', '확정작업일', '요구사항'];

function monthlyDealTrend(deals: any[], months: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
    const ym = kstMonth(d);
    const inMonth = deals.filter((x) => String(x.registrationDate || '').startsWith(ym));
    const success = inMonth.filter((x) => x.successStatus === 'success');
    const failed = inMonth.filter((x) => x.successStatus === 'failed').length;
    const amount = success.reduce((s, x) => s + parseQuotationAmount(x.quotationAmount), 0);
    out.push(`- ${ym}: 신규 ${inMonth.length}건, 계약 성공 ${success.length}건(${manwon(amount)}), 계약 실패 ${failed}건, 수주율 ${winRate(success.length, failed)}`);
  }
  return out;
}

function customerRows(customers: any[]): string[][] {
  return [...customers]
    .sort((a, b) => num(b.totalAmount) - num(a.totalAmount))
    .map((c) => [
      cell(c.company),
      cell(c.grade || '미설정', 4),
      cell(c.customerStatus, 6),
      `${num(c.deals)}건`,
      `${num(c.totalQuantity)}대`,
      manwon(num(c.totalAmount)),
      cell(c.accountManager, 10),
      cell(c.lastWorkDate, 10),
      cell(c.nextManagementDate, 10),
      c.managementCycle ? `${num(c.managementCycle)}일` : '-',
    ]);
}
const CUSTOMER_COLUMNS = ['기업명', '등급', '상태', '거래', '총수량', '총금액', '담당', '최근작업일', '다음관리일', '관리주기'];

function managerRows(managers: any[]): string[][] {
  return [...managers]
    .sort((a, b) => num(b.totalSalesAmount) - num(a.totalSalesAmount))
    .map((m) => [
      cell(m.name, 10),
      cell(m.position, 10),
      cell(m.assignedArea, 12),
      cell(MANAGER_STATUS[m.status] ?? m.status, 4),
      `${num(m.assignedCustomers)}명`,
      `${num(m.activeProjects)}건`,
      `${num(m.completedProjects)}건`,
      manwon(num(m.totalSalesAmount)),
      `${num(m.performanceRating)}점`,
      `${num(m.repurchaseRate)}%`,
      `${num(m.newCustomers)}명`,
      `${num(m.repurchaseCustomers)}명`,
    ]);
}
const MANAGER_COLUMNS = ['이름', '직책', '담당지역', '상태', '담당고객', '진행', '완료', '매출', '성과평가', '재구매율', '신규고객', '재구매고객'];

const EVAL_FIELDS = [
  ['evalCustomerClaim', '클레임'],
  ['evalAllDevices', '기기점검'],
  ['evalOnTime', '시간준수'],
  ['evalAfterService', '사후관리'],
  ['evalUniform', '복장'],
  ['evalKindness', '친절'],
] as const;

/** 공급망 화면(SupplyChainPage calculateFinalScore)과 같은 공식 */
function finalScore(s: any): number {
  const base = num(s.baseScore) || 50;
  const workSum = (s.recentActivities || []).reduce((sum: number, a: any) => sum + num(a.workEvaluationScore), 0);
  return base + workSum + num(s.repurchaseCount) * 3 + num(s.cooperationScore);
}

function finalGrade(score: number): string {
  if (score >= 80) return '1등급';
  if (score >= 60) return '2등급';
  if (score >= 40) return '3등급';
  if (score >= 20) return '4등급';
  return '퇴출 심사';
}

function subcontractorRows(subs: any[]): string[][] {
  return [...subs]
    .map((s) => ({ s, score: finalScore(s) }))
    .sort((a, b) => b.score - a.score)
    .map(({ s, score }) => {
      const acts: any[] = s.recentActivities || [];
      const evaluated = acts.filter((a) => EVAL_FIELDS.some(([k]) => a[k] !== undefined && a[k] !== null));
      const sums = EVAL_FIELDS.map(([k, label]) => {
        const total = evaluated.reduce((sum, a) => sum + num(a[k]), 0);
        return `${label}${total > 0 ? '+' : ''}${total}`;
      }).join('/');
      return [
        cell(s.name, 10),
        cell(s.company, 16),
        cell(s.grade, 2),
        cell(SUB_STATUS[s.status] ?? s.status, 4),
        `${num(s.teamSize)}명`,
        `${num(s.ongoingProjects)}건`,
        `${num(s.completedProjects)}건`,
        `${num(s.cooperationScore)}점`,
        `${num(s.repurchaseCount)}건`,
        `${score}점(${finalGrade(score)})`,
        `${evaluated.length}건`,
        evaluated.length ? sums : '-',
      ];
    });
}
const SUB_COLUMNS = ['이름', '업체', '등급', '상태', '팀규모', '진행', '완료', '협력점수', '재구매', '최종점수', '평가건수', '항목별 평가합계'];

// ─── 페르소나별 섹션 ────────────────────────────────────────────────────

function salesSections(ds: AiDatasets, today: string): Section[] {
  const deals = ds.deals;
  const success = deals.filter((d) => d.successStatus === 'success').length;
  const failed = deals.filter((d) => d.successStatus === 'failed').length;
  const stalled = deals.filter((d) => {
    if (d.successStatus !== 'in-progress') return false;
    const age = daysBetween(String(d.registrationDate || ''), today);
    return Number.isFinite(age) && age > STALL_DAYS;
  });

  const byManager = new Map<string, { total: number; success: number; failed: number; progress: number; amount: number }>();
  for (const d of deals) {
    const k = d.salesManager || '미지정';
    const s = byManager.get(k) ?? { total: 0, success: 0, failed: 0, progress: 0, amount: 0 };
    s.total++;
    if (d.successStatus === 'success') {
      s.success++;
      s.amount += parseQuotationAmount(d.quotationAmount);
    } else if (d.successStatus === 'failed') s.failed++;
    else if (d.successStatus === 'in-progress') s.progress++;
    byManager.set(k, s);
  }

  return [
    {
      title: `영업 파이프라인 (전체 딜 ${deals.length}건)`,
      lines: [
        `- 단계별: ${countBy(deals, (d) => STATUS_LABELS[d.status] ?? d.status ?? '-')}`,
        `- 결과별: ${countBy(deals, (d) => SUCCESS_LABELS[d.successStatus] ?? d.successStatus ?? '-')}`,
        `- 전체 수주율: ${winRate(success, failed)} (계약 성공 ${success}건 ÷ 성공+실패 ${success + failed}건)`,
        `- 서비스별: ${countBy(deals, (d) => d.desiredService || '미지정')}`,
        `- 규칙: 등록 후 15일이 지나도록 진행중이면 시스템이 자동으로 계약 실패 처리한다. 정체 딜 = 등록 ${STALL_DAYS}일 초과 진행중.`,
        '- 최근 6개월 추이(등록월 기준):',
        ...monthlyDealTrend(deals, 6),
      ],
      tables: [
        table(
          '담당자별 실적',
          '딜 많은 순',
          ['담당', '전체', '계약 성공', '계약 실패', '진행중', '수주율', '성공 금액'],
          [...byManager.entries()]
            .sort((a, b) => b[1].total - a[1].total)
            .map(([k, s]) => [cell(k, 10), `${s.total}건`, `${s.success}건`, `${s.failed}건`, `${s.progress}건`, winRate(s.success, s.failed), manwon(s.amount)]),
          50,
        ),
        table(
          `정체 딜 (등록 ${STALL_DAYS}일 초과 진행중)`,
          '오래된 순',
          ['등록일', '경과일', '기업명', '단계', '서비스', '견적', '담당'],
          stalled
            .map((d) => ({ d, age: daysBetween(String(d.registrationDate), today) }))
            .sort((a, b) => b.age - a.age)
            .map(({ d, age }) => [
              cell(d.registrationDate, 10),
              `${age}일`,
              cell(d.company),
              cell(STATUS_LABELS[d.status] ?? d.status),
              cell(d.desiredService, 20),
              d.quotationAmount ? manwon(parseQuotationAmount(d.quotationAmount)) : '-',
              cell(d.salesManager, 10),
            ]),
          50,
        ),
        table('딜 목록', '최근 등록순', DEAL_COLUMNS, dealRows(deals), 60),
      ],
    },
  ];
}

function crmSections(ds: AiDatasets, today: string): Section[] {
  const customers = ds.customers;
  const total = customers.reduce((s, c) => s + num(c.totalAmount), 0);
  const recency = { d90: 0, d180: 0, d365: 0, older: 0, none: 0 };
  for (const c of customers) {
    if (!c.lastWorkDate) {
      recency.none++;
      continue;
    }
    const age = daysBetween(String(c.lastWorkDate), today);
    if (age <= 90) recency.d90++;
    else if (age <= 180) recency.d180++;
    else if (age <= 365) recency.d365++;
    else recency.older++;
  }
  const overdue = customers.filter((c) => c.nextManagementDate && String(c.nextManagementDate) < today);
  const soon = customers.filter((c) => {
    if (!c.nextManagementDate || String(c.nextManagementDate) < today) return false;
    return daysBetween(today, String(c.nextManagementDate)) <= 7;
  });
  const dueRow = (c: any) => [
    cell(c.company),
    cell(c.grade || '미설정', 4),
    cell(c.nextManagementDate, 10),
    cell(c.lastWorkDate, 10),
    manwon(num(c.totalAmount)),
    cell(c.accountManager, 10),
  ];

  return [
    {
      title: `고객 포트폴리오 (전체 ${customers.length}곳)`,
      lines: [
        `- 등급별: ${countBy(customers, (c) => (c.grade ? `${c.grade}등급` : '미설정'), '곳')}`,
        `- 상태별: ${countBy(customers, (c) => c.customerStatus || '미설정', '곳')}`,
        `- 누적 거래금액: ${eok(total)}`,
        `- 최근 작업 경과(RFM 최근성): 90일 이내 ${recency.d90}곳, 91~180일 ${recency.d180}곳, 181~365일 ${recency.d365}곳, 1년 초과 ${recency.older}곳, 작업 이력 없음 ${recency.none}곳`,
      ],
      tables: [
        table('관리 기한 초과 고객', '기한 오래된 순', ['기업명', '등급', '다음관리일', '최근작업일', '총금액', '담당'],
          [...overdue].sort((a, b) => String(a.nextManagementDate).localeCompare(String(b.nextManagementDate))).map(dueRow), 50),
        table('7일 이내 관리 예정 고객', '기한 가까운 순', ['기업명', '등급', '다음관리일', '최근작업일', '총금액', '담당'],
          [...soon].sort((a, b) => String(a.nextManagementDate).localeCompare(String(b.nextManagementDate))).map(dueRow), 50),
        table('고객 목록', '총금액 큰 순', CUSTOMER_COLUMNS, customerRows(customers), 60),
      ],
    },
  ];
}

function supplySections(ds: AiDatasets): Section[] {
  return [
    {
      title: `고객책임자 (전체 ${ds.managers.length}명)`,
      lines: [`- 상태별: ${countBy(ds.managers, (m) => MANAGER_STATUS[m.status] ?? m.status ?? '-', '명')}`],
      tables: [table('고객책임자 목록', '매출 큰 순', MANAGER_COLUMNS, managerRows(ds.managers), 50)],
    },
    {
      title: `작업팀장/협력사 (전체 ${ds.subcontractors.length}명)`,
      lines: [
        `- 등급별: ${countBy(ds.subcontractors, (s) => (s.grade ? `${s.grade}등급` : '미설정'), '명')}`,
        `- 상태별: ${countBy(ds.subcontractors, (s) => SUB_STATUS[s.status] ?? s.status ?? '-', '명')}`,
        '- 최종 점수 = 기본점수(없으면 50) + 작업평가 점수 합 + 재구매 건수×3 + 협력점수. 80 이상 1등급, 60 이상 2등급, 40 이상 3등급, 20 이상 4등급, 미만은 퇴출 심사.',
        '- 작업평가 항목(클레임·기기점검·시간준수·사후관리·복장·친절)은 작업 1건마다 -2~+1점으로 매기며, 표에는 항목별 합계를 적었다.',
      ],
      tables: [table('작업팀장 목록', '최종 점수 높은 순', SUB_COLUMNS, subcontractorRows(ds.subcontractors), 50)],
    },
  ];
}

function profitSections(ds: AiDatasets): Section[] {
  const projects = ds.projects;
  const inProgress = projects.filter((p) => p.status === 'in-progress');
  const completed = projects.filter((p) => p.status === 'completed');
  const revenue = projects.reduce((s, p) => s + num(p.netRevenue), 0);
  const cost = projects.reduce((s, p) => s + num(p.totalCost), 0);
  const avgRatio = projects.length ? projects.reduce((s, p) => s + num(p.profitRatio), 0) / projects.length : 0;

  const byService = new Map<string, { count: number; revenue: number; profit: number; roles: Record<string, number>; days: number; withAssign: number }>();
  for (const p of projects) {
    const k = p.serviceType || '기타';
    const s = byService.get(k) ?? { count: 0, revenue: 0, profit: 0, roles: {}, days: 0, withAssign: 0 };
    s.count++;
    s.revenue += num(p.netRevenue);
    s.profit += num(p.netProfit);
    const wa = p.workerAssignments;
    if (wa && typeof wa === 'object') {
      let any = false;
      for (const r of ROLE_ORDER) {
        const v = num(wa[r]);
        if (v > 0) any = true;
        s.roles[r] = (s.roles[r] ?? 0) + v;
      }
      if (num(wa.days) > 0) any = true;
      s.days += num(wa.days);
      if (any) s.withAssign++;
    }
    byService.set(k, s);
  }

  const projectRow = (p: any) => [
    cell(p.projectName, 30),
    cell(p.serviceType, 16),
    cell(p.workDate, 10),
    manwon(num(p.netRevenue)),
    `${manwon(num(p.laborCost))}(${pct(num(p.laborCostRatio))})`,
    `${manwon(num(p.netProfit))}(${pct(num(p.profitRatio))})`,
    p.aiApplied ? 'AI채택' : '-',
  ];
  const latestMonths = [...new Set(ds.laborRates.map((r) => String(r.yearMonth || '')))].sort().reverse().slice(0, 3);

  return [
    {
      title: `프로젝트 손익 (전체 ${projects.length}건 · 진행중 ${inProgress.length} · 완료 ${completed.length})`,
      lines: [
        `- 누적 순매출 ${eok(revenue)}, 누적 비용 ${eok(cost)}, 누적 순이익 ${eok(revenue - cost)}, 평균 순익률 ${pct(avgRatio, 1)}`,
        '- 순익률·인건비율은 순매출 대비 비율이다.',
      ],
      tables: [
        table(
          '서비스별 손익 + 평균 인력 배치',
          '건수 많은 순',
          ['서비스', '건수', '순매출', '순이익(순익률)', '평균 배치'],
          [...byService.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .map(([k, s]) => [
              cell(k, 16),
              `${s.count}건`,
              manwon(s.revenue),
              `${manwon(s.profit)}(${s.revenue > 0 ? pct(s.profit / s.revenue, 1) : '-'})`,
              s.withAssign > 0
                ? `${ROLE_ORDER.map((r) => `${ROLE_LABELS[r as RoleCode]} ${((s.roles[r] ?? 0) / s.withAssign).toFixed(1)}`).join(', ')}, 작업일 ${(s.days / s.withAssign).toFixed(1)}일`
                : '인력 미입력',
            ]),
          30,
        ),
        table('진행중 프로젝트', '작업일 최근순', ['프로젝트', '서비스', '작업일', '순매출', '인건비(비율)', '순이익(순익률)', 'AI'],
          [...inProgress].sort((a, b) => String(b.workDate || '').localeCompare(String(a.workDate || ''))).map(projectRow), 40),
        table('완료 프로젝트', '완료 최근순', ['프로젝트', '서비스', '작업일', '순매출', '인건비(비율)', '순이익(순익률)', 'AI'],
          [...completed].sort((a, b) => String(b.completedAt || b.workDate || '').localeCompare(String(a.completedAt || a.workDate || ''))).map(projectRow), 40),
        table('단가표 (최근 3개월)', '연월 최근순', ['연월', '역할', '일당'],
          ds.laborRates
            .filter((r) => latestMonths.includes(String(r.yearMonth || '')))
            .sort((a, b) => String(b.yearMonth).localeCompare(String(a.yearMonth)) || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
            .map((r) => [cell(r.yearMonth, 7), cell(ROLE_LABELS[r.role as RoleCode] ?? r.role, 10), `${num(r.dailyRate).toLocaleString('ko-KR')}원`]),
          15),
      ],
    },
  ];
}

function overviewSections(ds: AiDatasets, today: string): Section[] {
  const deals = ds.deals;
  const thisMonth = kstMonth();
  const monthDeals = deals.filter((d) => String(d.registrationDate || '').startsWith(thisMonth));
  const success = deals.filter((d) => d.successStatus === 'success').length;
  const failed = deals.filter((d) => d.successStatus === 'failed').length;
  const overdue = ds.customers.filter((c) => c.nextManagementDate && String(c.nextManagementDate) < today).length;
  const totalAmount = ds.customers.reduce((s, c) => s + num(c.totalAmount), 0);
  const projects = ds.projects;
  const avgRatio = projects.length ? projects.reduce((s, p) => s + num(p.profitRatio), 0) / projects.length : 0;

  return [
    {
      title: `영업 요약 (전체 딜 ${deals.length}건)`,
      lines: [
        `- 이번 달(${thisMonth}) 신규 ${monthDeals.length}건, 결과별: ${countBy(monthDeals, (d) => SUCCESS_LABELS[d.successStatus] ?? d.successStatus ?? '-')}`,
        `- 전체 단계별: ${countBy(deals, (d) => STATUS_LABELS[d.status] ?? d.status ?? '-')}`,
        `- 전체 수주율: ${winRate(success, failed)} (계약 성공 ÷ 성공+실패). 등록 15일 초과 진행중 딜은 자동 실패 처리된다.`,
        '- 최근 3개월 추이:',
        ...monthlyDealTrend(deals, 3),
      ],
      tables: [table('최근 딜', '최근 등록순', DEAL_COLUMNS, dealRows(deals), 30)],
    },
    {
      title: `고객 요약 (전체 ${ds.customers.length}곳)`,
      lines: [
        `- 등급별: ${countBy(ds.customers, (c) => (c.grade ? `${c.grade}등급` : '미설정'), '곳')}`,
        `- 누적 거래금액 ${eok(totalAmount)}, 관리 기한 초과 ${overdue}곳`,
      ],
      tables: [table('고객 목록', '총금액 큰 순', CUSTOMER_COLUMNS, customerRows(ds.customers), 30)],
    },
    {
      title: `공급망 요약 (고객책임자 ${ds.managers.length}명 · 작업팀장 ${ds.subcontractors.length}명)`,
      lines: ['- 작업팀장 최종 점수 = 기본점수(없으면 50) + 작업평가 합 + 재구매×3 + 협력점수 (80↑ 1등급 … 20 미만 퇴출 심사)'],
      tables: [
        table('고객책임자', '매출 큰 순', MANAGER_COLUMNS, managerRows(ds.managers), 20),
        table('작업팀장', '최종 점수 높은 순', SUB_COLUMNS, subcontractorRows(ds.subcontractors), 20),
      ],
    },
    {
      title: `프로젝트 요약 (전체 ${projects.length}건)`,
      lines: [
        `- 진행중 ${projects.filter((p) => p.status === 'in-progress').length}건, 완료 ${projects.filter((p) => p.status === 'completed').length}건, 평균 순익률 ${pct(avgRatio, 1)}`,
      ],
      tables: [],
    },
  ];
}

export function buildSnapshot(persona: PersonaId, ds: AiDatasets, opts: { maxChars?: number } = {}): DataSnapshot {
  const today = kstYmd();
  const header = `오늘 날짜(KST): ${today}`;
  const sections =
    persona === 'sales'
      ? salesSections(ds, today)
      : persona === 'crm'
        ? crmSections(ds, today)
        : persona === 'supply'
          ? supplySections(ds)
          : persona === 'profit'
            ? profitSections(ds)
            : overviewSections(ds, today);
  const { text, truncated } = fitToBudget(header, sections, opts.maxChars ?? SNAPSHOT_MAX_CHARS);
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

/** 스냅샷 막대에 보일 핵심 건수 */
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
