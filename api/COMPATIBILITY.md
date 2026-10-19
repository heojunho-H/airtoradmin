# 카페24 PHP 호환성 제약

이 디렉토리(`api/*.php`)는 카페24 호스팅의 PHP 런타임에서 실행됩니다. 카페24는 **PHP 5.2.x 계열로 추정**되며 (정확한 버전은 카페24 어드민에서만 확인 가능), 모던 PHP 문법/상수 일부가 동작하지 않습니다.

새 PHP 코드를 작성할 때 반드시 아래 제약을 지켜야 합니다. 어기면 라이브 사이트에 **파싱 에러 또는 silent failure**가 발생합니다.

## ❌ 사용 금지

| 기능 | 도입 PHP 버전 | 카페24 동작 | 대체 방법 |
|---|---|---|---|
| 클로저 `function($v){...}` | 5.3 | `T_FUNCTION, expecting ')'` 파싱 에러 → API 전체 다운 | 명명 함수, switch/if-chain, 문자열 식별자 디스패치 |
| `json_encode($v, FLAG)` 2-인자 | 5.3 | `expects exactly 1 parameter, 2 given` 경고 → **NULL 반환** (silent data loss) | `json_encode($v)` (1-인자만) |
| `JSON_UNESCAPED_UNICODE`, `JSON_PRETTY_PRINT` 등 JSON flag 상수 | 5.4 | 상수 미정의 → 문자열 리터럴 `"JSON_UNESCAPED_UNICODE"`로 해석 | flag 인자 자체를 사용 안 함. unicode는 `\uXXXX` escape로 출력되어도 디코드 결과는 동일 |
| 단축 배열 `[]` 리터럴 | 5.4 | (이론상 작동하지만 안전을 위해) | `array()` 사용 |
| `__DIR__` 매직 상수 | 5.3 | 업로드 과정에서 간헐적으로 리터럴로 해석되는 사례 보고됨 | `dirname(__FILE__)` 사용 |
| `http_response_code()` | 5.4 | **실측(2026-10-19): 정의되지 않은 함수 → Fatal error.** 오류 응답이 빈 500(또는 display_errors 가 켜진 파일은 200 + HTML)으로 나간다 | `header('HTTP/1.1 500 Internal Server Error')` — `sync_lib.php` `sl_status()` |
| `?:` 축약 삼항, `??` | 5.3 / 7.0 | 파싱 에러 | 일반 삼항 `isset($a) ? $a : $b` |
| `json_last_error()`, `array_column()` | 5.3 / 5.5 | Fatal error | `json_decode` 결과를 `is_array` 로 검사, 반복문 |
| `empty(함수())`, `함수()[0]` | 5.5 / 5.4 | Fatal error | 결과를 변수에 담은 뒤 검사·인덱싱 |
| 단축 echo 태그 `<?=` | (short_open_tag 의존) | 호스팅 설정에 따라 미작동 가능 | `<?php echo ?>` 명시 |
| 네임스페이스 `namespace` | 5.3 | 미검증 (피하는 게 안전) | 함수명 prefix |
| Late Static Binding `static::` | 5.3 | 미검증 | 명시적 클래스명 참조 |
| Traits | 5.4 | 미검증 | 인터페이스 + composition |
| Generators `yield` | 5.5 | 미검증 | 일반 배열 또는 반복자 |

## ✅ 허용되는 PHP 기능

- 클래스, 인터페이스 (PHP 5.0+)
- `mysqli`, `PDO`
- `json_encode($v)` / `json_decode($v, true)` (1-인자)
- `call_user_func_array`, 가변 인자
- 매직 상수 `__FILE__`, `__LINE__`, `__FUNCTION__`
- `array()`, `list()` (구버전 문법)

## 에러 처리 패턴

`mysqli` prepared statement는 **반드시** 다음 패턴으로 검사:

```php
$stmt = $conn->prepare($sql);
if (!$stmt) {
    error_log('prepare failed in ' . __FUNCTION__ . ': ' . $conn->error);
    return false;
}
if (!$stmt->execute()) {
    error_log('execute failed in ' . __FUNCTION__ . ': ' . $stmt->error);
    $stmt->close();
    return false;
}
$stmt->close();
return true;
```

호출자는 반환값을 받아서 HTTP 500을 응답해야 합니다. **silent return은 금지** — 사용자가 데이터 손실을 인지할 방법이 없어집니다.

## 자동 검증

PR 또는 commit 전:

```bash
bash scripts/check_php_compat.sh
```

위 스크립트가 위 금지 패턴을 grep으로 잡아냅니다. CI(GitHub Actions)에서도 같은 스크립트를 돌리는 게 권장됩니다.

## 딜·고객·프로젝트 동기화 (v2, 2026-10-19)

- 세 API 의 v2(`deals_api_v2.php` · `customers_api_v2.php` · `projects_api_v2.php`)는 공용 함수 `sync_lib.php` 를 `require_once dirname(__FILE__) . '/sync_lib.php'` 로 쓴다.
  함수는 모두 `sl_` 접두사(다른 파일의 `normalizeCompanyName` 등과 이름 충돌 방지), 닫는 `?>` 없음, BOM 없음.
- 쓰기는 `GET_LOCK('airtor2014_sync', 5)` 로 한 줄로 세운다(이름은 공유 MySQL 서버 전체에서 유일해야 함). 못 얻어도 저장은 진행하고 로그만 남긴다.
- 상태 코드는 `sl_status()` / `sl_out()` 로 보낸다. 규칙·API: `docs/data-sync.md`.
- 예전 `*_api.php` 는 되돌리기용으로 서버에 남겨 둔다(프록시는 v2 를 가리킴).
- DB 접속 정보는 서버 전용 `db_config.php`(.gitignore)에만 둔다 — v2 파일은 인라인 접속 정보 없이 이 파일만 읽는다.
- 업로드 전 검사: `bash scripts/check_php_compat.sh api/sync_lib.php api/*_v2.php` (예전 파일은 `http_response_code` 때문에 [6] 에 걸린다 — 고칠 때 함께 정리).

## 데이터 정합성 체크

배포 직후 또는 의심 상황 발생 시:

```
curl https://airtor.co.kr/api/health_check.php
```

성공 시 200/`healthy:true`, 부정합 발견 시 503/`healthy:false` + issues 배열을 반환합니다.

## 변경 히스토리

이번 시즌에서 이 환경 한계 때문에 발생했던 실제 사고:
- 2026-05-12: `JSON_UNESCAPED_UNICODE` flag 사용으로 `syncDealToCustomer` INSERT 분기가 silent 실패 → 진성캐스트 외 9건의 success deal이 고객으로 자동 등록되지 않음. 사용자 수동 발견 후 PUT 재트리거로 복구.
- 2026-05-12: customers_api.php의 부분-PUT에 클로저 사용 → 파싱 에러로 customers API 전체 다운 (managers/subcontractors는 정상).
- 2026-05-12: customers_api.php의 `__DIR__`이 업로드 후 미해결 → db_config.php를 찾지 못해 API 다운. `dirname(__FILE__)` + 인라인 자격증명 폴백으로 해결.

근본 원인 분석: [회고 문서 또는 PR 설명 참조]
