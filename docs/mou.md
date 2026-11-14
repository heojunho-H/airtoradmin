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
   - R2 `FILES`에 `mou/v5/<id>.pdf`가 있으면 그것을 준다(v5 = 서식 버전 MOU_VERSION).
   - 없으면 같은 서식(인쇄용 HTML)을 PDF Worker(`airtoradmin-pdf`, 아래 'PDF Worker')에 보내 A4 PDF로 만들고 R2에 저장한 뒤 준다. 한글 글꼴(Noto CJK)은 Browser Run에 기본으로 있다.
   - Pages에 `PDF_RENDERER` 바인딩이 없으면 Browser Run REST `/pdf`(API 토큰)로 만든다. 지금은 바인딩을 쓴다.
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

## 서식 (v4, 2026-11-14 — 원래 보내던 협약서)

원래 보내던 협약서(`~/Desktop/단가보장 협약서.pptx`, 파워포인트에서 PDF로 내보내 붙이던 것)를 위치·크기 그대로 옮겼다. 원본 슬라이드 좌표를 mm로 바꿨다(EMU/36000). 화면(PC)과 PDF가 같은 mm 단위 A4를 쓰고, 휴대폰(860px 이하)에서만 흐름 배치로 바꾼다.

- **v1~v3를 거친 결론**: 사용자는 새로 디자인한 서식(공문형 v2, 견적서형 v3)보다 원래 디자인을 골랐다. 고객 서류는 원본 디자인을 지키고 내용만 손본다.
- **위**: 작업 사진 띠(원본 띠에 검정 40%를 겹친 그림)와 흰 로고, 제목 '에어컨 전문세척 **단가보장 협약서**', 두 줄 서문(둘째 줄 굵게), 청록→초록 그라데이션 선(#15a7a6 → #0e85a5 → #1e918a → #33a754 → #5dd557)
- **가운데**
  - 표 위 작은 줄: 적용 기간과 견적서 기준(원본에 없던 고객별 정보)
  - 견적서 모양 단가표: 머리 칸 #dce6f2, 품명 굵게, 합계 굵게 오른쪽. 원본처럼 품목 표에는 합계 줄이 없다.
  - 회색 원본 아이콘이 붙은 제1~3조
- **아래**(페이지 바닥에 붙음)
  - 그라데이션 선, 맺음, 'YYYY년 M월 D일 발행'
  - 대표이사 손글씨 서명과 '( 인 )' 위 직인, '(주)에어터 대표이사', '담당자 {고객별 매니저}'
  - 왼쪽 아래 악수 아이콘 + MOU + 협약번호
  - 오른쪽 아래 작업자 사진(불투명도 0.3)과 모자 위 기울인 작은 로고. 원본은 맺음·직인 위에 겹쳤지만, 사용자 요청("아래 사람 이미지 적절히 넣어라")으로 겹치지 않게 모서리에 둔다. 폭 66mm, compact는 58mm.
- **글꼴**: 보낸 PDF와 같은 맑은 고딕, 자간 −1pt. 맑은 고딕이 없으면 Noto Sans KR(화면), Browser Run에서는 Noto Sans CJK KR로 그린다. 원본 pptx가 지정한 글꼴도 Noto Sans다.
- **그림**
  - 코드(`functions/_lib/mou-assets.ts`): 띠·흰 로고·조항 아이콘·악수 아이콘·컬러 로고
  - R2: `brand/mou-seal.png`(직인), `brand/mou-sign.png`(대표이사 서명), `brand/mou-photo.png`(작업자 사진)
  - 직인은 2026-11-15부터 법인인감 원본 스캔을 쓴다. 투명 바탕이고, 원에 맞춰 잘라 360×360, 128색으로 줄였다. 그 전에는 pptx에서 뽑은 저화질본이었다. 서명은 원래 협약서 pptx의 손글씨 그대로다.
  - R2 그림은 공개 저장소에 두지 않는다. 공개 견본(`/mou/sample`)에는 작업자 사진만 싣고(사용자 허락), 직인·서명은 점선 자리만 둔다(2026-11-15 사용자 재확인: 서명·인감은 실제 협약서에만).
- **문구**는 원래 협약서의 뜻을 그대로 두고 계약서 문체로 다듬은 것이다(사용자 승인).
  - 서문: '㈜에어터(이하 "회사")는 {기관명}(이하 "고객")의 … / **다음과 같이 에어컨 전문세척 단가를 보장한다.**'
  - 조항은 ①②로 나눈다.
  - 맺음: '회사는 위 내용을 성실히 이행할 것을 확인하며 본 협약서를 발행한다.'
- **협약번호**는 `MOU-발행일-고객번호4자리`다. MOU 표시 아래에 작게 적는다. 발행 때 `doc_json.no`에 남는다.
- **분량**
  - 표 줄(머리 + 품목, 대수 표는 + 금액 줄)이 8줄을 넘으면 조항 간격을 줄인다(`compact`). 품명이 14자를 넘어 두 줄로 접히는 품목은 두 줄로 세고, 기관명이 12자를 넘으면(서문이 한 줄 늘어남) 한 줄 더 센다.
  - 기관명·품목명이 길어도 A4 한 장에 품목 11줄까지 들어간다.

## 설정

| 이름 | 종류 | 값 |
|---|---|---|
| `AI_DB` | D1 바인딩 | 이미 있음 (airtoradmin-ai) |
| `FILES` | R2 바인딩 | 이미 있음 (airtoradmin-files). 직인 `brand/mou-seal.png`, 대표이사 서명 `brand/mou-sign.png`, 작업자 사진 `brand/mou-photo.png`, PDF `mou/v5/*.pdf` |
| `PDF_RENDERER` | Service 바인딩 | `airtoradmin-pdf` (Production · Preview, 2026-11-15 연결) |
| `BROWSER_RUN_TOKEN` | Secret (선택) | `PDF_RENDERER`가 없을 때만. Cloudflare API 토큰, 권한 Account · Browser Run · Edit |
| `CF_ACCOUNT_ID` | Text (선택) | `BROWSER_RUN_TOKEN`과 함께. Cloudflare 계정 ID |
| `MOU_BASE_URL` | Text (선택) | 기본 `https://docs.airtor.co.kr` |

- **PDF Worker** (`workers/pdf-renderer/`, `airtoradmin-pdf`)
  - 본문으로 받은 인쇄용 HTML을 Browser Run 바인딩(`@cloudflare/puppeteer`)으로 A4 PDF로 만든다. 바인딩이라 API 토큰이 필요 없다.
  - 공개 주소가 없다(`workers_dev = false`, `preview_urls = false`). Pages의 `PDF_RENDERER`로만 부른다.
  - 배포는 Pages와 따로다: `npx wrangler login` 후 `npm run pdf:deploy`. 타입 검사는 `npm run pdf:typecheck`.
  - 바인딩을 처음 만들 때: Pages → Settings → Bindings → Add → Service binding, 변수명 `PDF_RENDERER` → `airtoradmin-pdf`(Production · Preview). 저장한 뒤 다음 배포부터 쓴다.

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
  - 먼저 지금 그림을 받아 둔다: `npx wrangler r2 object get airtoradmin-files/brand/mou-seal.png --file <백업.png> --remote`
  - `npx wrangler r2 object put airtoradmin-files/brand/mou-seal.png --file <png> --content-type image/png --remote`
  - 다시 받아 md5가 같은지 본다. 화면에는 10분 안에 반영된다.
  - 가동 뒤(실제 링크 발급 뒤)에 바꾸면 `MOU_VERSION`도 올린다. 이미 R2에 만들어 둔 PDF에는 예전 직인이 남아 있기 때문이다.
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
  - `/mou/sample.pdf`: 로컬에는 `PDF_RENDERER`·토큰이 없으므로 303 → `?pdf=fail`
  - `/mou`: 404 안내 화면
- **운영**
  - `https://docs.airtor.co.kr/mou/sample.pdf`가 A4 한 장 PDF로 내려받아지는지 본다. 303으로 화면에 돌아오면 Pages 실시간 로그의 `mou pdf failed`를 본다.
  - 테스트 메일(relation@만)에서 `$%mou_url%$`가 실제 주소로 바뀌는지 본다.
