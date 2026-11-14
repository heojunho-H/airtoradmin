# 단가보장 협약서 링크 (mou)

B1(작업 후 200일) 광고판 메일의 '단가보장 협약서 보기' 링크다. 고객이 누르면 그 고객의 협약서가 열리고, [PDF 내려받기]로 A4 PDF를 받는다. 2026-11-14 도입(A안). 리마인드 메일을 최종 승인하기 전까지는 견본(`/mou/sample`)만 열린다.

스티비 자동 메일에는 파일을 붙일 수 없어서(링크만 가능) 손으로 붙이던 '○○ 단가보장 협약서.pdf'를 링크로 바꿨다.

## 흐름

1. 팔로업 실제 실행(`run-followups`, 크론 토큰)에서 `NEWSLETTER_FOLLOWUPS`의 `"mou": true` 단계 대상마다 `issueMouLink`(functions/_lib/mou.ts)가 협약서 내용을 D1 `mou_links`에 얼려 두고 링크를 만든다. 트리거 값은 `mou_url = {MOU_BASE_URL}/mou/<id>`다.
   - id는 128비트 무작위 base64url 22자다. 링크를 아는 사람만 연다.
   - 같은 고객·작업(job_key)은 기존 링크를 다시 쓴다.
   - 링크를 못 만들면 그 고객은 그날 보내지 않는다. 다음 날 다시 시도하고, 응답의 `mouDeferred`와 `errors`에 남는다.
   - dryRun은 D1에 쓰지 않고 `mouLinks` 건수만 보인다. test-trigger는 `/mou/sample`을 싣는다.
2. 고객이 `/mou/<id>`를 열면 `functions/mou/[id].ts`가 얼려 둔 내용으로 화면을 그린다. 직인은 R2에서 읽는다.
   - 나중에 관리 앱 값을 고쳐도 이미 보낸 협약서는 바뀌지 않는다.
3. `/mou/<id>.pdf`
   - R2 `FILES`에 `mou/v1/<id>.pdf`가 있으면 그것을 준다.
   - 없으면 같은 서식(인쇄용 HTML)을 Cloudflare Browser Run REST `/pdf`로 만들어 R2에 저장한 뒤 준다. 한글 글꼴(Noto CJK)은 Browser Run에 기본으로 있다.
   - 실패하면 화면(`?pdf=fail`)으로 돌려보내고 '인쇄 → PDF로 저장'을 안내한다.

## 단가표

- **품목별 단가**
  - 경로: 작업 항목 dealId → `ai_files`(kind `quote`, status `linked`, 삭제 안 됨, `applied_json.role='values'`가 딱 1건) → `extraction_json.lineItems`
  - 아래를 모두 만족할 때만 쓴다.
    - 에어터 발행, 1회 금액, VAT 포함, 견적서 1장
    - 줄마다 1대 단가 × 수량 = 공급가액, 공급가액 + 세액 = 합계
    - 품목 합계 − 총 견적 금액이 0 ~ max(1만 원, 1%). 천 원 단위 절사는 '단수 정리' 줄로 보인다.
    - 딜 금액과 총 견적 금액의 차이가 max(1만 원, 1%) 안. 협상으로 금액을 고친 딜은 쓰지 않는다.
- **조건을 못 맞추면** 설비별 대수(detailedQuantity)와 지난 작업 금액(quotationAmount, VAT 포함)을 적는다. 금액도 없으면 대수만 적고 '지난 작업 견적과 같은 단가'라고 쓴다. 제2조 첫 줄도 이에 맞춰 바뀐다.
- **적용 기간**은 작업일 ~ 작업일 + 365일이다. 메일의 `due_date_kr`과 같은 날이다. 링크는 적용이 끝나고 30일 뒤까지 열린다(그 뒤 410).
- **담당 줄**은 고객 담당 매니저 이름과 직책(managers_api.php)이다. 매니저가 없으면 대표번호를 적는다. 손글씨 서명은 넣지 않는다.

## 설정

| 이름 | 종류 | 값 |
|---|---|---|
| `AI_DB` | D1 바인딩 | 이미 있음 (airtoradmin-ai) |
| `FILES` | R2 바인딩 | 이미 있음 (airtoradmin-files). 직인 `brand/mou-seal.png`, PDF `mou/v1/*.pdf` |
| `BROWSER_RUN_TOKEN` | Secret | Cloudflare API 토큰. 권한 Account · Browser Run · Edit |
| `CF_ACCOUNT_ID` | Text | Cloudflare 계정 ID |
| `MOU_BASE_URL` | Text (선택) | 기본 `https://docs.airtor.co.kr` |

- **docs.airtor.co.kr**
  - 카페24 DNS에 CNAME `docs` → `airtoradmin.pages.dev`를 넣는다. 와일드카드 레코드가 있으니 이름을 정확히 만든다.
  - Pages → 사용자 지정 도메인에 `docs.airtor.co.kr`을 더한다.
  - 이 호스트의 `/`는 `functions/index.ts`가 www.airtor.co.kr로 보낸다.
- **스티비**
  - 사용자 정의 필드 `mou_url`. 기본값은 `https://docs.airtor.co.kr/mou/`이고, 이 주소는 회신 안내 화면을 연다.
  - B1 광고판 본문에 `<a href="$%mou_url%$">단가보장 협약서 보기</a>`를 넣는다.
- **NEWSLETTER_FOLLOWUPS**: B1 단계에 `"mou": true`를 넣는다. 다른 단계에는 넣지 않는다.
- **공개 저장소**이므로 직인 그림과 직원 이름은 코드·문서에 두지 않는다. 직인은 R2에만 둔다.

## 운영

- **링크 하나 닫기**
  - `npx wrangler d1 execute airtoradmin-ai --remote --command "UPDATE mou_links SET revoked_at='<ISO 시각>' WHERE id='<id>'"`
  - 같은 작업에 다시 실행하면 새 링크가 생긴다.
- **서식을 바꿨을 때**: `functions/_lib/mou.ts`의 `MOU_VERSION`을 올린다. R2의 PDF가 새 서식으로 다시 만들어진다.
- **직인 그림 바꾸기**
  - `npx wrangler r2 object put airtoradmin-files/brand/mou-seal.png --file <png> --content-type image/png --remote`
  - 10분 안에 반영된다.
- **공개 견본** `/mou/sample`
  - 단가는 00,000, 직인 자리는 점선이다.
  - PDF는 캐시하지 않는다.
- **응답 헤더**
  - `Cache-Control: private, no-store`
  - `X-Robots-Tag: noindex, nofollow`
  - `Referrer-Policy: no-referrer`
  - CSP(인쇄 버튼만 nonce 스크립트, `frame-ancestors 'none'`)

## 점검

- **로컬**: `npm run build && npm run functions:dev`
  - `/mou/sample`이 200
  - `/mou/sample.pdf`: 토큰이 없으면 303 → `?pdf=fail`
  - `/mou`: 404 안내 화면
- **운영**
  - `https://docs.airtor.co.kr/mou/sample.pdf`가 A4 한 장 PDF로 내려받아지는지 본다.
  - 테스트 메일(relation@만)에서 `$%mou_url%$`가 실제 주소로 바뀌는지 본다.
