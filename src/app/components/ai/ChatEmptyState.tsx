import type { ReactNode } from 'react';
import { INTAKE_AGENT, PERSONA_ORDER, PERSONAS } from '../../../lib/ai/personas';
import type { PersonaId } from '../../../lib/ai/types';
import { AiSparkle } from './AiSparkle';

interface Props {
  persona: PersonaId;
  onPersona: (p: PersonaId) => void;
  /** 6번째 카드 — 견적서 입력 도우미 화면으로 */
  onIntake: () => void;
  onAsk: (text: string) => void;
  disabled?: boolean;
  /** 가운데 큰 입력창 (ChatComposer variant="hero") */
  composer: ReactNode;
}

const CARD = 'flex w-[11rem] flex-shrink-0 snap-start flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors md:w-auto';
const CARD_IDLE = 'border-[#e6e9ee] bg-white hover:border-slate-300';

/** 새 대화 첫 화면 — ✦ 제목, 전문가 카드(5 + 견적서 입력 도우미), 큰 입력창, 고른 전문가의 추천 질문 */
export function ChatEmptyState({ persona, onPersona, onIntake, onAsk, disabled, composer }: Props) {
  const config = PERSONAS[persona];
  const IntakeIcon = INTAKE_AGENT.icon;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-8">
      <div className="mx-auto flex min-h-full max-w-[960px] flex-col justify-center py-8 md:py-12">
        <div className="flex flex-col items-center text-center">
          <AiSparkle className="h-8 w-8 md:h-9 md:w-9" />
          <h2 className="mt-3 bg-gradient-to-r from-[#8cc2f6] via-[#4a8ce8] to-[#2a5fc4] bg-clip-text text-[32px] font-bold leading-tight tracking-tight text-transparent break-keep text-balance md:text-[40px]">
            에어터 운영 현황을 한눈에 정리해드려요
          </h2>
        </div>

        <div
          role="group"
          aria-label="전문가 선택"
          className="-mx-4 mt-7 flex snap-x gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:mt-8 md:grid md:grid-cols-3 md:overflow-visible md:px-0"
        >
          {PERSONA_ORDER.map((id) => {
            const p = PERSONAS[id];
            const Icon = p.icon;
            const active = id === persona;
            return (
              <button
                key={id}
                aria-pressed={active}
                onClick={() => onPersona(id)}
                className={`${CARD} ${active ? 'border-[#5b9cf2] bg-[#f3f8ff] shadow-[0_2px_10px_rgba(59,130,246,0.10)]' : CARD_IDLE}`}
              >
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${active ? 'bg-[#3b82f6] text-white' : 'bg-slate-100 text-slate-500'}`}>
                  <Icon className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <span className={`text-[18px] font-semibold ${active ? 'text-[#1d4fb8]' : 'text-slate-800'}`}>{p.label}</span>
                <span className="text-[15px] leading-snug text-slate-500 break-keep">{p.description}</span>
              </button>
            );
          })}
          {/* 대화가 아니라 업로드 화면으로 바뀐다 */}
          <button onClick={onIntake} className={`${CARD} ${CARD_IDLE}`}>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <IntakeIcon className="h-5 w-5" strokeWidth={1.9} />
            </span>
            <span className="flex flex-wrap items-center gap-x-1 text-[18px] font-semibold text-slate-800">
              {INTAKE_AGENT.label}
              <span className="rounded bg-[#eef5ff] px-1 py-px text-[13px] font-semibold text-[#3b82f6]">NEW</span>
            </span>
            <span className="text-[15px] leading-snug text-slate-500 break-keep">{INTAKE_AGENT.description}</span>
          </button>
        </div>

        <div className="mt-5">{composer}</div>

        <section className="mt-5 rounded-xl border border-[#e6e9ee] bg-white px-4 py-4 md:px-6 md:py-5" aria-label={`${config.label} 추천 질문`}>
          <p className="flex items-center gap-1.5 text-[17px] font-semibold text-slate-900">
            <config.icon className="h-[18px] w-[18px] text-slate-500" strokeWidth={1.9} />
            {config.label} 추천 질문
          </p>
          <ul className="mt-3">
            {config.prompts.map((q) => (
              <li key={q}>
                <button
                  onClick={() => onAsk(q)}
                  disabled={disabled}
                  className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-2.5 text-left text-[19px] text-slate-800 transition-colors hover:bg-slate-50 hover:text-blue-700 disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-slate-800"
                >
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
