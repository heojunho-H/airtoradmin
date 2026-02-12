// Gemini AI 서비스 — API 호출 및 데이터 컨텍스트 빌더

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

const SYSTEM_INSTRUCTION = `당신은 에어터(Airtor) 관리자 대시보드의 AI 비서입니다.
사용자는 영업, 고객관리, 공급망관리를 담당하는 관리자입니다.
아래 제공된 실제 데이터를 기반으로 질문에 답변하고, 인사이트를 제공하세요.

규칙:
- 한국어로 답변하세요
- 데이터에 기반한 구체적인 수치를 포함하세요
- 답변은 간결하고 핵심만 전달하세요
- 표나 목록 형식을 적극 활용하세요
- 데이터에 없는 내용은 추측하지 마세요`;

export async function sendChatMessage(
  messages: ChatMessage[],
  dataContext: string
): Promise<string> {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: `${SYSTEM_INSTRUCTION}\n\n${dataContext}` }],
      },
      contents: messages,
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
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

export function buildDataContext(
  deals: any[],
  customers: any[],
  managers: any[],
  subcontractors: any[]
): string {
  const today = new Date().toISOString().split('T')[0];

  // 영업 데이터 요약
  const statusMap: Record<string, string> = {
    'new': '신규', 'call': '유선상담', 'quote-sent': '견적서 발송',
    'quote-call': '유선견적상담', 'price-negotiation': '가격조율',
    'schedule': '일정조율', 'confirmed': '수주확정',
  };
  const successMap: Record<string, string> = {
    'in-progress': '진행중', 'success': '성공', 'failed': '실패',
  };

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

  // 고객 데이터 요약
  const customersByGrade = customers.reduce((acc, c) => {
    acc[c.grade] = (acc[c.grade] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalCustomerAmount = customers.reduce((acc, c) => acc + (c.totalAmount || 0), 0);

  // 관리 주기 임박 고객
  const dueCustomers = customers.filter((c: any) => c.nextManagementDate && c.nextManagementDate <= today);

  return `
## 오늘 날짜: ${today}

## 영업 데이터 (총 ${deals.length}건)
- 진행상태별: ${Object.entries(dealsByStatus).map(([k, v]) => `${k} ${v}건`).join(', ')}
- 성공여부별: ${Object.entries(dealsBySuccess).map(([k, v]) => `${k} ${v}건`).join(', ')}
- 딜 목록:
${deals.slice(0, 30).map(d => `  · ${d.company} | 상태:${statusMap[d.status] || d.status} | 성공여부:${successMap[d.successStatus] || d.successStatus} | 견적:${d.quotationAmount} | 담당:${d.salesManager} | 등록일:${d.registrationDate}`).join('\n')}

## 고객 데이터 (총 ${customers.length}명)
- 등급별: ${Object.entries(customersByGrade).map(([k, v]) => `${k}등급 ${v}명`).join(', ')}
- 총 거래금액: ${(totalCustomerAmount / 100000000).toFixed(1)}억원
- 관리주기 도래 고객: ${dueCustomers.length}명${dueCustomers.length > 0 ? ' (' + dueCustomers.map((c: any) => c.company).join(', ') + ')' : ''}
- 고객 목록:
${customers.slice(0, 30).map((c: any) => `  · ${c.company} | ${c.grade}등급 | ${c.customerStatus || c.status || ''} | 거래${c.deals}건 | 금액${(c.totalAmount / 10000).toFixed(0)}만원 | 담당:${c.accountManager} | 다음관리일:${c.nextManagementDate}`).join('\n')}

## 고객책임자 (총 ${managers.length}명)
${managers.slice(0, 20).map((m: any) => `  · ${m.name} | 담당고객${m.assignedCustomers}명 | 활동프로젝트${m.activeProjects}건 | 매출${(m.totalSalesAmount / 10000).toFixed(0)}만원 | 평가${m.performanceRating}점 | 재구매율${m.repurchaseRate}%`).join('\n')}

## 작업팀장/하청 (총 ${subcontractors.length}명)
${subcontractors.slice(0, 20).map((s: any) => `  · ${s.name} | ${s.company} | ${s.grade}등급 | 팀${s.teamSize}명 | 진행${s.ongoingProjects}건 | 완료${s.completedProjects}건 | 협력점수${s.cooperationScore}점`).join('\n')}
`.trim();
}
