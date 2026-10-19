import { Users } from 'lucide-react';
import { PERSONA_ORDER, PERSONA_STYLES, PERSONAS } from '../../../lib/ai/personas';
import type { PersonaId } from '../../../lib/ai/types';

interface Props {
  persona: PersonaId;
  onPersona: (p: PersonaId) => void;
  onAsk: (text: string) => void;
  disabled?: boolean;
}

export function ChatEmptyState({ persona, onPersona, onAsk, disabled }: Props) {
  const config = PERSONAS[persona];
  const style = PERSONA_STYLES[persona];
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 py-8">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-[20px] font-bold text-slate-900 tracking-tight">무엇을 분석해 드릴까요?</h2>
        <p className="mt-1 text-[13px] text-slate-500">분석 유형을 고르면 해당 데이터를 바탕으로 Claude가 답합니다.</p>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-2" role="radiogroup" aria-label="분석 유형">
          {PERSONA_ORDER.map((id) => {
            const p = PERSONAS[id];
            const s = PERSONA_STYLES[id];
            const Icon = p.icon;
            const active = id === persona;
            return (
              <button
                key={id}
                role="radio"
                aria-checked={active}
                onClick={() => onPersona(id)}
                className={`flex flex-col items-start gap-1.5 rounded-xl border bg-white p-3 text-left transition-colors ${active ? s.active : `border-slate-200 ${s.card}`}`}
              >
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${s.iconBg}`}>
                  <Icon className={`h-4 w-4 ${s.icon}`} />
                </span>
                <span className="text-[13px] font-semibold text-slate-800">{p.label}</span>
                <span className="text-[11px] leading-snug text-slate-500">{p.description}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <p className={`mb-2 text-[12px] font-semibold ${style.icon}`}>{config.label} 추천 질문</p>
          <div className="grid gap-2 md:grid-cols-2">
            {config.prompts.map((q) => (
              <button
                key={q}
                onClick={() => onAsk(q)}
                disabled={disabled}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-[13px] text-slate-700 hover:border-purple-300 hover:bg-purple-50/50 hover:text-purple-800 disabled:opacity-50 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-6 flex items-center gap-1.5 text-[12px] text-slate-400">
          <Users className="h-3.5 w-3.5" /> 모든 AI 대화는 팀 전체에 공유됩니다. 개인정보는 입력하지 마세요.
        </p>
      </div>
    </div>
  );
}
