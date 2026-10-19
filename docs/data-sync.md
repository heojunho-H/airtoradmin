# 영업·고객·프로젝트 동기화

영업 관리(딜)·고객 관리(작업이력)·프로젝트 관리에는 같은 고객·같은 작업건이 일부러 겹쳐 있다.
어느 페이지에서 고쳐도 나머지가 **가장 최근에 고친 값**으로 맞춰진다 (2026-10-19 도입).

- 서버: `api/sync_lib.php` (공용 함수) + `api/deals_api_v2.php` · `api/customers_api_v2.php` · `api/projects_api_v2.php`
- 화면: `src/lib/dealSync.ts` (바뀐 칸 계산·패치·결과 처리), `src/lib/activitySync.ts` (공급망 작업 히스토리)
- 이미 서로 달라진 기존 값은 그대로 둔다(사용자 결정) — 앞으로 고치는 항목부터 맞춰진다.

## 연결

딜 #N ↔ 고객 작업이력의 `dealId = N` 항목 ↔ 프로젝트 `deal_id = N`

- 연결은 딜이 **수주로 바뀔 때**(또는 처음부터 수주로 등록할 때)만 만든다.
  고객은 이미 그 dealId 를 가진 고객 → 회사명(정확히 같은 이름 → 정규화가 같은 이름) → 새 고객 순으로 찾는다.
  같은 문의일의 예전 항목(dealId 없음)이 있으면 그 항목을 연결한다(후속 메일 장부 jobKey 도 `deal:N` 으로 옮김).
- 한 번 연결되면 수주 여부와 관계없이 계속 동기화한다.
- 수주 판정(한 곳: `isWonDeal` / `sl_is_won`): 성공여부 `success`, 또는 진행상태 `confirmed` + 성공여부 `in-progress`.
  영업 KPI 의 성공 기준과 같다. (진행상태 수주확정 + 성공여부 실패 = 수주 아님)

## 무엇이 맞춰지나

| 딜 (영업 관리) | 고객 작업이력 | 프로젝트 |
|---|---|---|
| 문의 등록일 | 문의 등록일 | – (작업이력을 바로 읽음) |
| 희망서비스 | 프로젝트명 | 프로젝트명·서비스 |
| 총수량·상세수량 | 같음 | – (작업이력을 바로 읽음) |
| 견적금액 (문자 "₩790만") | 견적금액 (정수) | 견적·부가세(q×10/110)·순매출 → 손익 재계산 |
| 고객책임자 | 고객책임자 | – |
| 확정작업일 | 작업일자 | 작업일 (빈 값은 NULL) → 손익 재계산 |

고객 ↔ 연결된 딜:

- **회사명** — 고객명을 바꾸면 연결 딜 중 예전 이름과 같은 표기(정규화)인 딜만 새 이름으로.
  딜 회사명을 바꾸면: 다른 고객 이름과 같으면 그 고객으로 옮기고(프로젝트 고객도), 이 고객의 연결 작업이 1건뿐이면
  고객명도 바꾸고, 여러 건이면 고객명은 두고 알린다(`company_diverged`).
- **담당자** — 같은 사람(이름 → 전화 숫자 → 이메일)을 찾아 고치고, 없으면 담당자로 추가. `contacts` 와 예전 단일 칸(첫 담당자)을 함께 맞춘다.
  고객 → 딜은 화면이 보낸 `contactPairs`(예전 → 새 값)로 그 사람이던 딜만 고친다.
- **주소** — 상대가 예전 값과 같거나 비어 있을 때만 (딜마다 현장 주소가 다를 수 있다).
- **고객 단위 고객책임자**는 작업별 고객책임자와 따로 둔다(과거 작업의 담당 기록 보존).

프로젝트의 공유 항목은 딜·작업이력에서 **복사만** 한다. `projects_api_v2` PUT 은 그 항목을 무시하고 `ignored_fields` 로 알린다.
프로젝트를 지우면 딜이 다시 수주로 바뀔 때만 새로 만든다.

## 최신 수정 우선

- 화면은 **바뀐 칸만** 보낸다. 딜은 편집 시작 때 값과 비교(`diffDeal`), 고객 작업이력은 패치 연산(`buildWorkHistoryPatch`).
  오래 열어 둔 화면이 다른 사람·다른 페이지가 고친 칸을 되돌리지 않는다.
- 서버는 저장 전후 값을 DB 에서 다시 읽어 **실제로 바뀐 항목만** 퍼뜨린다. 쓰기는 `GET_LOCK('airtor2014_sync')` 로 한 줄로 세운다.
- 응답의 `synced` 에 함께 바뀐 딜·고객·프로젝트가 오면 App 이 세 목록을 다시 불러온다(300ms 묶음, 그사이 저장이 있으면 버리고 다시).
  페이지를 옮길 때(20초 지남)·탭으로 돌아올 때(60초 지남)도 새로 받는다.
- `_v: 2` 가 없는 예전 화면의 행 전체 저장(딜 PUT, 고객 작업이력·메일기록 통째 저장)은 409 `reload_required` — 새로고침 안내.

## 수주 취소·삭제 (표시만 — 사용자 결정)

- 딜이 실패·미견적이 되거나 삭제돼도 작업이력·프로젝트는 그대로 두고, 고객 작업 행과 프로젝트 행에 '수주 취소'·'딜 삭제됨'을 표시한다.
  그 프로젝트는 AI 인력 추천 자동 실행에서 뺀다(KPI 는 그대로).
- 고객 페이지에서 연결 작업을 지우면 확인 후 작업이력에서 지우고 딜을 '실패'로 바꾼다(프로젝트는 표시만).
  같은 딜을 가진 다른 고객이 있으면(예전 중복) 이 고객 항목만 지우고 딜은 그대로.
- 고객을 지우면 그 고객을 가리키던 프로젝트의 `customer_id` 를 같은 딜의 다른 고객 또는 NULL 로 바꾼다.

## API

```
PUT /api/deals      { id, _v: 2, ...바뀐 칸 }
  → { success, deal, changed, synced:{deals,customers,projects}, transition: 'won'|'lost'|null, warnings }
PUT /api/customers  { id, _v: 2, ...바뀐 칸, contactPairs?, workHistoryPatch?, emailHistoryAppend? }
  workHistoryPatch: { op:'update', key, set } | { op:'add', entry } | { op:'remove', key, cascade?:'fail-deal' }
  key: 'deal:<딜ID>' | 'wd:<작업일>|<프로젝트명>|<문의일>#<순번>'  (# 없으면 #0 — functions/_lib/followups.ts jobKey 호환)
  → { success, customer, updated_fields, synced, conflicts:[{type:'not_found'|'needs_confirmation', key}], warnings }
동기화 실패(본 저장은 됨) → 500 { success:false, persisted:true, error, ... }
GET /api/deals_api_v2.php?action=probe → 서버 환경 점검 (읽기 전용)
```

## 배포 · 되돌리기

- PHP 는 FileZilla 로 `api/` 에 올린다(`sync_lib.php` + `*_v2.php`). 예전 `deals_api.php` 등은 서버에 남겨 둔다.
- DB 접속 정보는 코드에 두지 않는다. 서버 전용 `api/db_config.php`(저장소 제외 — .gitignore)가 `$conn` 을 만들고,
  v2 파일은 이 파일만 읽는다(없으면 500). 같은 파일을 예전 `customers_api.php`·`projects_api.php`·`labor_rates_api.php` 도 쓴다.
- 전환은 프록시 대상(`functions/api/{deals,customers,projects}.ts`, `functions/_lib/stibee.ts`, `vite.config.ts`)을 v2 로 바꾸는 git push.
  **되돌리기는 그 커밋을 revert** 하면 프록시가 예전 PHP 를 다시 가리킨다.
- 점검: `node .wrangler/check/sync-parity.mjs` (v1/v2 읽기 비교), `node .wrangler/check/sync-e2e.mjs` (시험 데이터로 전 경로, 끝나면 삭제).
  둘 다 gitignore 된 로컬 스크립트.

## 알려진 한계

- 예전 PHP(`*_api.php`, `managers_api.php` 등)는 인증 없이 공개돼 있고, 오류 경로에 `http_response_code()`(운영 PHP 에 없음)를 쓴다 — 안정되면 지울 것.
- `api/health_check.php` 는 예전 규칙이라 지금 500 을 낸다(이번 범위 밖).
- 2026-05 이전 수주 딜(작업이력에 dealId 없음)은 연결되지 않은 채로 둔다. 진행상태를 다시 수주로 바꾸면 그때 연결된다.
- 고객의 '다음 관리일'은 예전처럼 등록 때만 정해진다(작업일을 바꿔도 다시 계산하지 않음).
