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

## 스티비 API 참고
- Base URL `https://api.stibee.com/v2`, 헤더 `AccessToken`, OpenAPI: `https://developers.stibee.com/스티비-api/openapi.json`
- 속도 제한: 대량 추가 10회/분, 구독자 조회 100회/분, 그 외 1000회/분 (초과 시 429)
- 대량 추가 1회 최대 1,000명 (Function이 자동 청크 분할)
- 도움말: https://help.stibee.com/api-webhook/api , https://help.stibee.com/api-webhook/list-webhook
