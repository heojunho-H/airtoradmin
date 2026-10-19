// AI 어시스턴트 페르소나(분석 유형) — 라벨·탭 이름·아이콘·추천 질문. 시스템 프롬프트는 서버(functions/_lib/ai-prompts.ts)에 있다.

import { ChartColumn, ClipboardCheck, Gauge, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import type { PersonaId } from './types';

export const PERSONA_ORDER: PersonaId[] = ['assistant', 'sales', 'crm', 'supply', 'profit'];

export interface PersonaConfig {
  label: string;
  short: string;
  /** 빈 화면 추천 카드의 탭 이름 */
  tab: string;
  description: string;
  icon: LucideIcon;
  prompts: string[];
}

export const PERSONAS: Record<PersonaId, PersonaConfig> = {
  assistant: {
    label: '종합 분석',
    short: '종합',
    tab: '종합 현황',
    description: '영업·고객·공급망·손익 데이터를 한 번에 분석',
    icon: Gauge,
    prompts: [
      '이번 달 영업 현황을 요약해줘',
      '고객 등급별 매출을 분석해줘',
      '성과가 좋은 작업팀장은 누구야?',
      '관리 주기가 임박한 고객은?',
      '이번 주 가장 먼저 챙겨야 할 일 3가지는?',
      '지난달과 비교해 이번 달 달라진 점은?',
    ],
  },
  sales: {
    label: 'B2B 영업 전문가',
    short: '영업',
    tab: '영업·수주',
    description: '영업 파이프라인 진단과 수주 전략',
    icon: TrendingUp,
    prompts: [
      '등록 후 7일이 넘었는데 진행 중인 딜과 대응 방안은?',
      '담당자별 수주율을 비교해줘',
      '최근 6개월 수주 추이와 서비스 구성을 분석해줘',
      '현재 파이프라인의 단계별 분포와 병목은?',
      '실패한 딜의 공통점을 분석해줘',
      '견적 금액이 큰 진행 중 딜을 정리해줘',
    ],
  },
  crm: {
    label: 'CRM 전문가',
    short: 'CRM',
    tab: '고객·재구매',
    description: '고객 관계 관리와 재구매 전략',
    icon: Users,
    prompts: [
      '이탈 위험이 높은 고객을 찾아줘',
      '등급별 고객 포트폴리오를 진단해줘',
      '업셀링 기회가 있는 고객은?',
      '관리 기한이 지난 고객과 우선순위를 정리해줘',
      '재구매 시기가 다가온 고객을 알려줘',
      '최근 3개월 신규 고객의 특징은?',
    ],
  },
  supply: {
    label: '공급망 전문가',
    short: '공급망',
    tab: '협력사·평가',
    description: '고객책임자·작업팀장 성과와 배치',
    icon: ClipboardCheck,
    prompts: [
      '고객책임자별 성과를 평가해줘',
      '작업팀장 최종 점수와 평가 항목별 약점을 분석해줘',
      '협력사 리스크를 진단해줘',
      '수요 대비 작업팀장 공급 여력은?',
      '평가 점수가 낮은 작업팀장과 개선할 점은?',
      '고객책임자별 담당 고객 수를 비교해줘',
    ],
  },
  profit: {
    label: '손익 전문가',
    short: '손익',
    tab: '손익·마진',
    description: '프로젝트 손익과 마진 관리',
    icon: ChartColumn,
    prompts: [
      '이번 달 순익률이 낮은 프로젝트는?',
      '서비스별 평균 순익률을 비교해줘',
      '인건비율이 50%를 넘는 프로젝트와 원인은?',
      '다음 달 단가 인상 시 마진 영향을 분석해줘',
      '적자 프로젝트와 원인을 정리해줘',
      '인건비 비중이 높은 프로젝트를 찾아줘',
    ],
  },
};

export function isPersonaId(v: unknown): v is PersonaId {
  return typeof v === 'string' && (PERSONA_ORDER as string[]).includes(v);
}
