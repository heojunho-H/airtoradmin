// 작업 히스토리 표의 '리마인드 1~4차' 칸 — 지금 칸 모양 그대로(아이콘 + 예정일 + 작은 글씨 한 줄).
// 최근 작업 줄은 서버 상태(GET /api/newsletter?action=remind — 발송기와 같은 규칙)로 '발송완료·예약 완료·예약발송 취소'를 보이고,
// 아직 안 나간 칸을 누르면 예약발송 취소 ↔ 다시 예약. 시계 아이콘은 쓰지 않는다(무슨 뜻인지 헷갈린다는 사용자 지적, 11-15). 1~3차는 리마인드 체크(reminderN), 4차는 D1 remind_cancels — docs/remind-mails.md
import { AlertCircle, CheckCircle, X, XCircle } from 'lucide-react';
import type { RemindStage } from '../../lib/newsletter';

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

/**
 * 칸 하나의 모양과 누름.
 * latest: 최근 작업 줄의 서버 상태(없으면 예전 모양) · flag: reminderN(4차는 없음) · autoSentDate: 예전 모양의 '자동발송 날짜'
 */
export function reminderCellModel(x: {
  stage: number;
  latest: { st: RemindStage; connected: boolean; blocked: string | null } | null;
  flag: boolean;
  autoSentDate: string | null;
  canWriteD1: boolean;
}): ReminderCellModel {
  const hasFlag = x.stage <= 3;
  if (!x.latest) {
    // 지난 작업 줄 또는 상태를 못 불러온 때 — 예전 모양 그대로
    if (!hasFlag) {
      return x.autoSentDate
        ? { icon: 'sent', line: `발송완료 ${md(x.autoSentDate)}`, tone: 'emerald', title: `발송완료 ${x.autoSentDate}`, action: 'none' }
        : { icon: 'unchecked', line: '', tone: 'slate', title: '지난 작업 — 자동 발송은 최근 작업만 합니다', action: 'none' };
    }
    return {
      icon: x.flag ? 'checked' : 'unchecked',
      line: x.autoSentDate ? `발송완료 ${md(x.autoSentDate)}` : '',
      tone: 'emerald',
      title: x.flag ? '체크됨' : '체크 안 됨',
      action: 'flag',
    };
  }

  const { st, connected, blocked } = x.latest;
  const d1Note = x.canWriteD1 ? '' : ' (4차 예약발송 취소는 운영 주소에서만 됩니다)';
  switch (st.status) {
    case 'sent': {
      const first = st.sent[0];
      const when = first?.at ? stamp(first.at) : md(first?.date);
      const who = st.sent.map((s) => `${s.sender || '담당자'} → ${s.recipient}`).join(', ');
      const partial = st.pending.length > 0;
      return {
        icon: 'sent',
        line: `${partial ? '일부 발송완료' : '발송완료'} ${when}`,
        tone: 'emerald',
        title: `발송완료 (네이버웍스 접수) · ${who}${partial ? ` · 아직 안 받은 담당자: ${st.pending.join(', ')}` : ''}`,
        action: 'none',
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
