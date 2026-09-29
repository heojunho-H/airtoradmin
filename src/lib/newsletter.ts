// 스티비(Stibee) 뉴스레터 연동 — 프론트 클라이언트
//
// 역할: 고객 데이터 → 스티비 구독자 페이로드 변환, /api/newsletter (Cloudflare Function) 호출.
// 스티비 API 키는 Function 환경변수에만 있고 여기서는 절대 다루지 않는다.
//
// 스티비 주소록 사전 설정 (수동, 키는 영문·유형 텍스트):
//   name, position, company, grade, customer_status, account_manager, last_work_date
// → STIBEE_FIELD_KEYS와 반드시 일치해야 한다. 주소록에 없는 키를 보내면
//   스티비가 해당 구독자를 failInvalidFields로 거부한다.
//
// 수신동의(marketingAllowed)는 항상 false로 보낸다 (사용자 결정 2026-09-29):
//   동의 수집·관리는 스티비 UI(구독 폼/수동 편집)에서만 한다.

export type NewsletterStatus = 'none' | 'subscribed' | 'unsubscribed' | 'bounced';

export const NEWSLETTER_STATUS_LABEL: Record<NewsletterStatus, string> = {
  none: '미등록',
  subscribed: '구독중',
  unsubscribed: '수신거부',
  bounced: '반송',
};

export const STIBEE_FIELD_KEYS = [
  'name',
  'position',
  'company',
  'grade',
  'customer_status',
  'account_manager',
  'last_work_date',
] as const;

export interface StibeeSubscriberPayload {
  email: string;
  status: 'subscribed' | 'unsubscribed';
  marketingAllowed: boolean;
  fields: Record<string, string>;
}

export interface StibeeBatchResult {
  createdSubscribers?: string[];
  updatedSubscribers?: string[];
  failAlreadyExists?: string[] | null;
  failNoEmails?: string[] | null;
  failInvalidEmails?: string[] | null;
  failDuplicatedEmails?: string[] | null;
  failInvalidFields?: string[] | null;
  failInvalidSubscriberStatus?: string[] | null;
}

interface SyncApiResponse {
  ok: boolean;
  sent?: number;
  dropped?: string[];
  result?: StibeeBatchResult;
  error?: string;
  errors?: unknown[];
}

// CustomersPage의 Customer 타입과 순환 참조를 피하기 위해 필요한 필드만 구조적으로 받는다.
export interface ContactLike {
  name?: string;
  position?: string;
  phone?: string;
  email?: string;
}

export interface CustomerLike {
  id: number;
  company?: string;
  grade?: string;
  customerStatus?: string;
  accountManager?: string;
  lastWorkDate?: string;
  contactName?: string;
  contactPosition?: string;
  phone?: string;
  email?: string;
  contacts?: ContactLike[];
  newsletterStatus?: NewsletterStatus | string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string | undefined | null): boolean {
  return !!email && EMAIL_RE.test(email.trim());
}

// CustomersPage.getContacts와 동일 규칙: contacts 배열 우선, 없으면 레거시 단일 필드 폴백
function contactsOf(customer: CustomerLike): ContactLike[] {
  if (customer.contacts && customer.contacts.length > 0) return customer.contacts;
  if (customer.contactName || customer.phone || customer.email) {
    return [{
      name: customer.contactName || '',
      position: customer.contactPosition || '',
      phone: customer.phone || '',
      email: customer.email || '',
    }];
  }
  return [];
}

// 고객 1명 → 담당자별 구독자 N명. 이메일 없는 담당자는 건너뛴다.
// 이미 수신거부(unsubscribed)로 캐시된 고객은 스티비의 수신거부를 덮어쓰지 않도록 제외한다.
export function toSubscribers(customer: CustomerLike): StibeeSubscriberPayload[] {
  if (customer.newsletterStatus === 'unsubscribed') return [];
  const out: StibeeSubscriberPayload[] = [];
  const seen = new Set<string>();
  for (const c of contactsOf(customer)) {
    const email = (c.email || '').trim().toLowerCase();
    if (!isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({
      email,
      status: 'subscribed',
      marketingAllowed: false,
      fields: {
        name: c.name || '',
        position: c.position || '',
        company: customer.company || '',
        grade: customer.grade || '',
        customer_status: customer.customerStatus || '',
        account_manager: customer.accountManager || '',
        last_work_date: customer.lastWorkDate || '',
      },
    });
  }
  return out;
}

export interface SyncSummary {
  ok: boolean;
  sent: number;
  created: string[];
  updated: string[];
  failed: { email: string; reason: string }[];
  invalidFields: boolean; // 스티비 주소록에 사용자 정의 필드가 없을 때 true
  syncedCustomerIds: number[]; // 성공(생성/갱신)한 이메일을 가진 고객 id
  error?: string;
}

const FAIL_REASON: { key: keyof StibeeBatchResult; reason: string }[] = [
  { key: 'failAlreadyExists', reason: '이미 등록됨' },
  { key: 'failNoEmails', reason: '이메일 없음' },
  { key: 'failInvalidEmails', reason: '이메일 형식 오류' },
  { key: 'failDuplicatedEmails', reason: '요청 내 중복' },
  { key: 'failInvalidFields', reason: '사용자 정의 필드 불일치' },
  { key: 'failInvalidSubscriberStatus', reason: '구독 상태 값 오류' },
];

export function summarizeSyncResult(
  res: SyncApiResponse,
  customers: CustomerLike[],
): SyncSummary {
  const result = res.result || {};
  const created = result.createdSubscribers || [];
  const updated = result.updatedSubscribers || [];
  const failed: { email: string; reason: string }[] = [];
  for (const { key, reason } of FAIL_REASON) {
    for (const email of result[key] || []) failed.push({ email, reason });
  }
  for (const email of res.dropped || []) failed.push({ email, reason: '이메일 형식 오류' });

  const okEmails = new Set([...created, ...updated].map((e) => e.toLowerCase()));
  const syncedCustomerIds = customers
    .filter((c) => contactsOf(c).some((ct) => okEmails.has((ct.email || '').trim().toLowerCase())))
    .map((c) => c.id);

  return {
    ok: res.ok,
    sent: res.sent || 0,
    created,
    updated,
    failed,
    invalidFields: (result.failInvalidFields || []).length > 0,
    syncedCustomerIds,
    error: res.error,
  };
}

async function postNewsletter<T extends { ok: boolean; error?: string; result?: unknown } = SyncApiResponse>(
  body: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch('/api/newsletter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  // 302→HTML 리디렉트(호스팅 만료 등)나 WAF 403도 여기서 잡힌다.
  const text = await response.text();
  let json: T;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`뉴스레터 API 응답이 JSON이 아닙니다 (HTTP ${response.status})`);
  }
  if (!response.ok && !json.result) {
    throw new Error(json.error || `뉴스레터 API 오류 (HTTP ${response.status})`);
  }
  return json;
}

// ── 팔로업 자동 발송 (functions/_lib/followups.ts 와 규칙 공유) ─────────────────────

export interface FollowupStage {
  stage: 1 | 2 | 3; // 리마인드 1/2/3차에 대응
  days: number;
  label?: string;
}

export interface FollowupConfig {
  stages: FollowupStage[];
  grace: number;
}

export interface FollowupDueItem {
  customerId: number;
  company: string;
  stage: number;
  label: string;
  workDate: string;
  dueDate: string;
  projectName: string;
  recipients: string[];
  supersededStages: number[];
}

export interface FollowupDryRunReport {
  ok: boolean;
  dryRun: true;
  disabled?: boolean;
  today: string;
  config: FollowupConfig;
  evaluated: number;
  due: FollowupDueItem[];
  deferred: { customerId: number; company: string; stage: number; dueDate: string; recipients: number }[];
  skippedSummary: Record<string, number>;
  error?: string;
}

export const FOLLOWUP_SKIP_LABEL: Record<string, string> = {
  unsubscribed: '수신거부',
  bounced: '반송',
  'no-email': '이메일 없음',
  'no-work-entry': '작업 이력 없음',
  'future-work-date': '작업일 미도래',
  'not-due': '예정일 전',
  'out-of-grace': '유예 기간 경과',
  'flag-set': '이미 체크됨',
  'already-sent': '이미 발송',
};

// 설정이 없거나(disabled) 오류면 null
export async function fetchFollowupConfig(): Promise<FollowupConfig | null> {
  try {
    const response = await fetch('/api/newsletter?action=config');
    const json = JSON.parse(await response.text()) as { ok: boolean; stages?: FollowupStage[]; grace?: number };
    if (!json.ok || !Array.isArray(json.stages)) return null;
    return { stages: json.stages, grace: json.grace ?? 30 };
  } catch {
    return null;
  }
}

// 토큰 없이 허용되는 미리보기 — 아무 것도 발송/기록하지 않는다. 실제 발송은 GitHub Actions 크론이 담당.
export async function runFollowupsDryRun(): Promise<FollowupDryRunReport> {
  return postNewsletter<FollowupDryRunReport>({ action: 'run-followups', dryRun: true });
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

// 백엔드 addDays와 동일한 UTC 일 단위 산술. 형식이 틀리면 '-'
export function followupDueDate(workDate: string | undefined, days: number): string {
  if (!workDate || !YMD_RE.test(workDate)) return '-';
  const [y, m, d] = workDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

// 작업 항목 식별 키 — 백엔드 jobKeyOf와 반드시 동일
export function jobKeyOf(entry: { dealId?: number; workDate?: string; projectName?: string; inquiryDate?: string }): string {
  if (entry.dealId !== undefined && entry.dealId !== null && entry.dealId !== 0) return `deal:${entry.dealId}`;
  return `wd:${entry.workDate || ''}|${entry.projectName || ''}|${entry.inquiryDate || ''}`;
}

// 여러 고객을 스티비 주소록에 일괄 동기화 (수동 버튼용)
export async function syncCustomersToStibee(customers: CustomerLike[]): Promise<SyncSummary> {
  const subscribers = customers.flatMap(toSubscribers);
  if (subscribers.length === 0) {
    return {
      ok: false, sent: 0, created: [], updated: [], failed: [],
      invalidFields: false, syncedCustomerIds: [],
      error: '이메일이 등록된 담당자가 없습니다',
    };
  }
  const res = await postNewsletter({ action: 'sync', subscribers });
  return summarizeSyncResult(res, customers);
}

// 고객 저장 직후 1건 자동 push — fire-and-forget. 실패는 콘솔 경고만 (syncDealToCustomer 관례).
// 결과가 필요하면 콜백으로 받는다 (UI 배지 갱신용).
export function syncOneQuietly(
  customer: CustomerLike,
  onDone?: (summary: SyncSummary) => void,
): void {
  const subscribers = toSubscribers(customer);
  if (subscribers.length === 0) return;
  postNewsletter({ action: 'sync', subscribers })
    .then((res) => onDone?.(summarizeSyncResult(res, [customer])))
    .catch((err) => console.warn('[newsletter] 자동 동기화 실패 (무시):', err));
}

export interface NewsletterStatusInfo {
  ok: boolean;
  auth?: boolean;
  listId?: string;
  count?: unknown;
  error?: unknown;
}

export async function checkNewsletterStatus(): Promise<NewsletterStatusInfo> {
  const response = await fetch('/api/newsletter?action=status');
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: `응답이 JSON이 아닙니다 (HTTP ${response.status})` };
  }
}
