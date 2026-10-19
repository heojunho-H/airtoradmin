# AI (Anthropic Claude) 운영 가이드

AI 어시스턴트 페이지 · AI 기업정보(웹 검색) · AI 인력배치 · 견적서 입력 도우미(PDF 판독)를 모두 Anthropic Claude 로 처리한다 (2026-10, Gemini 제거).
관리자는 **설정 > AI 모델 설정**에서 기능별 기본 모델·추론 강도·사용 여부를 정하고(관리자 PIN), 직원은 AI 페이지에서 대화마다 허용된 모델 중 하나를 고를 수 있다.
대화는 Cloudflare D1 에 저장되며 **팀 전체에 공유**된다.

## 구성 요소

| 파일 | 역할 |
|---|---|
| `functions/api/assistant.ts` | 단일 AI 엔드포인트 — 채팅(SSE)·기업정보(SSE)·설정·대화 목록·사용량. 경로에 "claude" 를 쓰지 않는다 (WAF 전례) |
| `functions/api/staffing.ts` | AI 인력배치 (ProfitPage 자동 큐). 모델은 설정에서만 결정. 레거시 본문도 임시 수용 |
| `functions/_lib/ai-models.ts` | **모델 레지스트리(단일 진실원)** — 모델별 가격·thinking·effort·구조화 출력·웹검색 버전, 기능별 기본값 |
| `functions/_lib/ai-chat.ts` | 채팅 한 턴: 검증 → 스트리밍 → D1 원자 저장 → `done` |
| `functions/_lib/ai-company.ts` | 기업정보: 웹 검색 + `pause_turn` 이어가기 + 출처 추출 |
| `functions/_lib/ai-staffing.ts` | 인력배치 프롬프트·스키마·입력 검증 (브라우저에서 서버로 이전) |
| `functions/_lib/ai-prompts.ts` | 전문가 에이전트 5종 프롬프트(역할·규칙·판단 기준·분석 절차), 데이터 스냅샷 블록, 기업정보 프롬프트 |
| `functions/_lib/ai-store.ts` / `ai-http.ts` / `ai-client.ts` | D1 SQL / Origin·SSE·PIN 헬퍼 / SDK 클라이언트·오류 매핑 |
| `functions/api/files.ts` | 견적서 입력 도우미 — PDF 업로드+판독(SSE)·파일 목록·내려받기·연결·삭제. 본문은 R2(`FILES`), 기록은 D1 `ai_files` |
| `functions/_lib/ai-files.ts` | 견적서 판독 프롬프트·JSON 스키마·결과 검증(금액·수량 교차 확인), `ai_files` SQL |
| `functions/_lib/ai-auth.ts` | D1 확인·관리자 PIN 확인·"작성자 또는 PIN" 권한 (assistant·files 공용) |
| `d1/migrations/0001_ai_init.sql` | D1 스키마 (재실행 안전) |
| `d1/migrations/0002_ai_files.sql` | 견적서·고객사 파일 테이블 `ai_files` (재실행 안전) |
| `src/app/components/ai/*` | AI 어시스턴트 페이지 (대화 목록·스트리밍·마크다운·모델 선택) |
| `src/app/components/settings/*` | 설정 페이지 (AI 모델 설정·사용량·연결 상태) |
| `src/lib/ai/*` | API 클라이언트·SSE 파서·전문가 정의(`personas.ts`)·포맷터. `intake.ts` = 견적서 매칭·변경표·딜/프로젝트 반영, `files.ts` = `/api/files` 클라이언트 |
| `src/app/components/ai/QuoteIntakePanel.tsx` · `src/app/components/CustomerFiles.tsx` | 견적서 입력 도우미 화면 / 고객 상세의 "견적서·파일" 목록 |
| `src/lib/ai/snapshot/*` | 전문가별 데이터 스냅샷 — `derive.ts` 가 원본 기록에서 지표를 다시 계산, `sales·crm·supply·profit·overview.ts` 가 전문가별 섹션 |

## 최초 설정 순서

### 1. Anthropic Console
1. 전용 워크스페이스(예: `airtoradmin`)를 만들고 **Production 키와 Preview 키를 따로** 발급한다.
2. 조직·워크스페이스 **월 지출 한도**를 건다 (2026-10 설정: 조직 $100·알림 $80, 워크스페이스 `airtoradmin` $70·알림 $56 — 설정 > AI 사용량 화면을 보며 조정). 한도에 닿으면 앱은 "이번 달 AI 사용 한도에 도달했습니다" 를 띄운다.
3. Capabilities 에서 **웹 검색이 켜져 있는지** 확인한다 (AI 기업정보에 필요, 1,000회당 $10 + 토큰).
4. 조직이 ZDR(무보존)이면 Claude Fable 5.1 은 쓸 수 없다 — 설정 화면에서 고르지 않는다.

### 2. Cloudflare D1
1. 대시보드 > Storage & Databases > D1 > Create: `airtoradmin-ai`, `airtoradmin-ai-preview` (위치 힌트 Asia-Pacific).
2. 각 DB 의 **Console** 탭에 `d1/migrations/0001_ai_init.sql` 내용을 넣어 실행한다.
   콘솔 입력칸은 **한 줄**이라 주석(`--`)을 지우고 한 줄로 합친 SQL 을 넣어야 한다 (2026-10-19 두 DB 모두 이 방식으로 적용, 테이블 5·인덱스 4 확인).
   또는 CLI: `npx wrangler login` 후 `npx wrangler d1 execute airtoradmin-ai --remote --file=d1/migrations/0001_ai_init.sql`
3. Pages 프로젝트 > Settings > Bindings > Add > D1 database: 변수명 **`AI_DB`**
   - Production → `airtoradmin-ai`, Preview → `airtoradmin-ai-preview`
   - ⚠️ 저장소에 `wrangler.toml` 을 만들면 대시보드 바인딩이 그 파일로 대체된다. 만들지 않는다.

### 2-1. Cloudflare R2 (견적서 입력 도우미 파일 보관)
1. 대시보드 > Storage & Databases > R2 — 처음이면 R2 구독을 활성화한다(무료 한도: 저장 10GB/월, 쓰기 100만·읽기 1,000만 회/월, 내보내기 무료).
2. 버킷 만들기: `airtoradmin-files`(운영), `airtoradmin-files-preview`(프리뷰). 위치 자동, 공개 접근·커스텀 도메인 **켜지 않는다** (파일은 `/api/files` 로만 내려받는다).
3. Pages 프로젝트 > Settings > Bindings > Add > R2 bucket: 변수명 **`FILES`** — Production → `airtoradmin-files`, Preview → `airtoradmin-files-preview`.
4. 두 D1 콘솔에 `d1/migrations/0002_ai_files.sql` 을 1번과 같은 방식(주석 제거·한 줄)으로 실행한다.
5. 재배포 후 AI 페이지 > 견적서 입력 도우미 화면의 "최근 올린 견적서"가 오류 없이 보이면 된다.
   - 바인딩이 없으면 "파일 저장소(R2)가 연결되지 않았습니다", 테이블이 없으면 "처리 중 오류가 발생했습니다"(로그에 `no such table: ai_files`).

### 3. Cloudflare Pages 환경변수 (Production · Preview 모두)
| 변수 | 값 |
|---|---|
| `ANTHROPIC_API_KEY` | 1에서 만든 키 (Preview 에는 Preview 키) |
| `AI_ADMIN_PIN` | 설정 변경용 관리자 PIN (8자 이상). **없으면 설정은 읽기 전용** |
| `AI_ALLOWED_ORIGINS` | (선택) 추가 허용 Origin, 쉼표 구분. 기본: airtoradmin.co.kr·www·pages.dev·브랜치 프리뷰·localhost |

유형은 **Secret**(암호화)으로 저장한다 — Text 는 대시보드·API 에서 값이 그대로 보인다. 저장 후 재배포(또는 다음 git push)해야 반영된다.

### 4. WAF (airtoradmin.co.kr 존)
채팅에 코드·표를 붙여넣으면 무료 플랜 관리형 룰("React - RCE - CVE-2025-55182")이 403 으로 막을 수 있다 (`/api/claude` 전례).
- Security > WAF > Custom rules > Create rule
  - 조건: `URI Path` equals `/api/assistant` **or** `URI Path` equals `/api/staffing` **or** `URI Path` equals `/api/files`(견적서 PDF 업로드)
  - 동작: **Skip** → "All managed rules" (관리형 룰 단계 건너뛰기)
- (선택) Rate limiting rule: 같은 경로 POST, IP당 10초 20회.
- 2026-10-19 배포 전 점검: 코드·마크다운 표·`<script>`/SQL 이 섞인 본문 3종을 `/api/assistant` 로 보내 모두 통과(405, 함수 배포 전이라 정상). Skip 룰은 실데이터 본문 대비 방어용.
- 무료 플랜 커스텀 룰은 문서상 "Log 를 제외한 모든 액션"을 지원하므로 Skip 이 가능할 것으로 보이나 실측이 필요하다.
  대시보드에서 "All managed rules" 를 고를 수 없다면: 경로는 이미 중립 단어(`assistant`)라 대부분 통과하므로 5번 WAF 확인을 먼저 해 보고,
  그래도 403 이면 경로명을 다른 중립 단어로 바꾸거나(`AI_ENDPOINT`) 존을 Pro 로 올려 관리형 룰 예외를 둔다.

### 5. 배포 후 확인
```bash
BASE=https://airtoradmin.co.kr        # 프리뷰: https://<branch>.airtoradmin.pages.dev
H=(-H 'Content-Type: application/json' -H "Origin: $BASE")

# 연결 상태 — db:"ok", apiKey:true, pinConfigured:true 여야 한다
curl -s "$BASE/api/assistant?action=status"

# WAF 확인 (반드시 .co.kr — pages.dev 는 WAF 를 거치지 않는다)
#   400 application/json 이면 통과, 403 text/html 이면 WAF 차단 → 4번 확인
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' -X POST "$BASE/api/assistant" "${H[@]}" \
  -d '{"action":"chat","persona":"invalid","message":"const r = a * b; if (r >= 0.4) {}","snapshot":"· A사 | 단계:견적","userName":"waf"}'

# 채팅 스트림 — meta → status → text... → done 순서. 같은 대화 두 번째 질문에서 done.usage.cacheReadTokens > 0
curl -N -X POST "$BASE/api/assistant" "${H[@]}" \
  -d '{"action":"chat","persona":"assistant","message":"한 줄 요약","snapshot":"오늘 날짜(KST): 2026-10-19\n- 고객: A사, B사","userName":"점검"}'

# 기업정보 — done 에 sources 가 있어야 한다
curl -N -X POST "$BASE/api/assistant" "${H[@]}" -d '{"action":"company-info","company":"에어터","userName":"점검"}'
```
점검용으로 만든 대화는 AI 페이지 목록에서 삭제한다(작성자 이름 "점검").

### 6. Workers 무료 플랜 CPU 확인 (유료 전환 판단)
무료 플랜은 요청당 CPU 10ms 제한이다(네트워크 대기는 제외). 스트리밍 파싱·저장이 이를 넘으면 Error 1102 로 답변이 끊기고 저장되지 않는다.
- 프리뷰에서 **긴 답변 5회 이상 + 기업정보 3회**를 실행하면서 로그를 본다:
  - 대시보드 > Workers & Pages > airtoradmin > Functions > 실시간 로그, 또는
  - `npx wrangler pages deployment tail --project-name airtoradmin --environment preview --format json | grep -o '"outcome":"[a-zA-Z]*"'`
- `exceededCpu` 가 한 번이라도 보이면 **Workers Paid($5/월)** 로 전환한다 (계정 단위, 코드 변경 없음).
- 2026-10-19 프리뷰 측정: 가상 데이터 2만 자로 긴 분석 5턴 + 기업정보 3회 + Sonnet 5.5 분석 1회 중 **3건 exceededCpu**(긴 대화 4턴째, 기업정보 1회, Sonnet 분석) → Paid 전환 결정.
  CPU 초과로 끊긴 요청은 저장·사용량 기록이 모두 빠지지만 Anthropic 에는 청구된다 (앱 사용량 카드가 실제보다 적게 보임).
- 같은 측정의 비용 참고 (Opus 5.5·추론 보통): 분석형 질문 1건 $0.28~0.62, 기업정보 1건 $0.25~0.31. 같은 질문을 Haiku 5.5 로 하면 $0.021 (집계 결과 동일).
- **2026-10-19 Workers Paid 전환 완료.** 재측정에서 끊겼던 요청(8.6만 토큰 대화, 기업정보, Sonnet 분석) 모두 정상 완료, exceededCpu 없음.

### 7. Gemini 정리
- Pages 환경변수 `GEMINI_API_KEY` 삭제 (Production·Preview).
- Google AI Studio 에서 키 폐기 — 과거 커밋 `3efb8a7` 에 노출된 키 포함.
- 직원들에게 새로고침 안내 (열려 있던 탭의 옛 AI 드로어는 동작하지 않는다).
- 2026-10-19 진행: Pages Production `GEMINI_API_KEY` 삭제 완료 (Preview 에는 원래 없음). Google AI Studio 키 폐기는 계정 소유자가 직접 한다.
- 같은 날 Production 의 `STIBEE_API_KEY`·`NEWSLETTER_CRON_SECRET`·`NEWSLETTER_WEBHOOK_SECRET` 을 Text → **Secret** 으로 전환 (값 유지, 스티비 인증 확인).
  이제 대시보드에서 값을 다시 볼 수 없다 — GitHub Secret `NEWSLETTER_CRON_SECRET` 을 등록할 때 기존 값이 따로 없으면 새 값을 만들어 Cloudflare·GitHub 양쪽에 같이 넣는다.

## 동작 방식

- **모델 결정**: 설정(D1 `ai_settings`)에 행이 없으면 코드 기본값 — 어시스턴트·기업정보 Opus 5.5, 인력배치 Sonnet 4.6(Phase 1.8 동작 그대로).
  인력배치는 D1 이 없어도 기본값으로 동작한다.
- **모델별 차이는 `buildModelParams()` 가 흡수**한다: Opus 5.5·Sonnet 5.5·Fable 5.1 은 thinking 을 끌 수 없고(effort 로 조절), 강제 tool_choice·temperature 가 400 이라
  인력배치는 구조화 출력(JSON 스키마)으로, Sonnet 4.6 은 기존 강제 tool 호출로 제출받는다. Haiku 5.5 는 temperature 를 보내지 않고 서버측 폴백이 없으며, 프롬프트 10만 토큰 초과 시 단가가 5배다. 레거시 Haiku 4.5 는 effort 를 보내지 않는다.
- **안전 분류기 폴백**: Opus 5.5·Sonnet 5.5·Fable 5.1 은 `fallbacks: "default"` 로 거부 시 Anthropic 권장 모델이 이어서 답한다(화면 푸터에 실제 응답 모델 표시). 끝까지 거부되면 저장하지 않고 안내 카드를 보인다.
- **대화 저장**: 질문과 답변은 응답이 끝난 뒤 한 번에 저장된다. 실패·중지·거부된 턴은 저장되지 않는다(사용량만 기록).
  히스토리는 append-only — 대화 시작 때 동결한 system 블록과 저장된 응답 블록을 **수정 없이** 다시 보낸다(프롬프트 캐시·thinking 서명 유지).
  같은 대화에 두 사람이 동시에 보내면 늦은 쪽은 409 "다른 사용자가 먼저 메시지를 추가했습니다".
- **전문가 에이전트**: 종합 분석 AI · 영업 · 고객관리 · 공급망 · 손익 전문가. 빈 화면의 카드로 고르고, 대화 중에는 헤더의 "전문가 바꾸기"로 새 대화에 이어 묻는다.
  ID(`assistant·sales·crm·supply·profit`)는 D1 에 저장되므로 바꾸지 않는다. 프롬프트를 고치면 새 대화부터 적용된다.
- **데이터 스냅샷**: 브라우저가 대화 시작 시점의 운영 데이터를 전문가별 텍스트로 만들어 보낸다(최대 10만 자, 연락처 제외, 주소는 시/도만, 메모의 전화·이메일 제거).
  저장된 집계 필드 중 갱신되지 않는 것(고객책임자 매출·성과평가, 작업팀장 진행 건수·저장 등급, 고객의 저장된 다음 관리일, 프로젝트 AI 채택)은 쓰지 않고
  원본 기록에서 다시 계산한다. 공식은 화면과 같게 유지한다 — 화면 공식을 바꾸면 `src/lib/ai/snapshot/derive.ts` 와 `ai-prompts.ts` 도 함께 고친다.
  기록 입력률이 20% 미만인 항목(예: 작업팀장 배정, 리포트 전송 체크)은 목록 대신 "데이터 부족"으로 안내한다. '최신 데이터로 갱신'은 다음 질문에 새 스냅샷을 덧붙인다.
- **견적서 입력 도우미**: AI 페이지 6번째 카드(또는 헤더 "전문가 바꾸기" 메뉴). 대화·스냅샷을 쓰지 않는 별도 화면이다.
  1. PDF(20MB 이하)를 올리면 서버가 R2 에 저장하고 Claude 가 문서를 읽어 JSON 스키마로 돌려준다(모델 = 설정의 AI 어시스턴트 모델, 추론 강도 low, 사용량 항목 "견적서 입력"). 같은 파일(sha256)은 다시 판독하지 않는다. 견적서가 아니면 파일을 지운다.
  2. 브라우저가 최신 딜·고객으로 매칭한다 — 회사명 정규화(`src/lib/company.ts`) → 같은 회사 딜을 문의일-견적일 간격·수량 일치·진행 상태·서비스로 점수화, 정확히 같은 이름이 없으면 비슷한 이름(포함 관계) 후보.
  3. 확인 카드에서 고객사·작업건·고객책임자를 고르고 변경표(현재 → 견적서)를 확인한 뒤 [시스템에 입력].
     - 기존 딜: 반영 직전에 딜을 다시 받아 그 위에서 바꾸고, 바뀐 칸만 PUT 한다(api/deals_api_v2.php 부분 수정). 견적 금액(`₩N만`)·장비 구성(10개 키)·총 수량은 다르면 덮어쓰고, 서비스·담당자·고객책임자는 비어 있을 때만 채운다. 신규·유선상담이면 '견적서 발송'으로 올린다. 관리 메모 끝에 `[견적서 반영 날짜 금액 · 파일명]` 한 줄.
     - 맞는 딜이 없으면 새 딜(견적서 발송·진행중, 문의일 = 견적일).
     - 연결된 수주 딜이면 서버가 고객 작업이력과 프로젝트(견적·부가세 q×10/110·순매출·손익)를 함께 고친다 — docs/data-sync.md.
     - 서버 동기화가 실패해도 딜이 저장됐으면(500 + `persisted`) 저장된 것으로 안내하고, 고객관리·프로젝트 확인을 권한다.
  4. 파일을 고객사(정규화 키)·딜에 연결 → 고객 관리 상세의 "견적서·파일"에서 내려받는다(수주 전 견적서도 같은 회사명이면 보인다). 삭제는 올린 사람 또는 관리자 PIN, 기록만 지우고 R2 본문은 남긴다.
- **견적서 일괄 입력** (한 번에 최대 10개, 3개씩 동시 판독 — `src/lib/ai/intakeBatch.ts`):
  - 파일 여러 개 또는 고객 폴더째 끌어놓으면 PDF만 골라 읽는다. 판독 상한은 사용자당 10분 30건(서버 `ai_usage` 로 셈, 넘으면 429).
  - 판독은 공급자(에어터 등록번호 691-86-02152)로 타사 견적서를, 문서 종류로 사업자등록증·표준작업서 등을 거른다(보관 안 함).
    차수는 파일명 "N차견적서"(NFC 로 바꿔 판정 — macOS 파일명은 NFD), 라벨은 "견적서(김포)" 괄호.
  - 같은 딜로 가는 견적서는 묶는다: 견적일이 다르면 최근 것(견적일 → 차수)이 딜 값, 나머지는 파일만 보관.
    같은 날짜의 대안(스탠드·반분해·5대/4대)·현장(김포/방화)은 사용자가 하나를 고르거나 합산한다.
    수주·실패로 끝난 딜에 이미 들어 있는 견적과 같은 금액의 견적이 있으면 그것을 기본으로 둔다(수주 후 낸 3차가 딜 값을 덮지 않게).
  - 미리 체크 조건: 신뢰도 높음·차단 플래그 없음(여러 견적·VAT 별도·정기 금액·견적일 없음·수량/금액 불일치)·정확한 회사명·
    견적일 60일 전~7일 후 문의한 딜이 2위보다 15점 이상 높음·새 딜 아님·수주 딜 금액 변경 아님·기존 값과 30% 이내.
    재구매 고객의 오래된 딜은 기본 선택하지 않는다(창 밖 → 새 딜).
  - [선택한 N건 입력]은 묶음을 하나씩 차례로 반영하고(같은 딜을 동시에 고치지 않게), 끝나면 App 이 딜·고객·프로젝트를 다시 불러온다.
- **비용 추정**: 정가 × 토큰(캐시 읽기·쓰기 포함) + 웹 검색 $10/1,000회, 환율 1,400원/$ 가정 (`src/lib/ai/format.ts` `USD_TO_KRW`). 실제 청구는 Anthropic Console 기준.
- **권한**: 대화 열람·이어쓰기는 누구나, 이름 변경·삭제는 작성자(또는 PIN). 설정 저장은 PIN(IP당 15분 10회 시도 제한, 시도 기록용 D1 이 없으면 PIN 확인 자체를 거부). 설정 변경·삭제·PIN 실패는 `ai_audit` 에 남는다.
  작성자 이름은 로그인 시 저장된 localStorage 값이라 신원 증명은 아니다 (실제 인증은 후속 과제).

## 모델 추가/교체
1. `functions/_lib/ai-models.ts` 의 `MODELS` 에 항목을 추가한다 (가격, thinking, effortLevels, sampling, forcedToolChoice, structuredOutputs, webSearchTool, serverFallback, features).
2. 배포 후 설정 화면에서 고른다. 어시스턴트의 대화별 선택 목록에도 체크해 준다.

## 로컬 개발
- 기본: `npm run dev` — `/api/assistant`·`/api/staffing` 은 배포된 운영 Function(운영 D1·키)으로 프록시된다. 시험 대화는 팀 목록에 보이니 지울 것.
- 로컬 D1 로 시험:
  1. `npm run build && npm run functions:dev` (`.dev.vars` 에 `ANTHROPIC_API_KEY`, `AI_ADMIN_PIN` — gitignore 대상)
  2. 로컬 DB 에 스키마 적용 (첫 요청 후 생기는 `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<해시>.sqlite` 에 `sqlite3 <파일> < d1/migrations/0001_ai_init.sql`)
  3. `AI_FUNCTIONS_TARGET=http://127.0.0.1:8788 npm run dev`
- 점검: `npm run functions:typecheck`, `npm run functions:build`, `npm run build`

## 문제 해결
| 증상 | 원인 / 조치 |
|---|---|
| "보안 필터(Cloudflare)가 요청을 차단했습니다" | WAF 403 — 4번 Skip 룰 확인. 그래도 막히면 `src/lib/ai/api.ts` 의 `AI_ENDPOINT` 와 함수 파일명을 다른 중립 단어로 변경 |
| "AI 저장소(D1)가 연결되지 않았습니다" / "테이블이 아직 만들어지지 않았습니다" | 2번 바인딩(해당 환경) 또는 스키마 적용 누락. 설정 > 연결 상태에서 확인 |
| "AI API 키 오류입니다" | `ANTHROPIC_API_KEY` 누락·오타·폐기 |
| "PIN 확인 시도가 너무 많아 잠시 잠겼습니다" | 15분 후 재시도 (IP 단위, 성공 포함 15분 10회) |
| "이번 달 AI 사용 한도에 도달했습니다" | Anthropic Console 지출 한도 상향 또는 다음 달 대기 |
| 긴 답변이 중간에 끊김 + 저장 안 됨 | Workers 무료 플랜 CPU 초과(1102) 가능성 — 6번 |
| "안전 정책에 따라 AI가 답변하지 않았습니다" | 분류기 거부. 표현을 바꿔 재시도. 반복되면 다른 모델 선택 |
| "파일 저장소(R2)가 연결되지 않았습니다" | 2-1번 `FILES` 바인딩(해당 환경) 누락 — 추가 후 재배포 |
| 견적서 업로드가 "보안 필터…"로 실패 | `.co.kr` WAF 가 multipart 본문을 차단 — 4번 Skip 룰에 `/api/files` 추가 |
| "견적서로 보이지 않습니다" | 판독 결과가 견적서가 아님(documentType other). 스캔 품질이 낮으면 원본 PDF 로 다시 |
| 인력배치 "AI 호출 타임아웃 (90초)" | 인력배치에 추론 강도가 높은 모델을 지정한 경우 — 설정에서 effort 를 낮추거나 Sonnet 4.6/5.5 로 |

## 남은 정리 (2026-10 배포 약 1주 후)
- `functions/api/staffing.ts` 의 레거시 본문(`messages`) 분기 제거 — 이전 배포 탭 호환용.
