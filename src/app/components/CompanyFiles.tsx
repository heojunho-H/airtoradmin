// 고객 상세 — 견적서 입력 도우미(AI 페이지)로 올린 파일 목록·내려받기.
// 회사명 정규화 키로 찾으므로 수주 전에 올린 견적서도 고객이 생기면 보인다 (functions/api/files.ts ?action=list).

import { useEffect, useState } from 'react';
import { Download, Paperclip, Trash2 } from 'lucide-react';
import { toAiRequestError } from '../../lib/ai/api';
import { deleteFile, downloadUrl, listCompanyFiles, type StoredFile } from '../../lib/ai/files';
import { relativeTimeKo } from '../../lib/ai/format';

function currentUser(): string {
  try {
    return localStorage.getItem('user_name') || '';
  } catch {
    return '';
  }
}

export function CustomerFiles({ company }: { company: string }) {
  const [items, setItems] = useState<StoredFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const me = currentUser();

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    if (!company.trim()) {
      setItems([]);
      return;
    }
    listCompanyFiles(company)
      .then((list) => !cancelled && setItems(list))
      .catch((err) => !cancelled && setError(toAiRequestError(err).message));
    return () => {
      cancelled = true;
    };
  }, [company]);

  const remove = async (f: StoredFile) => {
    if (!window.confirm(`'${f.fileName}' 파일을 삭제할까요?`)) return;
    try {
      await deleteFile(f.id, me);
      setItems((list) => (list ? list.filter((x) => x.id !== f.id) : list));
    } catch (err) {
      setError(toAiRequestError(err).message);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <Paperclip className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-semibold text-slate-700">견적서·파일</span>
      </div>
      {error ? (
        <p className="text-xs text-slate-500">파일 목록을 불러오지 못했습니다: {error}</p>
      ) : items === null ? (
        <p className="text-xs text-slate-400">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-slate-400 break-keep">AI 어시스턴트 › 견적서 입력 도우미로 올린 견적서가 여기에 보관됩니다.</p>
      ) : (
        <ul className="space-y-1.5 max-h-48 overflow-y-auto">
          {items.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-xs">
              <div className="min-w-0 flex-1">
                <a href={downloadUrl(f.id)} className="block truncate font-medium text-slate-700 hover:text-blue-700 hover:underline" title={`${f.fileName} 내려받기`}>
                  {f.fileName}
                </a>
                <span className="block truncate text-slate-400">
                  {[f.quoteDate, f.quotedTotal ? `${Math.round(f.quotedTotal / 10_000).toLocaleString('ko-KR')}만원` : null, `${f.uploadedBy} · ${relativeTimeKo(f.createdAt)}`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <a href={downloadUrl(f.id)} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`${f.fileName} 내려받기`}>
                <Download className="w-3.5 h-3.5" />
              </a>
              {f.uploadedBy === me && (
                <button onClick={() => remove(f)} className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500" aria-label={`${f.fileName} 삭제`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
