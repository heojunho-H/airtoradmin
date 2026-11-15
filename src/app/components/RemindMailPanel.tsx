// 고객 상세 '리마인드 메일' — 작업 후 4통(① A2 45일 · ② B1 200일 · ③ B2 335일 · ④ B3 395일)이
// 언제 누구에게 나가는지(예약), 실제로 나갔는지(보냄), 보내지 않기(취소)·되돌리기를 한 곳에서 본다.
// 상태는 서버가 발송기와 같은 규칙(functions/_lib/followups.ts remindTimeline)으로 계산한다 — docs/remind-mails.md '고객 상세에서 관리'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MailCheck, RefreshCw, Eye, Ban, Undo2, Copy, X, AlertTriangle } from 'lucide-react';
import { btn, BADGE, TONE, TABLE, MODAL_CLOSE, type Tone } from './ui-kit';
import {
  FOLLOWUP_SKIP_LABEL,
  canWriteRemind,
  cancelRemind,
  fetchRemindPreview,
  fetchRemindStatus,
  restoreRemind,
  type RemindPreview,
  type RemindStage,
  type RemindStatus,
} from '../../lib/newsletter';

const MAIL_NAME: Record<RemindStage['mail'], string> = { a2: 'A2 A/S 안내', b1: 'B1 단가 보장', b2: 'B2 위생관리 1년', b3: 'B3 기록 보관' };
const STAGE_MARK = ['', '①', '②', '③', '④', '⑤'];
const CONNECT_URL = 'https://airtoradmin.co.kr/api/works/connect';
const WEEK = '일월화수목금토';

// 'YYYY-MM-DD' → 'YY.MM.DD(요일)'
function day(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '-';
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return `${ymd.slice(2, 4)}.${ymd.slice(5, 7)}.${ymd.slice(8, 10)}(${WEEK[dow]})`;
}

// ISO 시각 → 'MM.DD HH:mm' (한국 시각)
function stamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const k = new Date(t + 9 * 3600 * 1000).toISOString();
  return `${k.slice(5, 7)}.${k.slice(8, 10)} ${k.slice(11, 16)}`;
}

function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
}

const BLOCK_TEXT: Record<string, string> = {
  unsubscribed: '수신거부한 고객이라 리마인드를 보내지 않습니다.',
  bounced: '메일이 반송된 고객이라 리마인드를 보내지 않습니다.',
  'no-email': '담당자 메일 주소가 없어 보내지 못합니다. 기본 정보에서 담당자 메일을 넣어 주세요.',
  'no-work-entry': '작업일이 있는 작업 기록이 없어 보낼 날을 정할 수 없습니다.',
  'future-work-date': '다음 작업이 잡혀 있어(작업일이 앞날) 그 작업을 기준으로 보냅니다.',
  'open-deal': '진행 중인 딜이 있어 리마인드를 잠시 멈췄습니다. 딜이 끝나면 다시 보냅니다.',
  'pending-job': '작업일이 아직 없는 수주 작업이 있어 리마인드를 멈췄습니다. 작업일이 정해지면 새 작업 기준으로 보냅니다.',
};

function badgeOf(s: RemindStage, connected: boolean): { text: string; tone: Tone } {
  switch (s.status) {
    case 'sent':
      return { text: s.pending.length > 0 ? '일부 보냄' : '보냄', tone: 'emerald' };
    case 'cancelled':
      return { text: '취소됨', tone: 'slate' };
    case 'checked':
      return { text: '체크됨', tone: 'slate' };
    case 'skipped':
      return { text: '건너뜀', tone: 'slate' };
    case 'expired':
      return { text: '기한 지남', tone: 'slate' };
    case 'blocked':
      return { text: '보류', tone: 'amber' };
    case 'due':
      return connected ? { text: '곧 보냄', tone: 'blue' } : { text: '연결 대기', tone: 'amber' };
    default:
      return { text: '예약됨', tone: 'blue' };
  }
}

interface Props {
  customerId: number;
  /** 바뀌면 다시 불러온다 — 최근 작업 키·리마인드 칸·담당자 메일·수신 상태·담당 매니저·메일 기록 수 */
  refreshKey: string;
  userName: string;
  /** 고객 정보 편집 중 — 다시 불러오지 않고 버튼을 막는다 */
  editing?: boolean;
}

export function RemindMailPanel({ customerId, refreshKey, userName, editing = false }: Props) {
  const [data, setData] = useState<RemindStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ stage: number; data: RemindPreview | null; error: string } | null>(null);
  const [large, setLarge] = useState(false);
  const seq = useRef(0);
  const canWrite = canWriteRemind();
  const savedCustomer = Number.isInteger(customerId) && customerId > 0 && customerId < 1_000_000_000;

  const load = useCallback(async () => {
    if (!savedCustomer) return;
    const my = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const res = await fetchRemindStatus(customerId);
      if (my !== seq.current) return; // 그사이 다른 요청(고객 바뀜·저장)이 나갔으면 버린다
      if (!res.ok) {
        setData(null);
        setError(res.error || (res.disabled ? '리마인드 자동 발송 설정이 꺼져 있습니다.' : '상태를 불러오지 못했습니다.'));
      } else {
        setData(res);
      }
    } catch (err) {
      if (my !== seq.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [customerId, savedCustomer]);

  useEffect(() => {
    if (editing) return;
    void load();
  }, [load, refreshKey, editing]);

  const act = async (kind: 'cancel' | 'restore', jobKey: string, stage: number, confirmText: string) => {
    if (!data || busy) return;
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    const my = ++seq.current;
    try {
      const fn = kind === 'cancel' ? cancelRemind : restoreRemind;
      const res = await fn({ customerId, jobKey, stage, userName });
      if (my === seq.current && res.ok) setData(res);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
      void load();
    } finally {
      setBusy(false);
    }
  };

  const openPreview = async (stage: number) => {
    setPreview({ stage, data: null, error: '' });
    try {
      const res = await fetchRemindPreview(customerId, stage);
      setPreview((p) => (p && p.stage === stage ? { stage, data: res.ok ? res : null, error: res.ok ? '' : res.error || '미리보기를 만들지 못했습니다.' } : p));
    } catch (err) {
      setPreview((p) => (p && p.stage === stage ? { stage, data: null, error: err instanceof Error ? err.message : String(err) } : p));
    }
  };

  const copyConnect = async () => {
    try {
      await navigator.clipboard.writeText(CONNECT_URL);
      window.alert(`연결 주소를 복사했습니다. 담당자에게 보내 주세요.\n${CONNECT_URL}`);
    } catch {
      window.prompt('연결 주소를 복사해 담당자에게 보내 주세요.', CONNECT_URL);
    }
  };

  if (!savedCustomer) return null;

  const connected = Boolean(data?.sender?.connected);
  const job = data?.job ?? null;
  const lastRunStale = (() => {
    if (!data) return false;
    if (!data.lastRun) return true;
    // 평일 이틀 넘게 실행이 없으면 멈췄을 수 있다
    let weekdays = 0;
    let d = data.lastRun.runAt.slice(0, 10);
    while (d < data.today && weekdays < 3) {
      d = addDaysYmd(d, 1);
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (dow !== 0 && dow !== 6) weekdays++;
    }
    return weekdays > 2;
  })();

  const detailOf = (s: RemindStage): ReactNode => {
    switch (s.status) {
      case 'sent':
        return (
          <div className="space-y-0.5">
            {s.sent.map((x, i) => (
              <p key={`s${i}`}>
                {x.at ? stamp(x.at) : day(x.date)} · {x.sender || '담당자'} → {x.recipient}
              </p>
            ))}
            {s.failed.map((x, i) => (
              <p key={`f${i}`} className="text-red-600">
                실패 {day(x.date)} · {x.recipient} {x.reason ? `(${x.reason.slice(0, 60)})` : ''}
              </p>
            ))}
            {s.pending.length > 0 && (
              <p className="text-amber-700">
                아직 안 받은 담당자: {s.pending.join(', ')}
                {s.verdict === 'due' ? ' — 다음 실행 때 보냅니다' : ''}
              </p>
            )}
            <p className="text-slate-500">네이버웍스가 접수한 기록입니다. 받은 쪽에서 열었는지는 보낸 사람 네이버웍스 '수신확인'에서 봅니다.</p>
          </div>
        );
      case 'cancelled':
        return s.cancel ? `${s.cancel.setBy} · ${stamp(s.cancel.setAt)} ${s.cancel.scope === 'all' ? '모두 끄기' : '보내지 않기'}` : '보내지 않기';
      case 'checked':
        return '작업 히스토리의 리마인드 칸이 체크돼 있습니다(손으로 보냈거나 예약해 둠). 자동으로 보내지 않습니다.';
      case 'skipped':
        return s.skipped.some((x) => x.reason === 'superseded') ? '다음 회차와 같은 날이 되어 높은 회차만 보냈습니다.' : '건너뜀 기록이 있어 보내지 않습니다.';
      case 'expired':
        return `예정일 뒤 ${data?.grace ?? 30}일(${day(addDaysYmd(s.dueDate, data?.grace ?? 30))})이 지나 보내지 않습니다.`;
      case 'blocked':
        return FOLLOWUP_SKIP_LABEL[data?.blocked || ''] ? `${FOLLOWUP_SKIP_LABEL[data?.blocked || '']} — 위 안내를 보세요.` : '보류 중';
      case 'due':
        return connected
          ? `다음 자동 실행 ${day(s.sendDate)} 오전 9시경에 보냅니다. 늦어도 ${day(addDaysYmd(s.dueDate, data?.grace ?? 30))}까지입니다.`
          : `보내는 사람의 네이버웍스 계정이 연결되면 보냅니다. ${day(addDaysYmd(s.dueDate, data?.grace ?? 30))}이 지나면 이 회차는 건너뜁니다.`;
      default:
        return `${day(s.sendDate)} 오전 9시경 자동 발송${connected ? '' : ' — 그 전에 보내는 사람 계정을 연결해야 합니다'}`;
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <MailCheck className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-semibold text-slate-900">리마인드 메일</h3>
        <span className="text-xs text-slate-500">작업 후 45·200·335·395일 · 평일 오전 9시경 담당자 네이버웍스 계정으로 자동 발송</span>
        <button type="button" onClick={() => void load()} disabled={loading || editing} className={`${btn('ghost', 'sm')} ml-auto`}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 새로고침
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {!data && loading && <p className="text-sm text-slate-500">불러오는 중…</p>}

      {data && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 text-sm md:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-slate-500">기준 작업</p>
              <p className="text-slate-900">{job ? `${day(job.workDate)} · ${job.projectName || '작업명 없음'}` : '-'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">보내는 사람</p>
              {data.sender ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-slate-900">
                    {data.sender.name} {data.sender.position}
                    {data.sender.team ? `(${data.sender.team})` : ''}
                  </span>
                  <span className={`${BADGE} ${data.sender.connected ? TONE.emerald : TONE.amber}`}>
                    {data.sender.connected ? '연결됨' : data.sender.needsReconnect ? '다시 연결 필요' : '연결 전'}
                  </span>
                  {data.sender.fallback && <span className="text-xs text-slate-500">담당 매니저가 없어 대신 보냄</span>}
                  {!data.sender.connected && (
                    <button type="button" onClick={() => void copyConnect()} className={btn('ghost', 'sm')}>
                      <Copy className="w-4 h-4" /> 연결 링크 복사
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-amber-700">보낼 사람이 없습니다</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">받는 사람</p>
              {data.recipients.length > 0 ? (
                data.recipients.map((r) => (
                  <p key={r.email} className="text-slate-900 break-all">
                    {[r.name, r.position].filter(Boolean).join(' ') || '담당자'} · {r.email}
                  </p>
                ))
              ) : (
                <p className="text-amber-700">메일 주소 없음</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">마지막 자동 실행</p>
              <p className="text-slate-900">
                {data.lastRun ? `${stamp(data.lastRun.runAt)} · 보냄 ${data.lastRun.sent}${data.lastRun.failed ? ` · 실패 ${data.lastRun.failed}` : ''}` : '기록 없음'}
              </p>
              {lastRunStale && <p className="text-xs text-amber-700">평일 이틀 넘게 실행 기록이 없습니다. 자동 실행이 멈췄을 수 있습니다.</p>}
            </div>
          </div>

          {(data.blocked && BLOCK_TEXT[data.blocked]) || data.cancelAll || data.warnings.length > 0 || data.orphanCancels.length > 0 ? (
            <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {data.blocked && BLOCK_TEXT[data.blocked] && (
                <p className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" />
                  {BLOCK_TEXT[data.blocked]}
                </p>
              )}
              {data.cancelAll && <p>이 고객 리마인드를 모두 껐습니다 — {data.cancelAll.setBy} · {stamp(data.cancelAll.setAt)}</p>}
              {data.orphanCancels.map((c, i) => (
                <p key={i}>
                  예전 작업({day(c.workDate)} {c.projectName})에 걸어 둔 '보내지 않기'는 작업일·작업명이 바뀌어 지금 작업에 적용되지 않습니다. 필요하면 다시 거세요.
                </p>
              ))}
              {data.warnings.map((w, i) => (
                <p key={`w${i}`}>{w}</p>
              ))}
            </div>
          ) : null}

          {data.stages.length > 0 && (
            <div className={`${TABLE.wrap} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-nowrap-cells>
                  <thead className={TABLE.thead}>
                    <tr>
                      <th className={`${TABLE.th} px-3 py-3 text-left`}>메일</th>
                      <th className={`${TABLE.th} px-3 py-3 text-left`}>예정일</th>
                      <th className={`${TABLE.th} px-3 py-3 text-left`}>상태</th>
                      <th className={`${TABLE.th} px-3 py-3 text-left`}>자세히</th>
                      <th className={`${TABLE.th} px-3 py-3 text-right`}>동작</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.stages.map((s) => {
                      const b = badgeOf(s, connected);
                      const cancellable = canWrite && !editing && job && (s.status === 'due' || s.status === 'scheduled' || s.status === 'blocked');
                      const restorable = canWrite && !editing && job && s.status === 'cancelled' && s.cancel?.scope === 'stage';
                      return (
                        <tr key={s.stage} className="align-top">
                          <td className="px-3 py-3 text-slate-900">
                            {STAGE_MARK[s.stage] || s.stage} {MAIL_NAME[s.mail] || s.label}
                            <p className="text-xs text-slate-500">작업 후 {s.days}일</p>
                          </td>
                          <td className="px-3 py-3 text-slate-700">{day(s.dueDate)}</td>
                          <td className="px-3 py-3">
                            <span className={`${BADGE} ${TONE[b.tone]}`}>{b.text}</span>
                          </td>
                          <td className="px-3 py-3 text-slate-700" data-wrap>
                            {detailOf(s)}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-1.5">
                              {data.sender && (
                                <button type="button" onClick={() => void openPreview(s.stage)} className={btn('secondary', 'sm')}>
                                  <Eye className="w-4 h-4" /> 메일 보기
                                </button>
                              )}
                              {cancellable && job && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void act('cancel', job.jobKey, s.stage, `${STAGE_MARK[s.stage]} ${MAIL_NAME[s.mail]} 메일을 보내지 않습니다.\n나중에 [되돌리기]로 다시 켤 수 있습니다. 계속할까요?`)}
                                  className={btn('secondary', 'sm')}
                                >
                                  <Ban className="w-4 h-4" /> 보내지 않기
                                </button>
                              )}
                              {restorable && job && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void act('restore', job.jobKey, s.stage, `${STAGE_MARK[s.stage]} ${MAIL_NAME[s.mail]} 메일을 다시 보냅니다(예정일·기한 안이면 자동 발송). 계속할까요?`)}
                                  className={btn('secondary', 'sm')}
                                >
                                  <Undo2 className="w-4 h-4" /> 되돌리기
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {canWrite && !editing ? (
              data.cancelAll ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act('restore', '*', 0, '이 고객 리마인드를 다시 켭니다. 예정일·기한 안의 회차는 자동으로 나갑니다. 계속할까요?')}
                  className={btn('secondary', 'sm')}
                >
                  <Undo2 className="w-4 h-4" /> 이 고객 리마인드 다시 켜기
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act('cancel', '*', 0, '이 고객에게 앞으로 리마인드 메일을 보내지 않습니다(새 작업이 생겨도 꺼진 채로 둡니다). 계속할까요?')}
                  className={btn('ghost', 'sm')}
                >
                  <Ban className="w-4 h-4" /> 이 고객 리마인드 모두 끄기
                </button>
              )
            ) : (
              <span>{editing ? '편집 중에는 바꿀 수 없습니다.' : '보내지 않기·되돌리기는 운영 주소(airtoradmin.co.kr)에서만 됩니다.'}</span>
            )}
            <span>작업 히스토리의 리마인드 칸 체크는 '손으로 보냄' 표시이고, 보내지 않기는 누가·언제 껐는지 남으며 되돌릴 수 있습니다.</span>
          </div>
        </div>
      )}

      {preview &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setPreview(null)}>
            <div className="flex max-h-[92vh] w-full max-w-[820px] flex-col rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-slate-900">{preview.data ? preview.data.subject : '메일 미리보기'}</p>
                  {preview.data && (
                    <p className="text-slate-600 break-all">
                      보내는 사람 {preview.data.sender} · 받는 사람 {preview.data.to.map((t) => t.email).join(', ') || '-'} · {day(preview.data.day)} 기준
                    </p>
                  )}
                  {preview.data?.note && <p className="text-amber-700">{preview.data.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button type="button" onClick={() => setLarge((v) => !v)} className={btn('secondary', 'sm')}>
                    {large ? '보통' : '크게'}
                  </button>
                  <button type="button" onClick={() => setPreview(null)} className={MODAL_CLOSE} aria-label="닫기">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden p-2">
                {preview.error && <p className="p-4 text-sm text-red-700">{preview.error}</p>}
                {!preview.data && !preview.error && <p className="p-4 text-sm text-slate-500">만드는 중…</p>}
                {preview.data && (
                  <iframe
                    title="리마인드 메일 미리보기"
                    sandbox=""
                    className="h-[72vh] w-full rounded-lg border border-slate-200 bg-white"
                    srcDoc={`${large ? '<style>html{zoom:1.3}</style>' : ''}${preview.data.html}`}
                  />
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
