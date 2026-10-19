// 고객사 파일 — 고객 상세·영업 딜 상세에서 올리고, 보관하고, 나중에 내려받는다 (본문 R2, 기록 D1 — functions/api/files.ts)
// 같은 고객사: 회사명(정규화)·고객 ID·딜 ID 중 하나라도 맞으면 같은 목록이다. 그래서 문의 단계(딜 상세)에서 올린 파일이
// 수주 뒤 고객 상세에도 보이고, 고객명을 바꿔도 고객 ID 로 계속 보인다. 견적서 도우미로 올린 견적서도 함께 보인다.

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Download, Eye, File as FileIcon, FileArchive, FileImage, FileSpreadsheet, FileText, Paperclip, RotateCw, Trash2, Upload, X } from 'lucide-react';
import { toAiRequestError } from '../../lib/ai/api';
import {
  canView,
  deleteFile,
  downloadUrl,
  fileExtension,
  formatBytes,
  listScopeFiles,
  MAX_UPLOAD_FILES,
  uploadBlockReason,
  uploadCompanyFile,
  viewUrl,
  type FileScope,
  type StoredFile,
} from '../../lib/ai/files';
import { relativeTimeKo } from '../../lib/ai/format';
import { PinPromptModal } from './settings/PinPromptModal';

function currentUser(): string {
  try {
    return localStorage.getItem('user_name') || '';
  } catch {
    return '';
  }
}

interface Props {
  company: string;
  customerId?: number | null;
  dealId?: number | null;
  /** 고객 상세: 이 고객 작업이력과 연결된 딜 — 딜 상세에서 올린 파일도 보이게 */
  dealIds?: number[];
  title?: string;
  /** side = 좁은 칸(고객 상세 오른쪽), panel = 넓은 칸(딜 상세) */
  variant?: 'side' | 'panel';
}

type UploadState = 'queued' | 'uploading' | 'error';
interface UploadItem {
  key: string;
  file: File;
  state: UploadState;
  progress: number;
  error?: string;
}

const CONCURRENCY = 2;

function FileTypeIcon({ name, className }: { name: string; className: string }) {
  const ext = fileExtension(name);
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'svg'].includes(ext)) return <FileImage className={className} />;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet className={className} />;
  if (['zip'].includes(ext)) return <FileArchive className={className} />;
  if (['pdf', 'hwp', 'hwpx', 'doc', 'docx', 'txt', 'ppt', 'pptx'].includes(ext)) return <FileText className={className} />;
  return <FileIcon className={className} />;
}

export function CompanyFiles({ company, customerId = null, dealId = null, dealIds, title = '파일', variant = 'side' }: Props) {
  const me = currentUser();
  const [items, setItems] = useState<StoredFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pinTarget, setPinTarget] = useState<StoredFile | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const dragDepth = useRef(0);

  const dealKey = (dealIds || []).join(',');
  const scope: FileScope = { company, customerId, dealId, dealIds };
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const hasScope = !!(company.trim() || customerId || dealId || dealIds?.length);

  const reload = useCallback(async () => {
    if (!hasScope) {
      setItems([]);
      return;
    }
    try {
      setItems(await listScopeFiles(scopeRef.current));
      setError(null);
    } catch (err) {
      setError(toAiRequestError(err).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, customerId, dealId, dealKey, hasScope]);

  useEffect(() => {
    setItems(null);
    setError(null);
    void reload();
  }, [reload]);

  // 고객·딜을 바꾸거나 닫으면 올리던 것은 멈춘다
  useEffect(() => {
    const map = controllers.current;
    return () => {
      map.forEach((c) => c.abort());
      map.clear();
    };
  }, [company, customerId, dealId]);

  // ─── 올리기 ───────────────────────────────────────────────────────
  const addFiles = (list: FileList | File[]) => {
    const files = Array.from(list);
    if (!files.length) return;
    const room = Math.max(0, MAX_UPLOAD_FILES - uploads.filter((u) => u.state !== 'error').length);
    const accepted = files.slice(0, room);
    setNotice(files.length > accepted.length ? `한 번에 ${MAX_UPLOAD_FILES}개까지 올릴 수 있어 ${files.length - accepted.length}개는 담지 않았습니다.` : null);
    const next: UploadItem[] = accepted.map((file, i) => {
      const blocked = uploadBlockReason(file);
      return { key: `${Date.now()}-${i}-${file.name}`, file, state: blocked ? 'error' : 'queued', progress: 0, error: blocked ?? undefined };
    });
    setUploads((prev) => [...prev, ...next]);
  };

  const patchUpload = (key: string, patch: Partial<UploadItem>) =>
    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  const startUpload = useCallback(
    async (item: UploadItem) => {
      const controller = new AbortController();
      controllers.current.set(item.key, controller);
      patchUpload(item.key, { state: 'uploading', progress: 0, error: undefined });
      try {
        const r = await uploadCompanyFile(item.file, scopeRef.current, me, (loaded, total) => patchUpload(item.key, { progress: total ? loaded / total : 0 }), controller.signal);
        setUploads((prev) => prev.filter((u) => u.key !== item.key));
        if (r.duplicate) setNotice(`'${item.file.name}'은(는) 이미 올라와 있는 파일입니다.`);
        void reload();
      } catch (err) {
        const e = toAiRequestError(err);
        if (e.code === 'aborted') setUploads((prev) => prev.filter((u) => u.key !== item.key));
        else patchUpload(item.key, { state: 'error', error: e.message });
      } finally {
        controllers.current.delete(item.key);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me, reload],
  );

  // 대기 중인 파일을 동시에 2개씩
  useEffect(() => {
    const running = uploads.filter((u) => u.state === 'uploading').length;
    const waiting = uploads.filter((u) => u.state === 'queued');
    waiting.slice(0, Math.max(0, CONCURRENCY - running)).forEach((u) => void startUpload(u));
  }, [uploads, startUpload]);

  const retry = (key: string) => patchUpload(key, { state: 'queued', progress: 0, error: undefined });
  const removeUpload = (key: string) => {
    controllers.current.get(key)?.abort();
    setUploads((prev) => prev.filter((u) => u.key !== key));
  };

  // ─── 끌어다 놓기 ────────────────────────────────────────────────────
  const onDragEnter = (e: DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer.files?.length) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  // ─── 삭제 ───────────────────────────────────────────────────────────
  const remove = async (f: StoredFile) => {
    if (f.uploadedBy !== me) {
      // 다른 사람이 올린 파일은 관리자 PIN 으로
      setPinError(null);
      setPinTarget(f);
      return;
    }
    if (!window.confirm(`'${f.fileName}' 파일을 삭제할까요?`)) return;
    try {
      await deleteFile(f.id, me);
      setItems((list) => (list ? list.filter((x) => x.id !== f.id) : list));
    } catch (err) {
      setError(toAiRequestError(err).message);
    }
  };

  const removeWithPin = async (pin: string) => {
    if (!pinTarget) return;
    setPinBusy(true);
    setPinError(null);
    try {
      await deleteFile(pinTarget.id, me, pin);
      setItems((list) => (list ? list.filter((x) => x.id !== pinTarget.id) : list));
      setPinTarget(null);
    } catch (err) {
      setPinError(toAiRequestError(err).message);
    } finally {
      setPinBusy(false);
    }
  };

  // ─── 그리기 ───────────────────────────────────────────────────────
  const panel = variant === 'panel';
  const text = panel ? 'text-[14px]' : 'text-xs';
  const meta = panel ? 'text-[13px]' : 'text-[11px]';
  const count = items?.length ?? 0;

  return (
    <div
      className={`${panel ? 'bg-slate-50 p-5 rounded-xl' : 'mt-4'} relative`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/90">
          <span className={`${panel ? 'text-[15px]' : 'text-sm'} font-semibold text-blue-700`}>여기에 놓으면 올립니다</span>
        </div>
      )}

      <div className="mb-2 flex items-center gap-2">
        <Paperclip className={`${panel ? 'h-4 w-4' : 'h-4 w-4'} text-slate-500`} />
        <span className={`${panel ? 'text-[15px]' : 'text-sm'} font-semibold text-slate-700`}>
          {title}
          {count > 0 && <span className="ml-1 font-normal text-slate-400">{count}</span>}
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!hasScope}
          className={`ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 ${meta} font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40`}
          title="파일 올리기 (끌어다 놓아도 됩니다)"
        >
          <Upload className="h-3.5 w-3.5" />
          올리기
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {notice && (
        <div className={`mb-2 flex items-start gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 ${meta} text-amber-800`}>
          <span className="min-w-0 flex-1 break-keep">{notice}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 text-amber-500 hover:text-amber-700" aria-label="알림 닫기">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {uploads.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {uploads.map((u) => (
            <li key={u.key} className={`rounded-lg border px-2.5 py-1.5 ${u.state === 'error' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
              <div className={`flex items-center gap-2 ${text}`}>
                <FileTypeIcon name={u.file.name} className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-slate-700">{u.file.name}</span>
                <span className={`shrink-0 ${meta} ${u.state === 'error' ? 'text-red-600' : 'text-slate-400'}`}>
                  {u.state === 'queued' ? '대기' : u.state === 'uploading' ? `${Math.round(u.progress * 100)}%` : '실패'}
                </span>
                {u.state === 'error' && !uploadBlockReason(u.file) && (
                  <button onClick={() => retry(u.key)} className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-white hover:text-blue-700" aria-label={`${u.file.name} 다시 올리기`}>
                    <RotateCw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => removeUpload(u.key)} className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-700" aria-label={`${u.file.name} ${u.state === 'uploading' ? '올리기 취소' : '목록에서 빼기'}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {u.state === 'uploading' && (
                <div className="mt-1 h-1 overflow-hidden rounded bg-slate-100">
                  <div className="h-full bg-blue-500 transition-[width]" style={{ width: `${Math.max(4, Math.round(u.progress * 100))}%` }} />
                </div>
              )}
              {u.state === 'error' && u.error && <p className={`mt-0.5 ${meta} text-red-600`}>{u.error}</p>}
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className={`${meta} text-slate-500`}>파일 목록을 불러오지 못했습니다: {error}</p>
      ) : items === null ? (
        <p className={`${meta} text-slate-400`}>불러오는 중…</p>
      ) : items.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!hasScope}
          className={`w-full rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center ${meta} text-slate-400 hover:border-blue-300 hover:text-blue-600 break-keep`}
        >
          이 고객사 파일을 올려 두면 나중에 여기서 내려받을 수 있습니다.
          <br />
          파일을 끌어다 놓거나 눌러서 고르세요 (파일당 30MB, 한 번에 {MAX_UPLOAD_FILES}개)
        </button>
      ) : (
        <ul className={`space-y-1.5 overflow-y-auto ${panel ? 'max-h-72' : 'max-h-56'}`}>
          {items.map((f) => (
            <li key={f.id} className={`flex items-center gap-2 ${text}`}>
              <FileTypeIcon name={f.fileName} className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <a href={downloadUrl(f.id)} className="block truncate font-medium text-slate-700 hover:text-blue-700 hover:underline" title={`${f.fileName} 내려받기`}>
                  {f.fileName}
                </a>
                <span className={`block truncate ${meta} text-slate-400`}>
                  {[
                    f.kind === 'quote' ? '견적서' : null,
                    f.quoteDate,
                    f.quotedTotal ? `${Math.round(f.quotedTotal / 10_000).toLocaleString('ko-KR')}만원` : null,
                    formatBytes(f.size),
                    `${f.uploadedBy} · ${relativeTimeKo(f.createdAt)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              {canView(f) && (
                <a href={viewUrl(f.id)} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`${f.fileName} 새 탭에서 보기`} title="새 탭에서 보기">
                  <Eye className="h-3.5 w-3.5" />
                </a>
              )}
              <a href={downloadUrl(f.id)} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`${f.fileName} 내려받기`} title="내려받기">
                <Download className="h-3.5 w-3.5" />
              </a>
              <button
                onClick={() => void remove(f)}
                className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                aria-label={`${f.fileName} 삭제`}
                title={f.uploadedBy === me ? '삭제' : '삭제 (다른 사람이 올린 파일 — 관리자 PIN)'}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <PinPromptModal
        open={!!pinTarget}
        title="다른 사람이 올린 파일 삭제"
        description={pinTarget ? `'${pinTarget.fileName}' (${pinTarget.uploadedBy}님이 올림)을 지우려면 관리자 PIN 이 필요합니다.` : undefined}
        submitting={pinBusy}
        error={pinError}
        onSubmit={(pin) => void removeWithPin(pin)}
        onClose={() => setPinTarget(null)}
      />
    </div>
  );
}
