import { useState, useRef, useEffect, useMemo } from 'react';
import { X, Send, Sparkles, TrendingUp, Users, Package, RotateCcw } from 'lucide-react';
import { AiChatMessage } from './AiChatMessage';
import {
  sendChatMessage,
  buildDataContext,
  type ChatMessage,
  type ExpertType,
  EXPERT_CONFIGS,
  EXPERT_TYPES,
  EXPERT_SUGGESTED_PROMPTS,
} from '../../lib/gemini';

interface AiChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  deals: any[];
  customers: any[];
  managers: any[];
  subcontractors: any[];
}

const EXPERT_STYLES: Record<ExpertType, {
  icon: React.ElementType;
  active: string;
  inactive: string;
  hover: string;
  send: string;
  headerGradient: string;
  iconColor: string;
  emptyBg: string;
  emptyIcon: string;
  promptHover: string;
  promptBorder: string;
  promptText: string;
  ring: string;
}> = {
  assistant: {
    icon: Sparkles,
    active: 'bg-purple-600 text-white',
    inactive: 'bg-purple-50 text-purple-600',
    hover: 'hover:bg-purple-100',
    send: 'bg-purple-600 hover:bg-purple-700',
    headerGradient: 'from-purple-50 to-blue-50',
    iconColor: 'text-purple-500',
    emptyBg: 'bg-purple-100',
    emptyIcon: 'text-purple-500',
    promptHover: 'hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700',
    promptBorder: 'border-slate-200',
    promptText: 'text-slate-600',
    ring: 'focus:ring-purple-500',
  },
  sales: {
    icon: TrendingUp,
    active: 'bg-blue-600 text-white',
    inactive: 'bg-blue-50 text-blue-600',
    hover: 'hover:bg-blue-100',
    send: 'bg-blue-600 hover:bg-blue-700',
    headerGradient: 'from-blue-50 to-sky-50',
    iconColor: 'text-blue-500',
    emptyBg: 'bg-blue-100',
    emptyIcon: 'text-blue-500',
    promptHover: 'hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700',
    promptBorder: 'border-slate-200',
    promptText: 'text-slate-600',
    ring: 'focus:ring-blue-500',
  },
  crm: {
    icon: Users,
    active: 'bg-emerald-600 text-white',
    inactive: 'bg-emerald-50 text-emerald-600',
    hover: 'hover:bg-emerald-100',
    send: 'bg-emerald-600 hover:bg-emerald-700',
    headerGradient: 'from-emerald-50 to-teal-50',
    iconColor: 'text-emerald-500',
    emptyBg: 'bg-emerald-100',
    emptyIcon: 'text-emerald-500',
    promptHover: 'hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700',
    promptBorder: 'border-slate-200',
    promptText: 'text-slate-600',
    ring: 'focus:ring-emerald-500',
  },
  supply: {
    icon: Package,
    active: 'bg-orange-600 text-white',
    inactive: 'bg-orange-50 text-orange-600',
    hover: 'hover:bg-orange-100',
    send: 'bg-orange-600 hover:bg-orange-700',
    headerGradient: 'from-orange-50 to-amber-50',
    iconColor: 'text-orange-500',
    emptyBg: 'bg-orange-100',
    emptyIcon: 'text-orange-500',
    promptHover: 'hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700',
    promptBorder: 'border-slate-200',
    promptText: 'text-slate-600',
    ring: 'focus:ring-orange-500',
  },
};

export function AiChatPanel({ isOpen, onClose, deals, customers, managers, subcontractors }: AiChatPanelProps) {
  const [expertType, setExpertType] = useState<ExpertType>('assistant');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const dataContext = useMemo(
    () => buildDataContext(deals, customers, managers, subcontractors, expertType),
    [deals, customers, managers, subcontractors, expertType]
  );

  const style = EXPERT_STYLES[expertType];
  const config = EXPERT_CONFIGS[expertType];
  const ExpertIcon = style.icon;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleExpertChange = (type: ExpertType) => {
    if (type === expertType) return;
    setExpertType(type);
    setMessages([]);
    setInput('');
  };

  const handleSend = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      parts: [{ text: messageText }],
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(newMessages, dataContext, expertType);
      const aiMessage: ChatMessage = {
        role: 'model',
        parts: [{ text: response }],
      };
      setMessages([...newMessages, aiMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        role: 'model',
        parts: [{ text: '죄송합니다. 응답을 생성하는 중 오류가 발생했습니다. 다시 시도해주세요.' }],
      };
      setMessages([...newMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = () => {
    setMessages([]);
    setInput('');
  };

  return (
    <>
      {/* 배경 오버레이 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* 패널 */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* 헤더 */}
        <div className={`flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r ${style.headerGradient}`}>
          <div className="flex items-center gap-2">
            <ExpertIcon className={`w-5 h-5 ${style.iconColor}`} />
            <div>
              <span className="text-[15px] font-semibold text-slate-800">{config.label}</span>
              <p className="text-[10px] text-slate-400 leading-none mt-0.5">{config.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleReset}
              className="p-1.5 hover:bg-white/60 rounded-lg transition-colors"
              title="대화 초기화"
            >
              <RotateCcw className="w-4 h-4 text-slate-500" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/60 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* 메시지 영역 */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className={`w-12 h-12 ${style.emptyBg} rounded-2xl flex items-center justify-center mb-4`}>
                <ExpertIcon className={`w-6 h-6 ${style.emptyIcon}`} />
              </div>
              <h3 className="text-[15px] font-semibold text-slate-700 mb-1">무엇을 도와드릴까요?</h3>
              <p className="text-[12px] text-slate-400 mb-6">{config.description}</p>
              <div className="w-full space-y-2">
                {EXPERT_SUGGESTED_PROMPTS[expertType].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className={`w-full text-left px-4 py-2.5 bg-slate-50 ${style.promptHover} border ${style.promptBorder} rounded-xl text-[13px] ${style.promptText} transition-colors`}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <AiChatMessage
                  key={i}
                  role={msg.role}
                  text={msg.parts[0].text}
                />
              ))}
              {isLoading && (
                <AiChatMessage role="model" text="" isLoading />
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* 입력 영역 */}
        <div className="border-t border-slate-200 px-4 pt-3 pb-3 bg-white">
          {/* 전문가 선택 버튼 */}
          <div className="flex gap-1.5 mb-2.5">
            {EXPERT_TYPES.map((type) => {
              const cfg = EXPERT_CONFIGS[type];
              const sty = EXPERT_STYLES[type];
              const Icon = sty.icon;
              const isActive = type === expertType;
              return (
                <button
                  key={type}
                  onClick={() => handleExpertChange(type)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg text-[11px] font-medium transition-colors ${
                    isActive ? sty.active : `${sty.inactive} ${sty.hover}`
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cfg.buttonLabel}</span>
                </button>
              );
            })}
          </div>

          {/* 입력창 + 전송 버튼 */}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="질문을 입력하세요..."
              rows={1}
              className={`flex-1 resize-none px-3.5 py-2.5 text-[13px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 ${style.ring} focus:border-transparent placeholder:text-slate-400 max-h-24`}
              style={{ minHeight: '40px' }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className={`flex-shrink-0 p-2.5 ${style.send} disabled:bg-slate-200 disabled:cursor-not-allowed text-white rounded-xl transition-colors`}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 text-center">Gemini AI 기반 · 데이터 기반 답변</p>
        </div>
      </div>
    </>
  );
}
