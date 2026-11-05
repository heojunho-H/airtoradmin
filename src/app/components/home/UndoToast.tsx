// 할 일 완료 직후 5초 동안 '되돌리기'를 띄우는 토스트 (홈·할 일 페이지 공용)
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UndoToastState {
  message: string;
  undoKey?: string;
}

const TOAST_MS = 5000;

export function useUndoToast() {
  const [toast, setToast] = useState<UndoToastState | null>(null);
  const timer = useRef<number | null>(null);
  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);
  const show = useCallback((next: UndoToastState) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setToast(next);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setToast(null);
    }, TOAST_MS);
  }, []);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);
  return { toast, show, clear };
}

export function UndoToast({ toast, onUndo }: { toast: UndoToastState | null; onUndo: (key: string) => void }) {
  if (!toast) return null;
  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-10 z-50 flex items-center gap-[18px] whitespace-nowrap rounded-[14px] bg-[#1F2228] py-[14px] pl-[22px] pr-[18px] text-[17px] text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
    >
      <span>{toast.message}</span>
      {toast.undoKey && (
        <button
          type="button"
          onClick={() => onUndo(toast.undoKey!)}
          className="rounded-md px-1.5 py-1 font-bold text-[#8DB4FF] hover:text-white"
        >
          되돌리기
        </button>
      )}
    </div>
  );
}
