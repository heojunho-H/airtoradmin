// 리마인드 메일 4통 — 작업일 기준 ① A2 45일 · ② B1 200일 · ③ B2 335일 · ④ B3 395일
// 담당 매니저의 네이버웍스 계정으로 직접 보낸다(functions/_lib/works.ts). 문안은 2026-11-15 사용자 확정본이다.
// 모두 광고 표시 없이 보낸다 — B1(단가보장 협약서)·B2(우선 배정)는 KISA 기준 광고성 소지가 있다는 설명을 듣고
// 사용자가 정한 것이다(docs/remind-mails.md).
//
// 틀: 왼쪽 정렬(손으로 보내는 메일처럼), 바탕색 없음(아이폰 네이버웍스 다크 모드가 지정한 흰 바탕을 검은 상자로 바꾼다),
// light-only meta(애플 메일·안드로이드 웹뷰용). 서명의 E.는 보내는 담당자 메일이고, 메일은 서명으로 끝난다(바닥글 없음).

export type RemindMailKey = 'a2' | 'b1' | 'b2' | 'b3';
export const REMIND_MAIL_KEYS: readonly RemindMailKey[] = ['a2', 'b1', 'b2', 'b3'];

export function isRemindMailKey(v: unknown): v is RemindMailKey {
  return typeof v === 'string' && (REMIND_MAIL_KEYS as readonly string[]).includes(v);
}

/** 보내는 담당자 — managers_api.php 의 한 사람 */
export interface RemindSender {
  name: string;
  position: string;
  email: string;
  phone: string;
}

export interface RemindMailInput {
  key: RemindMailKey;
  company: string;
  /** 받는 고객 담당자 (contacts[]) */
  recipientName: string;
  recipientPosition: string;
  sender: RemindSender;
  /** 'YYYY-MM-DD' */
  workDate: string;
  today: string;
  /** 설비 내역 한 줄 (followups.equipmentLine) */
  equipment: string;
  /** B1 협약서 링크 (functions/_lib/mou.ts issueMouLink) */
  mouUrl?: string;
}

export const MAIL_LOGO_URL = 'https://docs.airtor.co.kr/mail/airtor-logo.png';

// 평가 구글 폼 2개 (2026-11-14 게시) — 누른 평가와 기관명을 미리 채운다
const FORM_A = 'https://docs.google.com/forms/d/e/1FAIpQLSdWhZQzCSlxNiV4C3qsW5PxGwtCkNzJGz89wGKfoUJwqL8jBg/viewform'; // 1분 설문
const FORM_B = 'https://docs.google.com/forms/d/e/1FAIpQLScg8v3DQy98gDYqad4W5IFewA-AD2AiRuj3OHOC01ODmbn0gw/viewform'; // 아쉬우셨던 점
const A_RATING = '1947073681';
const A_ORG = '83153372';
const B_ORG = '1683015870';

const P = '<p style="margin:0 0 18px 0;">';
const P6 = '<p style="margin:0 0 6px 0;">';
const END = '<p style="margin:0 0 20px 0;">감사합니다.</p>';
const LINK = 'display:inline-block;padding:6px 4px;color:#194c9b;font-weight:bold;text-decoration:underline;';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const DAY_MS = 86400000;
function utc(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function addDays(ymd: string, n: number): string {
  return new Date(utc(ymd) + n * DAY_MS).toISOString().slice(0, 10);
}
function koreanDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

// '2026-09-26' → '26.09.26' (원래 메일의 작업일 표기)
export function shortDate(ymd: string): string {
  return `${ymd.slice(2, 4)}.${ymd.slice(5, 7)}.${ymd.slice(8, 10)}`;
}

// 작업 뒤 지난 기간 — A2(45일)는 '한 달 반', B1(200일)은 개월 수
export function elapsedLabel(workDate: string, today: string): string {
  const days = Math.round((utc(today) - utc(workDate)) / DAY_MS);
  if (days < 60) return '한 달 반';
  if (days < 75) return '두 달';
  return `${Math.floor(days / 30.4)}개월`;
}

const PLACEHOLDER_NAMES = new Set(['담당', '담당자', '-', '.']);

// "기관 이름 직급님" → 직급이 없으면 "기관 이름님" → 이름도 없으면 "기관 담당자님"
export function greetingOf(company: string, name: string, position: string): string {
  const clean = (s: string) => s.trim().replace(/님$/, '').trim();
  const org = company.trim() || '귀사';
  const n = clean(name);
  const p = clean(position);
  if (!n || PLACEHOLDER_NAMES.has(n)) return `${org} 담당자님`;
  return p ? `${org} ${n} ${p}님` : `${org} ${n}님`;
}

function formUrl(base: string, pairs: [string, string][]): string {
  return `${base}?${['usp=pp_url', ...pairs.map(([k, v]) => `entry.${k}=${v}`)].join('&amp;')}`;
}

export function remindSubject(key: RemindMailKey, company: string): string {
  const org = company.trim() || '귀사';
  switch (key) {
    case 'a2':
      return `[에어터] ${org} 에어컨 전문세척 이후 사용 상태를 여쭙습니다`;
    case 'b1':
      return `[에어터] ${org} 에어컨 전문세척 장기 협력을 위한 단가 보장 안내`;
    case 'b2':
      return `[에어터] ${org} 에어컨 위생관리 1년 안내`;
    case 'b3':
      return `[에어터] ${org} 에어컨 전문세척 기록 보관 안내`;
  }
}

// 메일은 담당자 서명(로고·이름 줄)으로 끝난다 — 회사 정보·안내·수신거부 줄은 넣지 않는다 (2026-11-15 사용자 결정).
// API 로 보낸 메일에는 네이버웍스 개인 서명이 붙지 않으므로 이 서명이 모든 담당자의 서명이다.
function wrap(body: string, sender: RemindSender): string {
  const sigName = escapeHtml(`${sender.name} ${sender.position}`.trim());
  const mobile = sender.phone.trim()
    ? `<span style="white-space:nowrap;">M. ${escapeHtml(sender.phone.trim())}</span>&nbsp;&nbsp;`
    : '';
  return `<meta name="color-scheme" content="only light">
<meta name="supported-color-schemes" content="light">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="color-scheme:only light;">
  <tr>
    <td align="left" style="padding:24px 16px;">
      <!--[if mso]><table role="presentation" width="600" align="left" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;font-family:'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',sans-serif;color:#222222;">
        <tr>
          <td style="font-size:15px;line-height:1.75;color:#222222;word-break:keep-all;">
${body}
          </td>
        </tr>
        <tr>
          <td style="padding:0;">
            <img src="${MAIL_LOGO_URL}" width="110" height="33" alt="AIRTOR" style="display:block;width:110px;height:33px;border:0;outline:none;text-decoration:none;">
            <p style="margin:8px 0 0 0;font-size:13px;line-height:1.7;color:#222222;word-break:keep-all;"><strong>${sigName}</strong> | <span style="white-space:nowrap;">D. <strong>1644-1295</strong></span>&nbsp;&nbsp;${mobile}<span style="white-space:nowrap;">E. <strong>${escapeHtml(sender.email)}</strong></span><br><a href="https://www.airtor.co.kr" style="color:#194c9b;text-decoration:underline;">www.airtor.co.kr</a></p>
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
`;
}

const lines = (...parts: string[]) => parts.map((p) => `            ${p}`).join('\n');

/** 메일 한 통 — 제목과 HTML 본문. 값은 모두 여기서 이스케이프한다 */
export function renderRemindMail(input: RemindMailInput): { subject: string; html: string } {
  const company = input.company.trim() || '귀사';
  const org = escapeHtml(company);
  const sender = input.sender;
  const hello = `${P}안녕하세요. ${escapeHtml(greetingOf(company, input.recipientName, input.recipientPosition))}.<br>${escapeHtml(`에어컨 위생파트너 에어터의 ${sender.name} ${sender.position}`.trim())}입니다.</p>`;
  const facts = `- <strong>작업일</strong> : ${shortDate(input.workDate)}<br>- <strong>작업 설비</strong> : ${escapeHtml(input.equipment)}`;
  const elapsed = escapeHtml(elapsedLabel(input.workDate, input.today));
  const due = koreanDate(addDays(input.workDate, 365));
  const q = encodeURIComponent(company);

  let body: string;
  switch (input.key) {
    case 'a2': {
      const good = formUrl(FORM_A, [[A_RATING, encodeURIComponent('만족')], [A_ORG, q]]);
      const okay = formUrl(FORM_A, [[A_RATING, encodeURIComponent('보통')], [A_ORG, q]]);
      const bad = formUrl(FORM_B, [[B_ORG, q]]);
      body = lines(
        hello,
        `${P6}저희가 방문하여 에어컨 전문세척을 진행한 지 ${elapsed} 지났습니다.</p>`,
        `${P}${facts}</p>`,
        `${P}세척 때 분해했다가 다시 조립한 부분까지 제자리를 잘 잡았는지, 사용하시면서 불편하신 점은 없는지 확인차 연락드렸습니다.</p>`,
        `${P}혹시 <strong>물이 떨어지거나, 환기해도 냄새가 남거나, 전에 없던 소리</strong>가 나는 실내기가 있으면 회신 부탁드립니다. 확인 후 <strong>늦어도 다음 영업일까지</strong> 원인과 조치 방법을 안내해 드리겠습니다.</p>`,
        `${P}불편하신 점이 없으시면 지난 작업이 어떠셨는지 하나만 눌러 주세요. 아쉬우셨던 점을 남겨 주시면 꼼꼼히 살펴 개선하겠습니다.<br><span style="white-space:nowrap;"><a href="${good}" style="${LINK}padding-left:0;">만족</a>&nbsp;·&nbsp;<a href="${okay}" style="${LINK}">보통</a>&nbsp;·&nbsp;<a href="${bad}" style="${LINK}">개선 필요</a></span></p>`,
        `${P}추가로 궁금하신 점은 언제든 편하게 문의 부탁드립니다.</p>`,
        END,
      );
      break;
    }
    case 'b1': {
      if (!input.mouUrl) throw new Error('B1 메일에는 협약서 링크(mouUrl)가 있어야 합니다');
      body = lines(
        hello,
        `${P6}저희가 방문하여 에어컨 전문세척을 진행한 지 ${elapsed} 지났습니다.</p>`,
        `${P}${facts}</p>`,
        `${P6}올해 위생관리 예산과 일정을 세우실 때 쓰실 수 있도록, <strong>지난 작업과 같은 단가를 보장</strong>하는 협약서를 준비했습니다.</p>`,
        `${P}- <strong>보장 기간</strong> : ${due}까지 (작업일부터 1년)<br>- <strong>연장</strong> : 끝나기 한 달 전에 협의해 연장할 수 있습니다<br>- <strong>변동 조건</strong> : 수량이 15% 이상 달라지면 다시 견적</p>`,
        `${P}${org} 이름으로 작성한 협약서는 아래에서 바로 보시고 PDF로 내려받으실 수 있습니다. 내부 품의나 예산 자료로 그대로 쓰셔도 됩니다.<br><a href="${escapeHtml(input.mouUrl)}" style="${LINK}padding-left:0;">단가보장 협약서 보기</a></p>`,
        `${P}그동안 사용하시면서 불편하셨던 점이 있으면 함께 알려 주세요. 바로 확인해 안내해 드리겠습니다.</p>`,
        `${P}앞으로도 ${org}의 쾌적한 실내환경을 위해 꼼꼼히 챙기겠습니다.</p>`,
        END,
      );
      break;
    }
    case 'b2':
      body = lines(
        hello,
        `${P6}저희가 방문하여 에어컨 전문세척을 진행한 지 1년이 다가옵니다.</p>`,
        `${P}${facts}<br>- <strong>세척 1년</strong> : ${due}</p>`,
        `${P}귀사는 에어터 협력 고객사로 등록되어 있어 <strong>희망하시는 일정에 우선 배정</strong>해 드립니다. 올해도 위생관리 계획이 있으시면 <strong>희망 시기만 회신</strong>해 주세요(예: 다음 달 셋째 주, 주말 작업). 지난 작업 기록을 바탕으로 일정과 견적을 함께 안내해 드리겠습니다.</p>`,
        `${P}단가 보장 협약서를 받으셨다면 ${due}까지 같은 단가가 적용되고, 회신 한 줄로 연장을 협의하실 수 있습니다.</p>`,
        `${P}1년 동안 사용하시면서 아쉬웠던 점이 있으면 함께 알려 주세요. 다음 작업에 반영하겠습니다.</p>`,
        END,
      );
      break;
    case 'b3':
      body = lines(
        hello,
        `${P6}저희가 방문하여 에어컨 전문세척을 진행한 지 1년이 지났습니다.</p>`,
        `${P}${facts}</p>`,
        `${P}이 작업의 기록은 에어터가 <strong>계속 보관</strong>합니다. 작업 리포트(작업 전·후 사진), 세척 증명서, 견적서·거래명세서 사본이 필요하실 때 <strong>서류 이름만 회신</strong>해 주시면 1영업일 안에 보내 드립니다.</p>`,
        `${P}담당자가 바뀌셨다면 새 담당자분 연락처를 알려 주세요. 기록을 그분께 이어 드리겠습니다.</p>`,
        `${P}에어컨을 쓰시다 궁금하신 점이 생기면 언제든 편하게 문의 부탁드립니다.</p>`,
        `${P}앞으로도 ${org}의 쾌적한 실내환경을 위해 꼼꼼히 챙기겠습니다.</p>`,
        END,
      );
      break;
  }
  return { subject: remindSubject(input.key, company), html: wrap(body, sender) };
}
