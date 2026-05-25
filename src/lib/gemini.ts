// Gemini AI 서비스 — API 호출 및 데이터 컨텍스트 빌더
//
// 참고: AI 인력배치(suggestProjectStaffing)는 Phase 1.8부터 Claude Sonnet 4.6로
// 이관되었다. 해당 함수는 src/lib/claude-staffing.ts 참조.

import { ROLE_ORDER, ROLE_LABELS, type RoleCode } from './roles';

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export type ExpertType = 'assistant' | 'sales' | 'crm' | 'supply' | 'profit';

export const EXPERT_CONFIGS: Record<ExpertType, { label: string; buttonLabel: string; description: string }> = {
  assistant: { label: 'AI 비서',       buttonLabel: 'AI 비서', description: '전체 데이터 종합 분석' },
  sales:     { label: 'B2B 영업전문가', buttonLabel: 'B2B 영업', description: '영업 파이프라인 전문 컨설팅' },
  crm:       { label: 'CRM 전문가',    buttonLabel: 'CRM',      description: '고객관계 관리 전문 컨설팅' },
  supply:    { label: '공급망전문가',   buttonLabel: '공급망',   description: '협력사·매니저 관리 전문 컨설팅' },
  profit:    { label: '손익전문가',     buttonLabel: '손익',     description: '프로젝트 손익 분석 전문 컨설팅' },
};

export const EXPERT_TYPES: ExpertType[] = ['assistant', 'sales', 'crm', 'supply', 'profit'];

export const EXPERT_SUGGESTED_PROMPTS: Record<ExpertType, string[]> = {
  assistant: [
    '이번 달 영업 현황을 요약해줘',
    '고객 등급별 매출 분석해줘',
    '성과가 좋은 작업팀장은 누구야?',
    '관리 주기가 임박한 고객은?',
  ],
  sales: [
    '고착된 딜을 분석하고 돌파 전략을 알려줘',
    '담당자별 수주율을 비교해줘',
    '30일 이상 정체된 딜 목록과 대응 방안은?',
    '현재 파이프라인의 단계별 전환율을 분석해줘',
  ],
  crm: [
    '이탈 위험이 높은 고객을 식별해줘',
    '등급별 고객 포트폴리오를 진단해줘',
    '업셀링 기회가 있는 고객을 찾아줘',
    '재구매율을 높이기 위한 전략은?',
  ],
  supply: [
    '고객책임자별 성과를 평가해줘',
    '작업팀장 등급과 역량을 분석해줘',
    '협력사 리스크를 진단해줘',
    '수요 대비 공급 역량 매칭 현황은?',
  ],
  profit: [
    '이번 달 순이익률이 낮은 프로젝트는?',
    '서비스별 평균 순익률을 비교해줘',
    '인건비율이 50%를 넘는 프로젝트와 원인은?',
    '다음 달 단가 인상 시 마진 영향 분석',
  ],
};

// 전문가별 시스템 프롬프트
const SYSTEM_INSTRUCTIONS: Record<ExpertType, string> = {
  assistant: `당신은 에어터(Airtor) 관리자 대시보드의 AI 비서입니다.
사용자는 영업, 고객관리, 공급망관리를 담당하는 관리자입니다.
아래 제공된 실제 데이터를 기반으로 질문에 답변하고, 인사이트를 제공하세요.

규칙:
- 한국어로 답변하세요
- 데이터에 기반한 구체적인 수치를 포함하세요
- 답변은 간결하고 핵심만 전달하세요
- 표나 목록 형식을 적극 활용하세요
- 데이터에 없는 내용은 추측하지 마세요`,

  sales: `당신은 에어터(Airtor)의 B2B 영업 전문 컨설턴트입니다.
에어터는 해충방제, 표면소독, 에어컨세척, 실내공기질 개선 서비스를 B2B로 제공합니다.
SPIN Selling, Challenger Sale, MEDDIC/MEDDICC, Value-Based Selling 방법론을 바탕으로 전문적인 영업 컨설팅을 제공하세요.

전문 영역:
- 딜 파이프라인 진단 및 단계별 전환율 개선
- 30일 이상 고착된 딜의 원인 분석 및 돌파 전략
- 담당자별 KPI 분석 및 코칭 포인트 도출
- 성공/실패 패턴 분석을 통한 베스트 프랙티스 정리
- 에어터 서비스 가치 제안 및 차별화 전략

규칙:
- 한국어로 답변하세요
- 영업 방법론 용어를 적절히 활용하되 실무적으로 설명하세요
- 데이터에 기반한 구체적인 수치와 실행 가능한 액션 아이템을 제시하세요
- 표나 목록 형식을 적극 활용하세요
- 데이터에 없는 내용은 추측하지 마세요`,

  crm: `당신은 에어터(Airtor)의 CRM(고객관계관리) 전문 컨설턴트입니다.
에어터는 A/B/C/D 등급 체계로 고객을 분류하며, 정기적인 관리 주기를 통해 고객 관계를 유지합니다.
CLV/LTV 분석, RFM 분석, 이탈 예측, Customer Success 방법론을 바탕으로 전문적인 CRM 컨설팅을 제공하세요.

전문 영역:
- 고객 포트폴리오 진단 및 등급별 전략 수립
- 이탈 조기 감지 및 선제적 대응 방안
- 재구매율 향상 및 관리 주기 최적화
- 업셀링/크로스셀링 기회 발굴
- 고객 생애가치(CLV) 극대화 전략
- RFM(최근성·빈도·금액) 기반 고객 세분화

규칙:
- 한국어로 답변하세요
- CRM 방법론 용어를 적절히 활용하되 실무적으로 설명하세요
- 데이터에 기반한 구체적인 수치와 실행 가능한 액션 아이템을 제시하세요
- 표나 목록 형식을 적극 활용하세요
- 데이터에 없는 내용은 추측하지 마세요`,

  supply: `당신은 에어터(Airtor)의 공급망 및 협력사 관계 관리(SRM) 전문 컨설턴트입니다.
에어터의 작업평가 항목은 고객클레임·기기점검·시간준수·사후관리·복장·친절도로 구성됩니다.
SCM(공급망관리)과 SRM(Supplier Relationship Management) 방법론을 바탕으로 전문적인 컨설팅을 제공하세요.

전문 영역:
- 고객책임자(매니저) 성과 진단 및 코칭 포인트 도출
- 작업팀장 평가·등급 관리 및 역량 개발
- 역량-수요 매칭 최적화 (적절한 인력 배치)
- 협력사 리스크 분산 및 포트폴리오 관리
- 공급 역량 대비 수요 예측 및 갭 분석
- 작업 품질 향상을 위한 KPI 체계 구축

규칙:
- 한국어로 답변하세요
- SCM/SRM 방법론 용어를 적절히 활용하되 실무적으로 설명하세요
- 데이터에 기반한 구체적인 수치와 실행 가능한 액션 아이템을 제시하세요
- 표나 목록 형식을 적극 활용하세요
- 데이터에 없는 내용은 추측하지 마세요`,

  profit: `당신은 에어터(Airtor)의 프로젝트 손익 및 마진 관리 전문 컨설턴트입니다.
에어터의 프로젝트 손익 구조: 견적금액 → 부가세 역산 → 순매출 → 인건비(역할별 일당 × 인원 × 일수) + 변동비(식비/교통비/기타) 차감 → 순이익 산출.
Contribution Margin Analysis, ABC(Activity-Based Costing), Margin Optimization 방법론을 바탕으로 전문적인 컨설팅을 제공하세요.

전문 영역:
- 프로젝트별 순익률 진단 및 적자/저마진 원인 분석
- 인건비율(labor_cost_ratio) 분석 및 역할 구성(팀장/팀원/보조) 최적화
- 단가표(airtor_labor_rates) 인상/인하 시뮬레이션 및 마진 영향 분석
- 서비스 카테고리별 손익 패턴 비교 및 가격 정책 제안
- AI 인력배치 제안의 채택률·효과성 추적 (aiApplied 플래그 기반)

규칙:
- 한국어로 답변하세요
- 손익 관리 용어(공헌이익, 손익분기점, 마진율 등)를 적절히 활용하되 실무적으로 설명하세요
- 데이터에 기반한 구체적인 수치(원/만원/억원, 퍼센트)와 실행 가능한 액션 아이템을 제시하세요
- 표나 목록 형식을 적극 활용하세요
- ratio 값은 fraction(0~1)으로 저장되어 있으니 답변 시 *100으로 퍼센트 변환해 표시하세요
- 데이터에 없는 내용은 추측하지 마세요`,
};

export async function sendChatMessage(
  messages: ChatMessage[],
  dataContext: string,
  expertType: ExpertType = 'assistant'
): Promise<string> {
  const systemInstruction = SYSTEM_INSTRUCTIONS[expertType];

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: `${systemInstruction}\n\n${dataContext}` }],
      },
      contents: messages,
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', errorText);
    throw new Error(`AI 응답 오류 (${response.status})`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '응답을 생성할 수 없습니다.';
}

// ============================================================
// 기업 정보 조회 — Gemini 2.5 Flash + Google Search 그라운딩
// 별도 함수로 분리한 이유:
//   - AI 비서 패널은 내부 DB 데이터 분석용이라 grounding 불필요 (pro 모델 유지)
//   - 기업 정보 조회는 웹 검색 필수 + 응답에 출처 URL 함께 반환해야 함
// ============================================================
export interface CompanySource {
  uri: string;
  title?: string;
}

export interface CompanyInfoResult {
  text: string;
  sources: CompanySource[];
}

const COMPANY_INFO_SYSTEM = `당신은 기업 정보 조사 전문가입니다. 사용자가 기업명을 제공하면 Google 웹 검색으로 최신 정보를 조사한 뒤 정리해주세요.

다음 항목을 포함하세요 (검색 결과에서 확인 가능한 범위 내에서):
- 기업 개요 (업종, 설립연도, 규모 등)
- 주요 사업 분야 및 제품/서비스
- 본사 위치 및 주요 사업장
- 최근 동향 또는 특이사항
- 업계 내 위치 및 경쟁사

한국어로 간결하게 답변하세요. 검색 결과에서 확인되지 않은 정보는 추측하지 말고, 알 수 없는 항목은 생략하세요.
중소기업이나 정보가 부족한 경우 솔직하게 알려주세요. 검색에서 같은 이름의 다른 기업이 섞여 나오면 한국 B2B 맥락에 맞는 회사를 우선 채택하세요.`;

export async function sendCompanyInfoQuery(companyName: string): Promise<CompanyInfoResult> {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      _model: 'gemini-2.5-flash',
      systemInstruction: {
        parts: [{ text: COMPANY_INFO_SYSTEM }],
      },
      contents: [{
        role: 'user',
        parts: [{ text: `"${companyName}" 기업에 대한 정보를 조사해주세요.` }],
      }],
      // Google Search 그라운딩 — 실시간 웹 검색 + 응답에 groundingMetadata 포함
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini company info error:', errorText);
    throw new Error(`AI 응답 오류 (${response.status})`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '응답을 생성할 수 없습니다.';

  // 인용 URL 추출 (중복 제거)
  const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources: CompanySource[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const uri: string | undefined = chunk?.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({ uri, title: chunk?.web?.title });
  }

  return { text, sources };
}

// 공통 상수
const statusMap: Record<string, string> = {
  'new': '신규', 'call': '유선상담', 'quote-sent': '견적서 발송',
  'quote-call': '유선견적상담', 'price-negotiation': '가격조율',
  'schedule': '일정조율', 'confirmed': '수주확정',
};
const successMap: Record<string, string> = {
  'in-progress': '진행중', 'success': '성공', 'failed': '실패',
};

function buildFullContext(deals: any[], customers: any[], managers: any[], subcontractors: any[]): string {
  const today = new Date().toISOString().split('T')[0];

  const dealsByStatus = deals.reduce((acc, d) => {
    const label = statusMap[d.status] || d.status;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const dealsBySuccess = deals.reduce((acc, d) => {
    const label = successMap[d.successStatus] || d.successStatus;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const customersByGrade = customers.reduce((acc, c) => {
    acc[c.grade] = (acc[c.grade] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalCustomerAmount = customers.reduce((acc, c) => acc + (c.totalAmount || 0), 0);
  const dueCustomers = customers.filter((c: any) => c.nextManagementDate && c.nextManagementDate <= today);

  return `
## 오늘 날짜: ${today}

## 영업 데이터 (총 ${deals.length}건)
- 진행상태별: ${Object.entries(dealsByStatus).map(([k, v]) => `${k} ${v}건`).join(', ')}
- 성공여부별: ${Object.entries(dealsBySuccess).map(([k, v]) => `${k} ${v}건`).join(', ')}
- 딜 목록:
${deals.slice(0, 30).map(d => `  · ${d.company} | 상태:${statusMap[d.status] || d.status} | 성공여부:${successMap[d.successStatus] || d.successStatus} | 희망서비스:${d.desiredService || '-'} | 총수량:${d.totalQuantity || 0}대 | 견적:${d.quotationAmount || '-'} | 확정작업일:${d.confirmedWorkDate || '-'} | 담당:${d.salesManager || '-'} | 등록일:${d.registrationDate} | 세부전달사항:${d.requirements || '-'}`).join('\n')}

## 고객 데이터 (총 ${customers.length}명)
- 등급별: ${Object.entries(customersByGrade).map(([k, v]) => `${k}등급 ${v}명`).join(', ')}
- 총 거래금액: ${(totalCustomerAmount / 100000000).toFixed(1)}억원
- 관리주기 도래 고객: ${dueCustomers.length}명${dueCustomers.length > 0 ? ' (' + dueCustomers.map((c: any) => c.company).join(', ') + ')' : ''}
- 고객 목록:
${customers.slice(0, 30).map((c: any) => `  · ${c.company} | ${c.grade || '미설정'}등급 | ${c.customerStatus || ''} | 거래${c.deals}건 | 총수량:${c.totalQuantity || 0}대 | 금액${(c.totalAmount / 10000).toFixed(0)}만원 | 담당:${c.accountManager} | 다음관리일:${c.nextManagementDate}`).join('\n')}

## 고객책임자 (총 ${managers.length}명)
${managers.slice(0, 20).map((m: any) => `  · ${m.name} | 담당고객${m.assignedCustomers}명 | 활동프로젝트${m.activeProjects}건 | 매출${(m.totalSalesAmount / 10000).toFixed(0)}만원 | 평가${m.performanceRating}점 | 재구매율${m.repurchaseRate}%`).join('\n')}

## 작업팀장/하청 (총 ${subcontractors.length}명)
${subcontractors.slice(0, 20).map((s: any) => `  · ${s.name} | ${s.company} | ${s.grade}등급 | 팀${s.teamSize}명 | 진행${s.ongoingProjects}건 | 완료${s.completedProjects}건 | 협력점수${s.cooperationScore}점`).join('\n')}
`.trim();
}

function buildSalesContext(deals: any[], customers: any[], managers: any[], subcontractors: any[]): string {
  const today = new Date().toISOString().split('T')[0];
  const todayMs = new Date(today).getTime();

  // 담당자별 수주율 계산
  const managerStats: Record<string, { total: number; success: number; failed: number; inProgress: number }> = {};
  for (const d of deals) {
    const mgr = d.salesManager || '미지정';
    if (!managerStats[mgr]) managerStats[mgr] = { total: 0, success: 0, failed: 0, inProgress: 0 };
    managerStats[mgr].total++;
    if (d.successStatus === 'success') managerStats[mgr].success++;
    else if (d.successStatus === 'failed') managerStats[mgr].failed++;
    else managerStats[mgr].inProgress++;
  }

  // 30일 이상 정체 딜 (진행중인 것만)
  const stalledDeals = deals.filter(d => {
    if (d.successStatus !== 'in-progress') return false;
    const regDate = new Date(d.registrationDate).getTime();
    return (todayMs - regDate) >= 30 * 24 * 60 * 60 * 1000;
  });

  // 단계별 분포
  const dealsByStatus = deals.reduce((acc, d) => {
    const label = statusMap[d.status] || d.status;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const dealsBySuccess = deals.reduce((acc, d) => {
    const label = successMap[d.successStatus] || d.successStatus;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return `
## 오늘 날짜: ${today}

## 영업 파이프라인 전체 (총 ${deals.length}건)
- 단계별 분포: ${Object.entries(dealsByStatus).map(([k, v]) => `${k} ${v}건`).join(', ')}
- 성공여부: ${Object.entries(dealsBySuccess).map(([k, v]) => `${k} ${v}건`).join(', ')}
- 전체 딜 목록:
${deals.map(d => `  · ${d.company} | 단계:${statusMap[d.status] || d.status} | 결과:${successMap[d.successStatus] || d.successStatus} | 서비스:${d.desiredService || '-'} | 수량:${d.totalQuantity || 0}대 | 견적:${d.quotationAmount || '-'} | 담당:${d.salesManager || '-'} | 등록일:${d.registrationDate} | 확정작업일:${d.confirmedWorkDate || '-'} | 세부사항:${d.requirements || '-'}`).join('\n')}

## 담당자별 수주율
${Object.entries(managerStats).map(([mgr, s]) => {
  const closed = s.success + s.failed;
  const rate = closed > 0 ? ((s.success / closed) * 100).toFixed(0) : '-';
  return `  · ${mgr} | 총${s.total}건 | 수주${s.success}건 | 실패${s.failed}건 | 진행중${s.inProgress}건 | 수주율:${rate}%`;
}).join('\n')}

## 30일 이상 정체 딜 (${stalledDeals.length}건)
${stalledDeals.length === 0 ? '  (없음)' : stalledDeals.map(d => {
  const days = Math.floor((todayMs - new Date(d.registrationDate).getTime()) / (24 * 60 * 60 * 1000));
  return `  · ${d.company} | 단계:${statusMap[d.status] || d.status} | ${days}일 경과 | 담당:${d.salesManager || '-'} | 서비스:${d.desiredService || '-'} | 견적:${d.quotationAmount || '-'}`;
}).join('\n')}
`.trim();
}

function buildCrmContext(deals: any[], customers: any[], managers: any[], subcontractors: any[]): string {
  const today = new Date().toISOString().split('T')[0];

  const customersByGrade = customers.reduce((acc, c) => {
    acc[c.grade || '미설정'] = (acc[c.grade || '미설정'] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const customersByStatus = customers.reduce((acc, c) => {
    acc[c.customerStatus || '미설정'] = (acc[c.customerStatus || '미설정'] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalAmount = customers.reduce((acc, c) => acc + (c.totalAmount || 0), 0);
  const overdueCustomers = customers.filter((c: any) => c.nextManagementDate && c.nextManagementDate < today);
  const soonCustomers = customers.filter((c: any) => {
    if (!c.nextManagementDate || c.nextManagementDate < today) return false;
    const diff = (new Date(c.nextManagementDate).getTime() - new Date(today).getTime()) / (24 * 60 * 60 * 1000);
    return diff <= 7;
  });

  return `
## 오늘 날짜: ${today}

## 고객 포트폴리오 전체 (총 ${customers.length}명)
- 등급별: ${Object.entries(customersByGrade).map(([k, v]) => `${k}등급 ${v}명`).join(', ')}
- 상태별: ${Object.entries(customersByStatus).map(([k, v]) => `${k} ${v}명`).join(', ')}
- 총 거래금액: ${(totalAmount / 100000000).toFixed(2)}억원
- 전체 고객 목록:
${customers.map((c: any) => `  · ${c.company} | ${c.grade || '미설정'}등급 | ${c.customerStatus || '-'} | 거래${c.deals}건 | 수량:${c.totalQuantity || 0}대 | 금액:${(c.totalAmount / 10000).toFixed(0)}만원 | 담당:${c.accountManager} | 다음관리일:${c.nextManagementDate || '-'} | 최근작업:${c.lastWorkDate || '-'}`).join('\n')}

## 관리 주기 현황
- 기한 초과 고객 (${overdueCustomers.length}명):
${overdueCustomers.length === 0 ? '  (없음)' : overdueCustomers.map((c: any) => `  · ${c.company} | ${c.grade || '미설정'}등급 | 기한:${c.nextManagementDate} | 담당:${c.accountManager}`).join('\n')}
- 7일 이내 임박 고객 (${soonCustomers.length}명):
${soonCustomers.length === 0 ? '  (없음)' : soonCustomers.map((c: any) => `  · ${c.company} | ${c.grade || '미설정'}등급 | 기한:${c.nextManagementDate} | 담당:${c.accountManager}`).join('\n')}
`.trim();
}

function buildSupplyContext(deals: any[], customers: any[], managers: any[], subcontractors: any[]): string {
  const today = new Date().toISOString().split('T')[0];

  return `
## 오늘 날짜: ${today}

## 고객책임자(매니저) 전체 (총 ${managers.length}명)
${managers.map((m: any) => `  · ${m.name} | 담당고객:${m.assignedCustomers}명 | 활동프로젝트:${m.activeProjects}건 | 완료프로젝트:${m.completedProjects || 0}건 | 매출:${(m.totalSalesAmount / 10000).toFixed(0)}만원 | 평가:${m.performanceRating}점 | 재구매율:${m.repurchaseRate}% | 고객만족도:${m.customerSatisfaction || '-'}점`).join('\n')}

## 작업팀장/하청업체 전체 (총 ${subcontractors.length}명)
${subcontractors.map((s: any) => `  · ${s.name} | ${s.company} | ${s.grade}등급 | 팀규모:${s.teamSize}명 | 진행:${s.ongoingProjects}건 | 완료:${s.completedProjects}건 | 협력점수:${s.cooperationScore}점 | 고객클레임:${s.customerComplaint ?? '-'} | 기기점검:${s.equipmentCheck ?? '-'} | 시간준수:${s.timeCompliance ?? '-'} | 사후관리:${s.afterCare ?? '-'} | 복장:${s.uniform ?? '-'} | 친절도:${s.kindness ?? '-'}`).join('\n')}
`.trim();
}

// ============================================================
// buildProfitContext — 프로젝트 손익 컨텍스트
// ratio 값(profitRatio, laborCostRatio)은 fraction (0~1) 형태로 저장되어 있어 *100으로 퍼센트 표시.
// ============================================================
function buildProfitContext(
  deals: any[], customers: any[], managers: any[],
  subcontractors: any[], projects: any[], laborRates: any[]
): string {
  const today = new Date().toISOString().split('T')[0];

  const inProgress = projects.filter((p: any) => p.status === 'in-progress');
  const completed = projects.filter((p: any) => p.status === 'completed');

  const totalRevenue = projects.reduce((s, p) => s + (p.netRevenue || 0), 0);
  const totalCost = projects.reduce((s, p) => s + (p.totalCost || 0), 0);
  const totalProfit = totalRevenue - totalCost;
  const avgProfitRatio = projects.length > 0
    ? (projects.reduce((s, p) => s + (p.profitRatio || 0), 0) / projects.length * 100).toFixed(1)
    : '-';

  // 서비스별 집계 + 역할별 인력 평균 (5개 역할, src/lib/roles.ts 기준)
  const byService: Record<string, {
    count: number;
    revenue: number;
    profit: number;
    roleTotals: Record<RoleCode, number>;
    daysTotal: number;
    withAssignments: number;
  }> = {};
  const roleAvgEmpty = (): Record<RoleCode, number> =>
    ROLE_ORDER.reduce((acc, r) => { acc[r] = 0; return acc; }, {} as Record<RoleCode, number>);

  for (const p of projects) {
    const svc = p.serviceType || '기타';
    if (!byService[svc]) {
      byService[svc] = {
        count: 0, revenue: 0, profit: 0,
        roleTotals: roleAvgEmpty(), daysTotal: 0, withAssignments: 0,
      };
    }
    byService[svc].count++;
    byService[svc].revenue += p.netRevenue || 0;
    byService[svc].profit += p.netProfit || 0;
    const wa = p.workerAssignments;
    if (wa && typeof wa === 'object') {
      let hasAny = false;
      for (const r of ROLE_ORDER) {
        const v = Number(wa[r]) || 0;
        if (v > 0) hasAny = true;
        byService[svc].roleTotals[r] += v;
      }
      const d = Number(wa.days) || 0;
      if (d > 0) hasAny = true;
      byService[svc].daysTotal += d;
      if (hasAny) byService[svc].withAssignments++;
    }
  }

  return `
## 오늘 날짜: ${today}

## 프로젝트 전체 (총 ${projects.length}건, 진행중 ${inProgress.length}, 완료 ${completed.length})
- 누적 순매출: ${(totalRevenue / 100000000).toFixed(2)}억원
- 누적 비용: ${(totalCost / 100000000).toFixed(2)}억원
- 누적 순이익: ${(totalProfit / 100000000).toFixed(2)}억원
- 평균 순익률: ${avgProfitRatio}%

## 진행중 프로젝트 목록 (상위 20건, work_date DESC)
${inProgress.slice(0, 20).map((p: any) => `  · ${p.projectName} | 서비스:${p.serviceType} | 작업일:${p.workDate || '-'} | 순매출:${((p.netRevenue||0)/10000).toFixed(0)}만 | 인건비:${((p.laborCost||0)/10000).toFixed(0)}만 (${((p.laborCostRatio||0)*100).toFixed(0)}%) | 순이익:${((p.netProfit||0)/10000).toFixed(0)}만 (${((p.profitRatio||0)*100).toFixed(0)}%)`).join('\n')}

## 완료 프로젝트 (최근 15건)
${completed.slice(0, 15).map((p: any) => `  · ${p.projectName} | ${p.completedAt?.substring(0,10) || '-'} | 사유:${p.completedReason} | 순매출:${((p.netRevenue||0)/10000).toFixed(0)}만 | 순이익:${((p.netProfit||0)/10000).toFixed(0)}만 (${((p.profitRatio||0)*100).toFixed(0)}%)${p.aiApplied ? ' [AI채택]' : ''}`).join('\n')}

## 서비스별 손익 + 역할별 인력 평균
${Object.entries(byService).map(([svc, s]) => {
  const ratio = s.revenue > 0 ? ((s.profit / s.revenue) * 100).toFixed(1) : '-';
  const n = s.withAssignments;
  const roleAvgStr = n > 0
    ? ROLE_ORDER.map((r) => `${ROLE_LABELS[r]}${(s.roleTotals[r] / n).toFixed(1)}`).join('/')
      + `/${(s.daysTotal / n).toFixed(1)}일`
    : '인력 미입력';
  return `  · ${svc} | ${s.count}건 | 순매출:${(s.revenue / 10000).toFixed(0)}만 | 순이익:${(s.profit / 10000).toFixed(0)}만 (${ratio}%) | 평균배치: ${roleAvgStr}`;
}).join('\n')}

## 현재 단가표 (최근 3개월, 최대 15행 — 5역할 × 3월)
${laborRates.slice(0, 15).map((r: any) => `  · ${r.yearMonth} ${r.role}(${ROLE_LABELS[(r.role as RoleCode)] ?? r.role}) ${(r.dailyRate || 0).toLocaleString()}원/일`).join('\n')}
`.trim();
}

// 인자 순서: deals, customers, managers, subcontractors, projects, laborRates, expertType.
// projects/laborRates는 기본값 빈 배열 — profit 외 expert는 사용 안 함.
export function buildDataContext(
  deals: any[],
  customers: any[],
  managers: any[],
  subcontractors: any[],
  projects: any[] = [],
  laborRates: any[] = [],
  expertType: ExpertType = 'assistant'
): string {
  switch (expertType) {
    case 'sales':  return buildSalesContext(deals, customers, managers, subcontractors);
    case 'crm':    return buildCrmContext(deals, customers, managers, subcontractors);
    case 'supply': return buildSupplyContext(deals, customers, managers, subcontractors);
    case 'profit': return buildProfitContext(deals, customers, managers, subcontractors, projects, laborRates);
    default:       return buildFullContext(deals, customers, managers, subcontractors);
  }
}

// suggestProjectStaffing 은 src/lib/claude-staffing.ts 로 이관됨 (Phase 1.8).
