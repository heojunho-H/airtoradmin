import { useEffect, useRef, useState } from 'react';
import { KeyRound, X } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  description?: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (pin: string) => void;
  onClose: () => void;
}

/** 관리자 PIN 입력 — 값은 이 컴포넌트 메모리에만 두고 저장하지 않는다. */
export function PinPromptModal({ open, title, description, submitting, error, onSubmit, onClose }: Props) {
  const [pin, setPin] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPin('');
      setTimeout(() => ref.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !submitting && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => !submitting && onClose()}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pin-title">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100">
              <KeyRound className="h-4 w-4 text-purple-600" />
            </span>
            <h2 id="pin-title" className="text-[17px] font-semibold text-slate-900">
              {title}
            </h2>
          </div>
          <button onClick={onClose} disabled={submitting} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>
        {description && <p className="mt-3 text-[14px] text-slate-500">{description}</p>}
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (pin && !submitting) onSubmit(pin);
          }}
        >
          <label htmlFor="admin-pin" className="sr-only">
            관리자 PIN
          </label>
          <input
            id="admin-pin"
            ref={ref}
            type="password"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="관리자 PIN"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {error && <p className="text-[13px] text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={submitting} className="rounded-xl px-4 py-2 text-[15px] font-medium text-slate-600 hover:bg-slate-100">
              취소
            </button>
            <button type="submit" disabled={!pin || submitting} className="rounded-xl bg-purple-600 px-5 py-2 text-[15px] font-semibold text-white hover:bg-purple-700 disabled:bg-slate-300">
              {submitting ? '저장 중…' : '확인'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
