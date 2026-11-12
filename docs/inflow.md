# 문의 유입 경로 표시 (2026-11-12)

영업 화면에 "이 문의가 구글 광고·구글 검색·네이버 광고·네이버 검색 … 중 어디로 들어왔는지"를 배지로 보인다.
적용 뒤 문의부터 있고, 지난 문의는 기록이 없다.

## 흐름

1. **홈페이지**(별도 비공개 저장소 `airtor-homepage`, `site/inc/src_lib.php` — `foot.lib.php` 가 모든 페이지에서 부름)
   - 방문할 때 들어온 경로를 판정해 브라우저 localStorage `atr_src` 에 90일 남긴다(마지막 외부 유입 기준).
     쿠키를 쓰지 않는 이유: 홈페이지 방화벽(GGCastle)이 쿠키 값을 검사해 패턴이 맞으면 빈 화면으로 끝낸다.
   - 문의 폼이 `online_update.php` 로 제출될 때 요청사항(`on_content`) 끝에 표시를 붙인다.
     `HTMLFormElement.prototype.submit` 을 감싸므로 상담·자가진단·증명서 폼 모두 해당된다.
   - 스위치 `site/inc/src.flag`(없으면 미리보기 쿠키일 때만).
2. **DB·API 변경 없음** — 표시는 `Gn_Online.on_content` → 딜 `requirements` 로 그대로 온다.
3. **CRM** `src/lib/inflow.ts` 가 읽고 `SalesPage.tsx` 가 보인다.
   - 표 '문의 등록일' 칸·모바일 카드: 배지
   - 상세 '문의 등록일' 타일: 배지 + 검색어 + 들어온 날
   - 상세 '세부 전달사항' 보기: 표시를 뺀 글(편집칸은 원문)
   - 엑셀 내보내기 맨 끝 '유입 경로'

## 표시 형식

`[유입: 네이버 광고 · 시스템에어컨 청소 · 11-12 방문]` — 라벨 · 검색어(있을 때) · 들어온 날(MM-DD)

| 판정 | 라벨 |
|---|---|
| `gclid`·`gbraid`·`wbraid` | 구글 광고 |
| `n_media`·`n_query`·`n_keyword`·`n_ad`·`NaPm`, 리퍼러 `ad.search.naver.com`·`ader.naver.com` | 네이버 광고(검색어 `n_query`) |
| `utm_source` | `UTM 소스 매체` |
| 리퍼러 google | 구글 검색(검색어 없음 — 구글이 숨김) |
| 리퍼러 search.naver.com | 네이버 검색 |
| blog / cafe / map·place / 그 밖의 naver | 네이버 블로그 / 카페 / 지도 / 기타 |
| search.daum.net, bing.com | 다음 검색, 빙 검색 |
| 그 밖의 외부 리퍼러 | 다른 사이트 · 도메인 |
| 기록 없음 | 직접/알 수 없음 |

- 검색어·도메인은 한글·숫자·영문·공백(도메인은 점·하이픈)만 30자, 영문은 대문자(방화벽 패턴 회피). CRM 은 도메인만 소문자로 보인다.
- 직원이 표시를 지우면 배지도 사라진다. 직원이 직접 만든 딜(전화 문의 등)에는 표시가 없다.

## 되돌리기

- 홈페이지: `site/inc/src.flag` 삭제(표시를 더는 붙이지 않음) 또는 `tools/ftp.py rollback`.
- CRM: 이 커밋을 되돌리면 배지만 사라진다(요청사항 글은 그대로).
