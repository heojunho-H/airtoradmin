// AI 전문가 에이전트 — 이름·소개·아이콘·추천 질문. 시스템 프롬프트는 서버(functions/_lib/ai-prompts.ts)에 있다.
// ID(assistant·sales·crm·supply·profit)는 D1 대화에 저장되므로 바꾸지 않는다.
// 추천 질문은 전문가 스냅샷(src/lib/ai/snapshot/)에 들어 있는 데이터로 답할 수 있는 것만 둔다.

import { ChartColumn, ClipboardCheck, FileUp, Gauge, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import type { PersonaId } from './types';

export const PERSONA_ORDER: PersonaId[] = ['assistant', 'sales', 'crm', 'supply', 'profit'];

export interface PersonaConfig {
  /** 전문가 이름 (카드·헤더·답변 라벨) */
  label: string;
  short: string;
  /** 카드의 한 줄 소개 */
  description: string;
  icon: LucideIcon;
  prompts: string[];
}

export const PERSONAS: Record<PersonaId, PersonaConfig> = {
  assistant: {
    label: '종합 분석 AI',
    short: '종합',
    description: '영업·고객·공급망·손익을 한 번에',
    icon: Gauge,
    prompts: [
      '오늘 가장 먼저 챙겨야 할 일 5가지는?',
      '이번 달 영업·고객·공급망·손익 핵심 지표를 요약해줘',
      '지난달과 비교해 달라진 점과 원인은?',
      '자동 실패가 임박한 딜과 관리 기한이 지난 주요 고객은?',
      '적자·저마진 프로젝트와 평가가 낮은 작업팀장을 알려줘',
      '다음 달 일정이 몰린 지역과 작업팀장 여력은?',
    ],
  },
  sales: {
    label: '영업 전문가',
    short: '영업',
    description: '파이프라인·수주 전략·담당자 코칭',
    icon: TrendingUp,
    prompts: [
      '자동 실패까지 3일 이내 남은 딜과 대응 방안은?',
      '단계별 파이프라인 금액과 병목은?',
      '담당자별 수주율과 코칭 포인트를 알려줘',
      '서비스·수량 구간별 수주율을 비교해줘',
      '신규 고객과 기존 고객 딜의 성과 차이는?',
      '최근 실패한 딜의 공통점과 관리 메모를 정리해줘',
    ],
  },
  crm: {
    label: '고객관리 전문가',
    short: '고객관리',
    description: '재구매·이탈 방지·관리 주기',
    icon: Users,
    prompts: [
      '관리 기한이 지난 S·A 등급 고객과 연락 우선순위는?',
      'RFM 세그먼트별 고객 현황과 전략을 알려줘',
      '이탈 위험이 높은 고액 고객은?',
      '한 가지 서비스만 이용한 고객 중 교차판매 후보는?',
      '재구매 간격이 관리 주기보다 늦어진 고객은?',
      '담당 책임자별 고객 수와 관리 부담을 비교해줘',
    ],
  },
  supply: {
    label: '공급망 전문가',
    short: '공급망',
    description: '고객책임자·작업팀장 평가와 배치',
    icon: ClipboardCheck,
    prompts: [
      '작업팀장 점수와 감점이 많은 항목을 분석해줘',
      '퇴출 심사·4등급 작업팀장과 개선 방안은?',
      '고객책임자별 담당 고객과 수주 실적을 비교해줘',
      '지역별 예정 작업 대비 투입 가능한 작업팀장은?',
      '작업이 특정 작업팀장에게 몰리고 있지 않아?',
      '작업팀장 평가가 입력되지 않은 작업을 찾아줘',
    ],
  },
  profit: {
    label: '손익 전문가',
    short: '손익',
    description: '마진·인건비·단가 시뮬레이션',
    icon: ChartColumn,
    prompts: [
      '적자이거나 순익률 10% 미만인 프로젝트와 원인은?',
      '서비스별 순익률과 인건비율을 비교해줘',
      '일당이 10% 오르면 서비스별 순익률은 얼마나 떨어져?',
      'AI 인력배치 제안과 실제 배치·손익 차이는?',
      '식비·교통비 등 변동비가 큰 프로젝트는?',
      '목표 순익률 40%를 달성하려면 무엇을 바꿔야 해?',
    ],
  },
};

export function isPersonaId(v: unknown): v is PersonaId {
  return typeof v === 'string' && (PERSONA_ORDER as string[]).includes(v);
}

/** 견적서 입력 도우미 — 채팅 전문가가 아니다(대화·스냅샷 없음). PDF 를 읽어 딜·고객에 입력한다 (QuoteIntakePanel). */
export const INTAKE_AGENT = {
  label: '견적서 입력 도우미',
  short: '견적서',
  description: '견적서 PDF로 딜·고객 자동 입력',
  icon: FileUp,
} satisfies Omit<PersonaConfig, 'prompts'>;
