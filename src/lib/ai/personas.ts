// AI 어시스턴트 페르소나 — 라벨·추천 질문·스타일. 시스템 프롬프트는 서버(functions/_lib/ai-prompts.ts)에 있다.
// Tailwind 4 는 소스의 리터럴 문자열만 클래스로 인식하므로 색상 클래스는 조합하지 말고 통째로 적는다.

import { Calculator, Package, Sparkles, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import type { PersonaId } from './types';

export const PERSONA_ORDER: PersonaId[] = ['assistant', 'sales', 'crm', 'supply', 'profit'];

export interface PersonaConfig {
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
  prompts: string[];
}

export const PERSONAS: Record<PersonaId, PersonaConfig> = {
  assistant: {
    label: '종합 분석',
    short: '종합',
    description: '영업·고객·공급망·손익 데이터를 한 번에 분석',
    icon: Sparkles,
    prompts: [
      '이번 달 영업 현황을 요약해줘',
      '고객 등급별 매출을 분석해줘',
      '성과가 좋은 작업팀장은 누구야?',
      '관리 주기가 임박한 고객은?',
    ],
  },
  sales: {
    label: 'B2B 영업 전문가',
    short: '영업',
    description: '영업 파이프라인 진단과 수주 전략',
    icon: TrendingUp,
    prompts: [
      '등록 후 7일이 넘었는데 진행 중인 딜과 대응 방안은?',
      '담당자별 수주율을 비교해줘',
      '최근 6개월 수주 추이와 서비스 구성을 분석해줘',
      '현재 파이프라인의 단계별 분포와 병목은?',
    ],
  },
  crm: {
    label: 'CRM 전문가',
    short: 'CRM',
    description: '고객 관계 관리와 재구매 전략',
    icon: Users,
    prompts: [
      '이탈 위험이 높은 고객을 찾아줘',
      '등급별 고객 포트폴리오를 진단해줘',
      '업셀링 기회가 있는 고객은?',
      '관리 기한이 지난 고객과 우선순위를 정리해줘',
    ],
  },
  supply: {
    label: '공급망 전문가',
    short: '공급망',
    description: '고객책임자·작업팀장 성과와 배치',
    icon: Package,
    prompts: [
      '고객책임자별 성과를 평가해줘',
      '작업팀장 최종 점수와 평가 항목별 약점을 분석해줘',
      '협력사 리스크를 진단해줘',
      '수요 대비 작업팀장 공급 여력은?',
    ],
  },
  profit: {
    label: '손익 전문가',
    short: '손익',
    description: '프로젝트 손익과 마진 관리',
    icon: Calculator,
    prompts: [
      '이번 달 순익률이 낮은 프로젝트는?',
      '서비스별 평균 순익률을 비교해줘',
      '인건비율이 50%를 넘는 프로젝트와 원인은?',
      '다음 달 단가 인상 시 마진 영향을 분석해줘',
    ],
  },
};

export interface PersonaStyle {
  chip: string;
  dot: string;
  icon: string;
  iconBg: string;
  active: string;
  card: string;
}

export const PERSONA_STYLES: Record<PersonaId, PersonaStyle> = {
  assistant: {
    chip: 'bg-purple-50 text-purple-700 border-purple-200',
    dot: 'bg-purple-500',
    icon: 'text-purple-600',
    iconBg: 'bg-purple-100',
    active: 'border-purple-500 ring-2 ring-purple-100 bg-purple-50/50',
    card: 'hover:border-purple-300 hover:bg-purple-50/40',
  },
  sales: {
    chip: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
    icon: 'text-blue-600',
    iconBg: 'bg-blue-100',
    active: 'border-blue-500 ring-2 ring-blue-100 bg-blue-50/50',
    card: 'hover:border-blue-300 hover:bg-blue-50/40',
  },
  crm: {
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    icon: 'text-emerald-600',
    iconBg: 'bg-emerald-100',
    active: 'border-emerald-500 ring-2 ring-emerald-100 bg-emerald-50/50',
    card: 'hover:border-emerald-300 hover:bg-emerald-50/40',
  },
  supply: {
    chip: 'bg-orange-50 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
    icon: 'text-orange-600',
    iconBg: 'bg-orange-100',
    active: 'border-orange-500 ring-2 ring-orange-100 bg-orange-50/50',
    card: 'hover:border-orange-300 hover:bg-orange-50/40',
  },
  profit: {
    chip: 'bg-teal-50 text-teal-700 border-teal-200',
    dot: 'bg-teal-500',
    icon: 'text-teal-600',
    iconBg: 'bg-teal-100',
    active: 'border-teal-500 ring-2 ring-teal-100 bg-teal-50/50',
    card: 'hover:border-teal-300 hover:bg-teal-50/40',
  },
};

export function isPersonaId(v: unknown): v is PersonaId {
  return typeof v === 'string' && (PERSONA_ORDER as string[]).includes(v);
}
