import { Fragment, type ReactNode } from 'react';
import { PERSONA_ORDER, PERSONAS } from '../../../lib/ai/personas';
import type { PersonaId } from '../../../lib/ai/types';
import { AiSparkle } from './AiSparkle';

interface Props {
  persona: PersonaId;
  onPersona: (p: PersonaId) => void;
  onAsk: (text: string) => void;
  disabled?: boolean;
  /** 가운데 큰 입력창 (ChatComposer variant="hero") */
  composer: ReactNode;
}

/** 새 대화 첫 화면 — ✦ 제목, 큰 입력창, 분석 유형 탭이 달린 추천 질문 카드 */
export function ChatEmptyState({ persona, onPersona, onAsk, disabled, composer }: Props) {
  const config = PERSONAS[persona];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-8">
      <div className="mx-auto flex min-h-full max-w-[800px] flex-col justify-center py-10 md:py-14">
        <div className="flex flex-col items-center text-center">
          <AiSparkle className="h-7 w-7 md:h-8 md:w-8" />
          <h2 className="mt-3 bg-gradient-to-r from-[#8cc2f6] via-[#4a8ce8] to-[#2a5fc4] bg-clip-text text-[24px] font-bold leading-tight tracking-tight text-transparent break-keep text-balance md:text-[30px]">
            에어터 운영 현황을 한눈에 정리해드려요
          </h2>
        </div>

        <div className="mt-8 md:mt-10">{composer}</div>

        <section className="mt-6 rounded-xl border border-[#e6e9ee] bg-white px-4 py-4 md:px-6 md:py-5" aria-label="추천 질문">
          <div role="tablist" aria-label="분석 유형" className="flex items-center overflow-x-auto pb-1">
            {PERSONA_ORDER.map((id, i) => {
              const p = PERSONAS[id];
              const Icon = p.icon;
              const active = id === persona;
              return (
                <Fragment key={id}>
                  {i > 0 && <span className="mx-2 h-3.5 w-px flex-shrink-0 bg-slate-200 md:mx-2.5" aria-hidden="true" />}
                  <button
                    role="tab"
                    aria-selected={active}
                    onClick={() => onPersona(id)}
                    className={`inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap py-1 text-[13px] transition-colors ${
                      active ? 'font-semibold text-slate-900' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                    {p.tab}
                  </button>
                </Fragment>
              );
            })}
          </div>
          <ul role="tabpanel" aria-label={`${config.tab} 추천 질문`} className="mt-2">
            {config.prompts.map((q) => (
              <li key={q}>
                <button
                  onClick={() => onAsk(q)}
                  disabled={disabled}
                  className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-2 text-left text-[14px] text-slate-800 transition-colors hover:bg-slate-50 hover:text-blue-700 disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-slate-800"
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
