# 스티비(Stibee) 뉴스레터 연동 — 설정 및 운영 가이드

고객 탭(`airtor_customers`)의 담당자 이메일을 스티비 주소록에 동기화한다.
뉴스레터 작성·발송·통계·**광고성 정보 수신 동의 관리는 전부 스티비 UI에서** 한다.
우리 시스템은 (1) 고객 → 주소록 동기화, (2) 스티비 웹훅으로 수신거부/반송 상태를 고객 탭에 반영만 담당한다.

- 요금제: **스탠다드** (구독자 API만 사용. 그룹/이메일 API는 프로 이상이라 사용하지 않음)
- 수신동의: 우리 DB에서 관리하지 않음. 모든 구독자를 `marketingAllowed: false`로 등록하고 동의는 스티비에서 수집

## 구성 요소

| 역할 | 파일 |
|---|---|
| DB 마이그레이션 (`contacts`, `newsletter_status`, `stibee_synced_at`) | `api/migrations/006_add_newsletter_fields.sql` |
| 고객 API 컬럼 매핑 | `api/customers_api.php` |
| 스티비 API 브로커 (API 키 보호) | `functions/api/newsletter.ts` |
| 스티비 웹훅 수신 | `functions/api/newsletter/webhook.ts` |
| 공용 헬퍼 | `functions/_lib/stibee.ts` |
| 프론트 클라이언트 (페이로드 변환, 호출) | `src/lib/newsletter.ts` |
| UI (동기화 버튼, 뉴스레터 배지, 저장 시 자동 push) | `src/app/components/CustomersPage.tsx` |
| dev 프록시 (`/api/newsletter` → 배포된 Function) | `vite.config.ts` |

## 최초 설정 순서

### 1. DB 마이그레이션 — ✅ 2026-09-29 적용 완료
카페24가 MySQL 웹어드민(phpMyAdmin)을 종료해 SQL 파일을 직접 실행할 수 없다. 대신 002와 같은 PHP 러너로 적용했다.
- 러너: `api/migrations/006_run_newsletter_fields.php` (FTP로 `www/api/migrations/`에 올린 뒤 브라우저/curl로 호출, 멱등)
  - 미리보기: `...?confirm_migrate=YES_RUN_NOW&dry_run=1`
  - 실행: `...?confirm_migrate=YES_RUN_NOW`
- 적용 결과: 백업 `airtor_customers_backup_pre_newsletter`(149행) 생성, `newsletter_status`·`stibee_synced_at` 추가,
  `contacts`는 이미 존재(37행 채워져 있었음)하여 skip, 빈 110행 백필 → 147/149행 채워짐.
- **실행 후 서버에서 러너 파일을 삭제할 것** (`002_backfill_projects.php`도 아직 남아 있음 — 같이 삭제 권장).
- 참고용 원본 SQL: `api/migrations/006_add_newsletter_fields.sql`

### 2. PHP 배포 (FileZilla)
`api/customers_api.php` 업로드 후 `https://airtor.co.kr/api/customers_api.php` GET 응답에
`contacts`, `newsletterStatus`, `stibeeSyncedAt` 키가 있는지 확인.
PHP는 `SHOW COLUMNS`로 006 적용 여부를 감지하므로 마이그레이션 전에 올려도 API가 깨지지 않는다
(그 동안은 새 키를 무시하고 `contacts: []`, `newsletterStatus: 'none'`으로 응답). 프론트도 새 키가 없으면
레거시 단일 담당자 필드로 폴백한다. 따라서 1·2번 순서는 바뀌어도 되지만, **마이그레이션 전까지는 담당자 복수 저장이 안 된다.**

### 3. 스티비 워크스페이스
1. 주소록 생성 → 브라우저 URL `stibee.com/lists/{id}/...` 의 숫자가 `STIBEE_LIST_ID`.
2. 주소록 > 사용자 정의 필드에 아래 7개를 생성. **키(영문)가 정확히 일치해야 한다.** 유형은 모두 텍스트.

   | 필드 이름(표시용) | 키 |
   |---|---|
   | 담당자명 | `name` |
   | 직책 | `position` |
   | 기업명 | `company` |
   | 등급 | `grade` |
   | 고객상태 | `customer_status` |
   | 고객책임자 | `account_manager` |
   | 최근작업일 | `last_work_date` |

   키가 없으면 동기화 시 해당 구독자가 `failInvalidFields`로 거부되고, 화면에 안내 alert가 뜬다.
3. 워크스페이스 설정 > API 키 > 새로 만들기 → 키 복사 (2025-01-21 이후 생성분만 유효).
4. 주소록 > 웹훅 > 새로 만들기
   - URL: `https://airtoradmin.pages.dev/api/newsletter/webhook?token=<임의의 긴 랜덤 문자열>`
   - 이벤트: `UNSUBSCRIBED`, `RESUBSCRIBED`, `DELETED`, `PURGED` (SUBSCRIBED/UPDATED는 선택)

### 4. Cloudflare Pages 환경변수 (Settings > Environment variables, Production)
| 변수 | 값 |
|---|---|
| `STIBEE_API_KEY` | 3-3에서 만든 API 키 |
| `STIBEE_LIST_ID` | 3-1의 주소록 ID (숫자) |
| `NEWSLETTER_WEBHOOK_SECRET` | 3-4 URL의 `token` 값과 동일 |
| `ALLOWED_ORIGIN` | (기존과 동일, 없으면 `https://airtoradmin.pages.dev`) |

저장 후 재배포(또는 다음 git push)해야 반영된다.

### 5. 배포 후 확인
```bash
# 스티비 인증 자체 확인
curl -H "AccessToken: $STIBEE_API_KEY" https://api.stibee.com/v2/auth-check

# Function 연결 상태 (auth + 구독자 수)
curl "https://airtoradmin.pages.dev/api/newsletter?action=status"

# WAF 403 여부 확인 — 200/400이면 정상, 403이면 경로명 변경 필요 (staffing.ts 전례)
curl -X POST "https://airtoradmin.pages.dev/api/newsletter" \
  -H "Content-Type: application/json" -d '{"action":"sync","subscribers":[]}'

# 웹훅 토큰 검증 — 잘못된 토큰은 401
curl -X POST "https://airtoradmin.pages.dev/api/newsletter/webhook?token=wrong" \
  -H "Content-Type: application/json" -d '{"action":"UNSUBSCRIBED","subscribers":[]}'
```

## 동작 방식

- **수동 동기화**: 고객 관리 헤더의 "스티비 동기화" 버튼. 이메일이 있는 담당자(`contacts[]`, 없으면 레거시 `email`) 전원을
  `POST /lists/{id}/subscribers/batch` (`updateEnabled: true`)로 전송. 결과(추가/갱신/실패)를 알림으로 표시하고
  성공 고객의 `newsletterStatus='subscribed'`, `stibeeSyncedAt`을 저장한다.
- **자동 push**: 고객 편집 저장·신규 추가 성공 직후 해당 고객 1건을 조용히 전송(실패는 콘솔 경고만).
  영업 탭 딜 확정으로 PHP가 자동 생성한 고객은 자동 push 대상이 아니므로 수동 버튼으로 흡수한다.
- **수신거부 반영**: 스티비에서 수신거부/자동삭제/완전삭제되면 웹훅이 `newsletter_status`를
  `unsubscribed` / `bounced` / `none`으로 바꾼다. `unsubscribed` 고객은 이후 동기화에서 제외되어 스티비의 수신거부를 덮어쓰지 않는다.
- **뉴스레터 발송**: 스티비 UI에서 세그먼트("광고성 정보 수신 동의 = 동의", `grade` 등)로 대상을 정해 발송.
  광고성 메일은 제목 `(광고)` 표기와 2년 주기 동의 재확인이 법적으로 필요하다(정보통신망법).

## 팔로업 자동 이메일 (최근 작업일 + N일)

고객의 **최신 작업 항목**(workHistory 중 작업일자 최대) 기준으로 N일 후 스티비 자동 이메일을 발송한다.
고객 상세의 **리마인드 1차/2차/3차** 체크박스가 단계 1/2/3에 대응한다: 발송되면 자동으로 체크되고, 미리 수동 체크해 두면 발송하지 않는다.

### 동작 구조
```
GitHub Actions (매일 06:30 KST, .github/workflows/newsletter-followups.yml)
  └─ POST /api/newsletter {action:'run-followups'}  헤더 X-Newsletter-Cron-Token
       ├─ 고객 전체 조회 → 오늘 발송 대상 계산 (functions/_lib/followups.ts)
       ├─ 대상 담당자 주소록 upsert
       ├─ 담당자별 스티비 자동 이메일 API 트리거 (POST https://stibee.com/api/v1.0/auto/{autoEmailId})
       └─ 고객별 emailHistory 장부 기록 + reminderN 체크 (customers_api.php PUT)
```

### 발송 규칙
- 오늘(KST) ≥ 작업일 + days 이고, 예정일을 지난 지 **grace(기본 30일) 이내**일 때만 발송. 그보다 오래된 건은 영구히 건너뜀(첫 가동·크론 중단 시 대량 발송 방지).
- 작업일이 **미래**면 지날 때까지 아무 단계도 보내지 않음.
- 여러 단계가 동시에 due면 **가장 높은 단계만** 발송, 낮은 단계는 `superseded`로 기록.
- 같은 작업(jobKey) + 단계 + 담당자 조합은 한 번만 발송. 담당자 일부 실패 시 다음 날 실패한 담당자만 재시도.
- 스티비 수신거부/자동삭제 구독자는 스티비가 트리거를 무시함. 우리 쪽 `newsletterStatus`가 unsubscribed/bounced 여도 건너뜀.
- 한 번 실행에 최대 15건(담당자 단위). 초과분은 `deferred`로 보고되고 다음 날 처리 (Cloudflare 무료 플랜 서브리퀘스트 한도 때문).

### 스티비 설정
1. 주소록 사용자 정의 필드(텍스트) 추가: `project_name`, `total_quantity`, `quotation_amount` (기존 7개에 더해). 본문 개인화 키로 사용.
2. 단계마다 **자동 이메일** 생성: 트리거 = **API 직접 요청**, 대기 시간 없음, **[트리거 중복 허용하기] ON, 중복 제한 1일** (재구매 고객에게 다시 보내기 위해 필수), 발송 시간대 예: 평일 09:00–18:00.
3. 각 자동 이메일의 트리거 URL `https://stibee.com/api/v1.0/auto/{autoEmailId}` 에서 ID를 복사.
4. 본문 개인화: `$%name%$` `$%company%$` `$%project_name%$` `$%last_work_date%$` `$%account_manager%$` `$%total_quantity%$` `$%quotation_amount%$`

### Cloudflare Pages 환경변수
| 변수 | 값 |
|---|---|
| `NEWSLETTER_FOLLOWUPS` | `{"grace":30,"stages":[{"stage":1,"days":30,"autoEmailId":"XXXX","label":"1개월 팔로업"},{"stage":2,"days":90,"autoEmailId":"YYYY","label":"3개월 팔로업"}]}` |
| `NEWSLETTER_CRON_SECRET` | 긴 랜덤 문자열 (GitHub Secrets `NEWSLETTER_CRON_SECRET`와 동일) |

- `stage`는 1~3 (리마인드 1/2/3차), `days`는 작업일 이후 일수. **기간을 바꾸려면 이 JSON만 수정하고 Deployments > Retry deployment** (코드 변경 없음).
- 미설정이면 러너는 아무 것도 하지 않고 `disabled:true`를 반환, 화면의 리마인드 예정일은 `-`로 표시.

### GitHub 설정
- Settings > Secrets and variables > Actions > `NEWSLETTER_CRON_SECRET` 등록.
- Actions 탭 > newsletter-followups > Run workflow (dryRun=true 기본)로 수동 점검. 60일간 커밋이 없으면 GitHub가 스케줄을 자동 비활성화하니 Actions 탭에서 재활성화.

### 확인
```bash
# 설정 확인
curl -s "https://airtoradmin.pages.dev/api/newsletter?action=config"
# 미리보기 (토큰 불필요, 발송·기록 없음) — 화면의 "팔로업 점검" 버튼과 동일
curl -s -X POST https://airtoradmin.pages.dev/api/newsletter -H 'Content-Type: application/json' -d '{"action":"run-followups","dryRun":true}'
# 실제 실행 (토큰 필요). limit로 첫 실행 건수 제한 가능
curl -s -X POST https://airtoradmin.pages.dev/api/newsletter -H 'Content-Type: application/json' \
  -H "X-Newsletter-Cron-Token: $NEWSLETTER_CRON_SECRET" -d '{"action":"run-followups","limit":1}'
```
첫 실제 실행 전에는 직원 이메일을 테스트 고객의 담당자로 넣고 `limit:1`로 1건만 보내 본다.
실행 결과는 고객 상세의 **이메일 발송 이력**과 리마인드 체크 아래 "자동발송 날짜" 캡션으로 확인한다.

## 스티비 API 참고
- Base URL `https://api.stibee.com/v2`, 헤더 `AccessToken`, OpenAPI: `https://developers.stibee.com/스티비-api/openapi.json`
- 속도 제한: 대량 추가 10회/분, 구독자 조회 100회/분, 그 외 1000회/분 (초과 시 429)
- 대량 추가 1회 최대 1,000명 (Function이 자동 청크 분할)
- 도움말: https://help.stibee.com/api-webhook/api , https://help.stibee.com/api-webhook/list-webhook
