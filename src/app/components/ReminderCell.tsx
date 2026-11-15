// 작업 히스토리 표의 '리마인드 1~4차' 칸 — 지금 칸 모양 그대로(아이콘 + 예정일 + 작은 글씨 한 줄).
// 최근 작업 줄은 서버 상태(GET /api/newsletter?action=remind — 발송기와 같은 규칙)로 '발송완료·예약 완료·예약발송 취소·발송 실패'를 보이고,
// 아직 안 나간 칸을 누르면 예약발송 취소 ↔ 다시 예약. 시계 아이콘은 쓰지 않는다(무슨 뜻인지 헷갈린다는 사용자 지적, 11-15). 1~3차는 리마인드 체크(reminderN), 4차는 D1 remind_cancels — docs/remind-mails.md
// 손으로 보낸·예약한 메일(장부 source 'manual')도 같은 글씨로 보인다. 손 예약은 네이버웍스에 있어 여기서 취소하지 않는다.
import { AlertCircle, CheckCircle, Clock, Send, X, XCircle } from 'lucide-react';
import type { RemindBrief, RemindLedgerItem, RemindLedgerSummary, RemindStage } from '../../lib/newsletter';
import { BADGE, TONE } from './ui-kit';

/** 누르면 하는 일 — flag: 체크만 바꿈(예전 그대로), off: 예약발송 취소, on: 다시 예약, none: 누를 수 없음 */
export type ReminderCellAction = 'flag' | 'off' | 'on' | 'none';

export interface ReminderCellModel {
  icon: 'sent' | 'reserved' | 'cancelled' | 'held' | 'missed' | 'checked' | 'unchecked';
  line: string;
  tone: 'emerald' | 'slate' | 'blue' | 'amber';
  title: string;
  action: ReminderCellAction;
}

const TONE_TEXT = { emerald: 'text-emerald-600', slate: 'text-slate-500', blue: 'text-blue-600', amber: 'text-amber-600' } as const;

// 'YYYY-MM-DD' → 'MM.DD'
const md = (ymd: string | null | undefined) => (ymd && ymd.length >= 10 ? `${ymd.slice(5, 7)}.${ymd.slice(8, 10)}` : '');
// ISO → 'MM.DD HH:mm' (한국 시각)
function stamp(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const k = new Date(t + 9 * 3600 * 1000).toISOString();
  return `${k.slice(5, 7)}.${k.slice(8, 10)} ${k.slice(11, 16)}`;
}

const BLOCK_TITLE: Record<string, string> = {
  unsubscribed: '수신거부 고객이라 보내지 않습니다',
  bounced: '반송된 고객이라 보내지 않습니다',
  'no-email': '담당자 메일 주소가 없어 보내지 못합니다',
  'open-deal': '진행 중인 딜이 있어 멈췄습니다 — 딜이 끝나면 보냅니다',
  'pending-job': '작업일 없는 수주 작업이 있어 멈췄습니다',
};

// 장부 항목 → '보낸 계정 → 받는 주소'
const whoOf = (items: RemindLedgerItem[]) => items.map((s) => `${s.sender || '담당자'} → ${s.recipient}`).join(', ');

// 지난 작업 줄의 장부 요약 → 작은 글씨 한 줄
const SUMMARY_LINE = { sent: '발송완료', reserved: '예약 완료', failed: '발송 실패' } as const;
const SUMMARY_TONE = { sent: 'emerald', reserved: 'blue', failed: 'amber' } as const;
function summaryTitle(l: RemindLedgerSummary): string {
  const when = l.at ? stamp(l.at) : l.date;
  const how = l.manual ? ' (손으로 보냄)' : '';
  return l.kind === 'reserved' ? `예약 완료 ${when} — 네이버웍스에 손으로 예약` : `${SUMMARY_LINE[l.kind]} ${when}${how}`;
}

/**
 * 칸 하나의 모양과 누름.
 * latest: 최근 작업 줄의 서버 상태(없으면 예전 모양) · flag: reminderN(4차는 없음) · ledger: 그 작업·회차의 장부 요약(자동·손메일)
 */
export function reminderCellModel(x: {
  stage: number;
  latest: { st: RemindStage; connected: boolean; blocked: string | null } | null;
  flag: boolean;
  ledger: RemindLedgerSummary | null;
  canWriteD1: boolean;
}): ReminderCellModel {
  const hasFlag = x.stage <= 3;
  if (!x.latest) {
    // 지난 작업 줄 또는 상태를 못 불러온 때 — 예전 모양 그대로(아이콘은 체크, 글씨는 장부)
    const l = x.ledger;
    if (!hasFlag) {
      if (!l) return { icon: 'unchecked', line: '', tone: 'slate', title: '지난 작업 — 자동 발송은 최근 작업만 합니다', action: 'none' };
      return {
        icon: l.kind === 'sent' ? 'sent' : l.kind === 'reserved' ? 'reserved' : 'held',
        line: `${SUMMARY_LINE[l.kind]} ${md(l.date)}`,
        tone: SUMMARY_TONE[l.kind],
        title: summaryTitle(l),
        action: 'none',
      };
    }
    return {
      icon: x.flag ? 'checked' : 'unchecked',
      line: l ? `${SUMMARY_LINE[l.kind]} ${md(l.date)}` : '',
      tone: l ? SUMMARY_TONE[l.kind] : 'emerald',
      title: `${x.flag ? '체크됨' : '체크 안 됨'}${l ? ` · ${summaryTitle(l)}` : ''}`,
      action: 'flag',
    };
  }

  const { st, connected, blocked } = x.latest;
  const d1Note = x.canWriteD1 ? '' : ' (4차 예약발송 취소는 운영 주소에서만 됩니다)';
  switch (st.status) {
    case 'sent': {
      const first = st.sent[0];
      const when = first?.at ? stamp(first.at) : md(first?.date);
      const manual = st.sent.some((s) => s.manual);
      const partial = st.pending.length > 0;
      return {
        icon: 'sent',
        line: `${partial ? '일부 발송완료' : '발송완료'} ${when}`,
        tone: 'emerald',
        title: `발송완료 (${manual ? '손으로 보냄' : '네이버웍스 접수'}) · ${whoOf(st.sent)}${partial ? ` · 아직 안 받은 담당자: ${st.pending.join(', ')}` : ''}`,
        action: 'none',
      };
    }
    case 'reserved': {
      const first = st.reserved[0];
      return {
        icon: 'reserved',
        line: `예약 완료 ${md(first?.date)}`,
        tone: 'blue',
        title: `예약 완료 — 네이버웍스에 손으로 예약, ${first?.at ? stamp(first.at) : first?.date} 발송 · ${whoOf(st.reserved)} · 취소는 네이버웍스 수신확인에서 합니다`,
        action: 'none',
      };
    }
    case 'failed': {
      const f = st.failed.filter((s) => s.manual);
      const last = f[f.length - 1];
      const reason = f.map((s) => s.reason).filter(Boolean).join(', ');
      return {
        icon: 'held',
        line: `발송 실패 ${md(last?.date)}`,
        tone: 'amber',
        title: `발송 실패 (손으로 보냄${reason ? ` · ${reason}` : ''}) · ${whoOf(f)}${x.flag && hasFlag ? ' — 받는 주소를 확인한 뒤 누르면 다시 예약합니다' : ''}`,
        action: x.flag && hasFlag ? 'on' : hasFlag ? 'flag' : 'none',
      };
    }
    case 'cancelled':
      return {
        icon: 'cancelled',
        line: '예약발송 취소',
        tone: 'slate',
        title: `예약발송 취소${st.cancel ? ` (${st.cancel.setBy} · ${stamp(st.cancel.setAt)})` : ''} — 누르면 다시 예약합니다${d1Note}`,
        action: x.canWriteD1 ? 'on' : 'none',
      };
    case 'checked':
      return { icon: 'cancelled', line: '예약발송 취소', tone: 'slate', title: '예약발송 취소 (리마인드 체크 — 손으로 보냈거나 끔) — 누르면 다시 예약합니다', action: 'on' };
    case 'skipped':
      return { icon: 'cancelled', line: '건너뜀', tone: 'slate', title: '장부에 건너뜀 기록이 있어 보내지 않습니다', action: hasFlag ? 'flag' : 'none' };
    case 'expired':
      return { icon: 'missed', line: '미발송', tone: 'slate', title: '예정일 뒤 기한이 지나 보내지 않았습니다', action: hasFlag ? 'flag' : 'none' };
    case 'blocked': {
      const can = hasFlag || x.canWriteD1;
      return { icon: 'held', line: '보류', tone: 'amber', title: `${BLOCK_TITLE[blocked || ''] || '보류 중'} — 누르면 예약발송 취소${hasFlag ? '' : d1Note}`, action: can ? 'off' : 'none' };
    }
    case 'due': {
      const can = hasFlag || x.canWriteD1;
      return connected
        ? { icon: 'reserved', line: '예약 완료', tone: 'blue', title: `예약 완료 — ${md(st.sendDate)} 오전 9시경 발송 · 누르면 예약발송 취소${hasFlag ? '' : d1Note}`, action: can ? 'off' : 'none' }
        : { icon: 'held', line: '연결 대기', tone: 'amber', title: `보내는 담당자의 네이버웍스 계정이 연결되면 발송 · 누르면 예약발송 취소${hasFlag ? '' : d1Note}`, action: can ? 'off' : 'none' };
    }
    default: {
      const can = hasFlag || x.canWriteD1;
      return connected
        ? { icon: 'reserved', line: '예약 완료', tone: 'blue', title: `예약 완료 — ${md(st.sendDate)} 오전 9시경 발송 · 누르면 예약발송 취소${hasFlag ? '' : d1Note}`, action: can ? 'off' : 'none' }
        : { icon: 'held', line: '연결 대기', tone: 'amber', title: `${md(st.sendDate)} 발송 예정이지만 보내는 담당자의 네이버웍스 계정을 먼저 연결해야 합니다 · 누르면 예약발송 취소${hasFlag ? '' : d1Note}`, action: can ? 'off' : 'none' };
    }
  }
}

function CellIcon({ icon }: { icon: ReminderCellModel['icon'] }) {
  switch (icon) {
    case 'sent':
    case 'checked':
      return <CheckCircle className="w-5 h-5 text-emerald-600" />;
    case 'reserved':
      return <CheckCircle className="w-5 h-5 text-blue-600" />;
    case 'cancelled':
      return <XCircle className="w-5 h-5 text-slate-400" />;
    case 'held':
      return <AlertCircle className="w-5 h-5 text-amber-500" />;
    default:
      return <X className="w-5 h-5 text-slate-400" />;
  }
}

/** 칸 — 지금 리마인드 칸과 같은 구조(가운데 정렬 세로 줄: 아이콘 버튼 · 예정일 · 작은 글씨) */
export function ReminderCell({ model, dueLabel, dueTitle, disabled, onClick }: {
  model: ReminderCellModel;
  dueLabel: string;
  dueTitle: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const clickable = model.action !== 'none';
  return (
    <td className="px-3 py-3 text-center">
      <div className="flex flex-col items-center gap-1">
        {clickable ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            disabled={disabled}
            title={model.title}
            className="cursor-pointer hover:opacity-70 transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CellIcon icon={model.icon} />
          </button>
        ) : (
          <span title={model.title}>
            <CellIcon icon={model.icon} />
          </span>
        )}
        <span className="text-xs text-slate-500" title={dueTitle}>
          {dueLabel}
        </span>
        {model.line && <span className={`text-[10px] ${TONE_TEXT[model.tone]}`}>{model.line}</span>}
      </div>
    </td>
  );
}

// ── 고객 목록 '리마인드 상태' 열 — 배지 한 줄 (사용자 선택 '최근 발송만 한 줄', 11-15) ──
// 가장 최근에 나간 메일 → 없으면 다음 예약 → 보류 → 예약발송 취소 → 미발송. 값은 서버 remind-list(발송기와 같은 규칙)

export interface RemindListBadgeModel {
  text: string;
  tone: 'emerald' | 'blue' | 'amber' | 'slate';
  icon: 'sent' | 'reserved' | 'held' | 'cancelled' | 'none';
  title: string;
}

const NEXT_TITLE = {
  reserved: '네이버웍스에 손으로 예약한 메일',
  due: '다음 자동 실행(평일 오전 9시경)에 발송',
  scheduled: '예정일 오전 9시경 자동 발송',
} as const;

export function remindListBadgeModel(b: RemindBrief): RemindListBadgeModel {
  if (b.last) {
    const when = b.last.at ? stamp(b.last.at) : b.last.date;
    return b.last.kind === 'sent'
      ? { text: `${b.last.stage}차 발송완료 ${md(b.last.date)}`, tone: 'emerald', icon: 'sent', title: `리마인드${b.last.stage}차 발송완료 ${when} · ${b.last.manual ? '손으로 보냄' : '자동 발송'}` }
      : { text: `${b.last.stage}차 발송 실패 ${md(b.last.date)}`, tone: 'amber', icon: 'held', title: `리마인드${b.last.stage}차 손으로 보낸 메일이 실패했습니다(${when}) — 고객 상세의 리마인드 칸에서 다시 예약할 수 있습니다` };
  }
  if (b.next) {
    // 손 예약은 네이버웍스에 있어 담당자 계정 연결과 상관없다
    return b.waiting && b.next.kind !== 'reserved'
      ? { text: `${b.next.stage}차 연결 대기`, tone: 'amber', icon: 'held', title: `리마인드${b.next.stage}차 ${b.next.date} — 보낼 담당자의 네이버웍스 계정을 연결하면 발송됩니다` }
      : { text: `${b.next.stage}차 예약 완료 ${md(b.next.date)}`, tone: 'blue', icon: 'reserved', title: `리마인드${b.next.stage}차 ${b.next.date} — ${NEXT_TITLE[b.next.kind]}` };
  }
  if (b.blocked && b.blocked !== 'no-work-entry') return { text: '보류', tone: 'amber', icon: 'held', title: BLOCK_TITLE[b.blocked] || '보류 중' };
  if (b.off) return { text: '예약발송 취소', tone: 'slate', icon: 'cancelled', title: '남은 회차를 꺼 두었습니다 — 고객 상세의 리마인드 칸에서 다시 예약할 수 있습니다' };
  return { text: '미발송', tone: 'slate', icon: 'none', title: b.blocked === 'no-work-entry' ? '작업 이력이 없어 리마인드 대상이 아닙니다' : '보낸 리마인드 메일과 예약된 회차가 없습니다' };
}

const LIST_ICON = { sent: CheckCircle, reserved: Send, held: AlertCircle, cancelled: XCircle, none: Clock } as const;

/** 목록 칸의 배지 — 지금 배지 모양(BADGE·TONE·아이콘 12px) 그대로. 못 불러왔으면 '-' */
export function RemindListBadge({ brief, loaded }: { brief: RemindBrief | undefined; loaded: boolean }) {
  if (!brief) {
    return (
      <span className={`${BADGE} ${TONE.slate}`} title={loaded ? '리마인드 상태를 불러오지 못했습니다' : '리마인드 상태를 불러오는 중입니다'}>
        -
      </span>
    );
  }
  const m = remindListBadgeModel(brief);
  const Icon = LIST_ICON[m.icon];
  return (
    <span className={`${BADGE} ${TONE[m.tone]}`} title={m.title}>
      <Icon className="w-3 h-3" />
      {m.text}
    </span>
  );
}
