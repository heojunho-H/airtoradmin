// 설정 > 구글 광고 계약 업로드 — 리드용 향상된 전환(functions/api/ads_conversions.ts).
// 홈페이지 문의 고객이 계약 성공이 되면, 계약 시각·공급가액을 해시한 이메일·전화와 함께 구글 광고로 보낸다.
// 요청사항에 [광고측정제외] 가 있는 딜은 뺀다(거부 요청). 구글 데이터 관리 도구(HTTPS)가 매일 가져가고,
// 여기서는 같은 파일을 받아 '파일 업로드'로 직접 올릴 수 있다(수동 백업). 확인은 관리자 PIN.

import { useState } from 'react';
import { Download, FileSpreadsheet, ListChecks } from 'lucide-react';
import { AiRequestError, postJson, toAiRequestError } from '../../../lib/ai/api';
import { btn, CARD } from '../ui-kit';
import { PinPromptModal } from './PinPromptModal';

const ENDPOINT = '/api/ads_conversions';

interface Summary {
  days: number;
  won: number;
  wonRecorded: number;
  wonInWindow: number;
  excluded: number;
  withContact: number;
  rows: number;
}

type Action = 'summary' | 'csv';

async function downloadCsv(pin: string, userName: string): Promise<number> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/csv' },
      body: JSON.stringify({ pin, userName, format: 'csv' }),
    });
  } catch (err) {
    throw toAiRequestError(err);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    try {
      const body = JSON.parse(text) as { code?: string; message?: string };
      if (body && typeof body.message === 'string') throw new AiRequestError(body.code || 'error', body.message, { status: res.status });
    } catch (e) {
      if (e instanceof AiRequestError) throw e;
    }
    throw new AiRequestError('http_error', `파일을 만들지 못했습니다 (${res.status})`, { status: res.status });
  }
  const csv = await res.text();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'airtor-ads-contracts.csv';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return Math.max(0, csv.trim().split(/\r?\n/).length - 1);
}

export function AdsUploadCard({ userName, onNotification }: { userName: string; onNotification?: (msg: string) => void }) {
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const open = (a: Action) => {
    setPinError(null);
    setError(null);
    setAction(a);
  };

  const run = async (pin: string) => {
    if (!action) return;
    setBusy(true);
    setPinError(null);
    try {
      if (action === 'summary') {
        const res = await postJson<{ ok: true; summary: Summary }>({ pin, userName, format: 'summary' }, { endpoint: ENDPOINT });
        setSummary(res.summary);
      } else {
        const rows = await downloadCsv(pin, userName);
        onNotification?.(`구글 광고 업로드 파일을 받았습니다 (${rows}건)`);
      }
      setAction(null);
    } catch (err) {
      const e = toAiRequestError(err);
      if (e.code === 'bad_pin' || e.code === 'pin_locked') setPinError(e.message);
      else {
        setAction(null);
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${CARD} p-5 md:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-slate-900">구글 광고 계약 업로드</h2>
          <p className="mt-0.5 max-w-2xl text-[14px] text-slate-500">
            홈페이지 문의 고객이 계약 성공이 되면, 계약 시각과 공급가액을 구글 광고로 보냅니다. 이메일·전화는 해시로만 나갑니다.
            고객이 거부를 요청하면 딜 요청사항에 [광고측정제외]를 붙여 주세요. 그 딜은 빠집니다.
            구글 데이터 관리 도구가 매일 가져가며, 여기서 같은 파일을 받아 직접 올릴 수도 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => open('summary')} disabled={busy} className={btn('secondary', 'sm')}>
            <ListChecks className="h-4 w-4" /> 현황 보기
          </button>
          <button onClick={() => open('csv')} disabled={busy} className={btn('primary', 'sm')}>
            <Download className="h-4 w-4" /> 업로드 파일 받기
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-[14px] text-red-600">{error}</p>}

      {summary && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="계약 성공 딜" value={summary.won} />
          <Stat label="계약 시각 기록" value={summary.wonRecorded} help="2026-11-12 배포 뒤 계약부터" />
          <Stat label={`최근 ${summary.days}일 계약`} value={summary.wonInWindow} />
          <Stat label="그중 제외 요청" value={summary.excluded} help="[광고측정제외]" />
          <Stat label="업로드 행" value={summary.rows} help="이메일·전화가 있는 건" strong />
        </ul>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-[13px] text-slate-400">
        <FileSpreadsheet className="h-3.5 w-3.5" /> 직접 올릴 때: 구글 광고 &gt; 도구 &gt; 데이터 관리 도구 &gt; 파일 업로드 &gt; 전환 '계약 성공(CRM)'
      </p>

      <PinPromptModal
        open={action !== null}
        title="관리자 확인"
        description={action === 'csv' ? '업로드 파일(해시된 연락처 포함)을 받으려면 관리자 PIN을 입력하세요.' : '현황을 보려면 관리자 PIN을 입력하세요.'}
        submitting={busy}
        error={pinError}
        onSubmit={run}
        onClose={() => setAction(null)}
      />
    </div>
  );
}

function Stat({ label, value, help, strong }: { label: string; value: number; help?: string; strong?: boolean }) {
  return (
    <li className={`rounded-lg border p-3 ${strong ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200 bg-slate-50/50'}`}>
      <p className="text-[13px] text-slate-500">{label}</p>
      <p className={`mt-0.5 text-[20px] font-semibold ${strong ? 'text-blue-700' : 'text-slate-800'}`}>{value.toLocaleString('ko-KR')}</p>
      {help && <p className="text-[12px] text-slate-400">{help}</p>}
    </li>
  );
}
