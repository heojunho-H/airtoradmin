import { useState, useRef, useEffect, useMemo } from 'react';
import { X, Send, Sparkles, RotateCcw } from 'lucide-react';
import { AiChatMessage } from './AiChatMessage';
import { sendChatMessage, buildDataContext, type ChatMessage } from '../../lib/gemini';

interface AiChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  deals: any[];
  customers: any[];
  managers: any[];
  subcontractors: any[];
}

const SUGGESTED_PROMPTS = [
  '이번 달 영업 현황을 요약해줘',
  '고객 등급별 매출 분석해줘',
  '성과가 좋은 작업팀장은 누구야?',
  '관리 주기가 임박한 고객은?',
];

export function AiChatPanel({ isOpen, onClose, deals, customers, managers, subcontractors }: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const dataContext = useMemo(
    () => buildDataContext(deals, customers, managers, subcontractors),
    [deals, customers, managers, subcontractors]
  );

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
      const response = await sendChatMessage(newMessages, dataContext);
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
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-blue-50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <span className="text-[15px] font-semibold text-slate-800">AI 비서</span>
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
              <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-purple-500" />
              </div>
              <h3 className="text-[15px] font-semibold text-slate-700 mb-1">무엇을 도와드릴까요?</h3>
              <p className="text-[12px] text-slate-400 mb-6">영업, 고객, 공급망 데이터를 분석해드립니다</p>
              <div className="w-full space-y-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className="w-full text-left px-4 py-2.5 bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 rounded-xl text-[13px] text-slate-600 hover:text-purple-700 transition-colors"
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
        <div className="border-t border-slate-200 px-4 py-3 bg-white">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="질문을 입력하세요..."
              rows={1}
              className="flex-1 resize-none px-3.5 py-2.5 text-[13px] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-slate-400 max-h-24"
              style={{ minHeight: '40px' }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className="flex-shrink-0 p-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
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
