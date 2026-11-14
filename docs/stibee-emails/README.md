# 리마인드 자동 메일 5통 (스티비)

작업일 기준 자동 메일 5통의 본문과 설정이다. **5통 모두 정보성이다.** 가격·단가·연장·일정 권유·할인 문구를 한 줄도 넣지 않는다. 한 줄이라도 들어가면 메일 전체가 광고가 되고, 광고는 제목에 (광고)를 붙이고 사전 동의를 받아야 한다(KISA 불법 스팸 방지 안내서 2025.12).

기획 근거와 결정은 Claude Docs 문서 '에어터 리마인드 마케팅 기획'에 있다.

## 단계

| 단계 | 메일 | 작업일 기준 | 파일 |
|---|---|---|---|
| 1 | A2 사용 가이드 | D+45 | `a2-usage-guide.html` |
| 2 | A3 반년 점검 | D+150 | `a3-half-year.html` |
| 3 | B1 1년 관리 기록 | D+300, 작업월이 7~10월이면 D+240 | `b1-annual-record.html` |
| 4 | B2 1년 사용 점검 | D+335 | `b2-annual-check.html` |
| 5 | B3 관리 기록 보관 안내 | D+395 | `b3-record-keeping.html` |

- 고객의 최신 작업 1건만 기준으로 한다.
- 같은 회사에 진행 중인 딜이 있거나 작업일 없이 수주된 작업이 있으면 보내지 않는다.
- 단계 1~3은 관리 앱의 리마인드 1~3차 칸에 체크한다. 단계 4·5는 칸이 없어 메일 기록(emailHistory)만 남긴다.

## 제목과 미리보기

| 메일 | 제목 (A안, 사용) | 제목 (B안, 예비) | 미리보기 문구 |
|---|---|---|---|
| A2 | `$%company%$ 에어컨, $%care_season%$ 사용 안내문 1장` | `$%work_date_kr%$에 세척한 에어컨, 효과를 오래 지키는 법` | 직원분들께 그대로 전달하실 수 있게 정리했습니다 |
| A3 | `$%company%$ 에어컨 세척 반년, 관리 기록을 정리해 드립니다` | `$%company%$ 세척 반년, 1분만 의견을 들려주세요` | 보고나 인수인계에 그대로 쓰실 수 있는 1장입니다 |
| B1 | `$%company%$ 에어컨 관리 기록 — $%work_month%$ 작업` | `$%work_month%$ 세척 기록과 서류를 정리했습니다` | 필요하신 서류는 회신 한 줄이면 보내 드립니다 |
| B2 | `$%company%$ 에어컨, 세척 1년 사용 점검 3가지` | `$%due_month%$이면 세척 1년입니다` | 필터·냄새·물 떨어짐, 3가지만 확인해 보세요 |
| B3 | `$%company%$ 에어컨 관리 기록을 계속 보관합니다` | `$%work_month%$ 세척 기록, 필요하실 때 회신만 주세요` | 이 메일 이후로 개별 안내는 보내지 않습니다 |

## 스티비 설정 (5통 공통)

- 주소록: AIRTOR 고객
- 트리거: API 직접 요청
- 발송: 즉시 발송, 평일 9~18시
- 중복: 트리거 중복 허용, 제한 1일 (재구매 고객은 다음 해에 같은 메일을 다시 받는다)
- 발신자: 에어터 <relation@airtor.co.kr>. relation@은 네이버웍스 그룹 메일링 리스트다. 고객 회신은 그룹 멤버 전원이 받는다.
- 본문: 템플릿 단계에서 'HTML 에디터로 만들기'를 고르고 파일 내용을 그대로 붙여 넣는다. 맨 위 `<!-- -->` 주석 줄은 빼도 된다.
  - 스티비는 `<style>`, `<head>`, `<body>` 같은 태그를 받지 않는다. 그래서 인라인 스타일과 표만 쓴다.
- A3 설문 링크: `SURVEY_URL`을 네이버 폼 주소로 바꾼다. 붙여 넣기 전에 바꾼다.
- 서명 로고: `https://docs.airtor.co.kr/mail/airtor-logo.png` (`public/mail/airtor-logo.png`, 293×88, 메일에는 110×33으로 싣는다). 스티비 HTML 에디터에는 그림을 올리는 곳이 없어서 우리 도메인에 둔다.
- 상태: 사용자 최종 승인 전에는 '작성 중'으로 둔다. 작성 중이거나 일시정지 상태일 때 들어온 트리거는 버려진다.

## 개인화 키 (스티비 주소록 사용자 정의 필드)

트리거 본문에 실어 보내는 값이다. 스티비 주소록에 같은 영문 키의 필드가 있어야 한다. 기본값은 테스트 발송에서만 보인다. 실제 발송은 서버가 언제나 값을 채운다(functions/_lib/followups.ts `mergeFieldsFor`).

| 키 | 필드 이름 | 예 | 기본값 |
|---|---|---|---|
| name | 담당자 이름 | 김담당 | 담당자 |
| company | 회사명 | 에어터초등학교 | 고객사 |
| project_name | 작업명 | 에어컨전문세척 | 에어컨 세척 |
| work_date_kr | 작업일 | 2026년 9월 26일 | 작업일 |
| work_month | 작업월 | 2026년 9월 | 작업월 |
| due_date_kr | 세척 1년 되는 날 | 2027년 9월 26일 | 세척 1년 되는 날 |
| due_month | 세척 1년 되는 달 | 2027년 9월 | 내년 |
| equipment | 설비 내역 | 1way 천정형 22대, 4way 천정형 2대 | 작업한 설비 |
| manager | 담당 매니저 | 에어터 | 에어터 |
| care_season | 계절 이름 | 난방철 | 지금 계절 |
| care_line | 계절 관리법 한 문장 | 겨울에 실외기에서 김이 나는 것은… | 필터는 한 달에 한 번 청소해 주세요. |

이미 있는 필드(name, position, company, grade, customer_status, account_manager, last_work_date, project_name, total_quantity, quotation_amount)에 위 표의 새 키 8개(work_date_kr, work_month, due_date_kr, due_month, equipment, manager, care_season, care_line)를 더한다. 그러면 18개가 된다(스탠다드 최대 30개).

계절 관리법은 메일이 도착하는 달로 고른다. 주말에 들어온 트리거는 월요일 기준으로 본다.

| 도착 달 | care_season |
|---|---|
| 3~4월 | 냉방 준비 |
| 5~8월 | 냉방철 |
| 9~10월 | 냉방 마감 |
| 11~2월 | 난방철 |

## 단계 설정 (Cloudflare Pages env `NEWSLETTER_FOLLOWUPS`)

autoEmailId는 스티비 자동 이메일의 트리거 URL `https://stibee.com/api/v1.0/auto/{autoEmailId}` 끝부분이다. 공개 저장소이므로 실제 값은 여기 적지 않는다.

```json
{"grace":30,"stages":[
 {"stage":1,"days":45,"autoEmailId":"<A2>","label":"A2 사용 가이드"},
 {"stage":2,"days":150,"autoEmailId":"<A3>","label":"A3 반년 점검"},
 {"stage":3,"days":300,"altDays":240,"altWorkMonths":[7,8,9,10],"autoEmailId":"<B1>","label":"B1 1년 관리 기록"},
 {"stage":4,"days":335,"autoEmailId":"<B2>","label":"B2 1년 사용 점검"},
 {"stage":5,"days":395,"autoEmailId":"<B3>","label":"B3 기록 보관 안내"}
]}
```

- grace(유예 일수)는 단계 간 최소 간격 35일보다 작아야 한다.
- A단계만 먼저 켤 때는 stage 1·2만 넣는다.
- env를 바꾼 뒤에는 Cloudflare Pages에서 Retry deployment를 눌러야 반영된다.

## 가동 (사용자 최종 승인 뒤에만)

1. DNS(SPF·DKIM)와 발신자 인증을 확인한다(lab.stibee.com).
2. 켤 메일을 스티비에서 '실행 중'으로 바꾼다.
3. env에 단계를 넣고 GitHub Secret `NEWSLETTER_CRON_SECRET`을 등록한다. 정기 실행은 아직 돌지 않는다.
4. GitHub Actions에서 newsletter-followups 워크플로를 수동으로 실행한다. 입력값은 `testEmail`(내부 주소)과 `testStage`다. 받은 메일로 개인화 값과 SPF·DKIM 통과를 확인한다.
5. 다시 수동으로 실행하되 `dryRun=false`, `limit=1`로 둔다. 실제 1건만 보내고 스티비 상세 통계와 고객 메일 기록을 확인한다.
6. GitHub 저장소 변수 `NEWSLETTER_LIVE`=`true`로 둔다. 다음 날 06:30(KST)부터 매일 자동으로 돈다.

메일을 고치려고 스티비에서 일시정지할 때는 `NEWSLETTER_LIVE`도 함께 끈다. 일시정지 중에 들어온 트리거는 버려지는데, 관리 앱은 그 메일을 보낸 것으로 기록한다.

## A3 1분 설문 (네이버 폼)

1. 세척 효과가 지금도 이어지고 있나요? (1~5점)
2. 작업 뒤 받으신 자료와 안내가 업무에 도움이 됐나요? (1~5점)
3. 동료 기관에 에어터를 추천하실 의향은? (0~10점)
4. 더 나아지면 좋을 점 (선택, 주관식)

1~2점 응답은 담당자가 1영업일 안에 전화한다. 처리는 A/S 비용 관리 원칙을 따른다(사진 먼저, 무상 방문은 작업 하자만).
