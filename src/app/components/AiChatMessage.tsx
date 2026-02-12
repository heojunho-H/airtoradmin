import { Bot, User } from 'lucide-react';

interface AiChatMessageProps {
  role: 'user' | 'model';
  text: string;
  isLoading?: boolean;
}

export function AiChatMessage({ role, text, isLoading }: AiChatMessageProps) {
  if (role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div className="flex items-end gap-2 max-w-[85%]">
          <div className="bg-blue-600 text-white px-4 py-2.5 rounded-2xl rounded-br-md text-[13px] leading-relaxed whitespace-pre-wrap">
            {text}
          </div>
          <div className="flex-shrink-0 w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-blue-600" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-3">
      <div className="flex items-end gap-2 max-w-[85%]">
        <div className="flex-shrink-0 w-7 h-7 bg-purple-100 rounded-full flex items-center justify-center">
          <Bot className="w-3.5 h-3.5 text-purple-600" />
        </div>
        <div className="bg-slate-100 text-slate-800 px-4 py-2.5 rounded-2xl rounded-bl-md text-[13px] leading-relaxed">
          {isLoading ? (
            <div className="flex items-center gap-1 py-1">
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <div className="whitespace-pre-wrap">{text}</div>
          )}
        </div>
      </div>
    </div>
  );
}
