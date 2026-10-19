#!/usr/bin/env bash
# 카페24 PHP 5.2.x 호환성 lint
# 사용: bash scripts/check_php_compat.sh [파일경로...]
# 인자 없으면 api/*.php 전체 검사. 위반 발견 시 exit code 1.
#
# 제약 상세: api/COMPATIBILITY.md

set -u

# 검사 대상 결정
if [ $# -gt 0 ]; then
  TARGETS="$@"
else
  TARGETS=$(find api -maxdepth 2 -name '*.php' 2>/dev/null)
fi

if [ -z "$TARGETS" ]; then
  echo "PHP 파일을 찾지 못했습니다."
  exit 0
fi

VIOLATIONS=0
total=$(echo "$TARGETS" | wc -w | tr -d ' ')
echo "Scanning $total PHP file(s) for cafe24 incompatibilities..."
echo ""

# ============================================================
# Pattern 1: 클로저 (PHP 5.3+) — function(...) { ... } 형태
#  허용: 명명 함수 `function name(...) { ... }`
#  금지: 익명 함수 `function (...) { ... }`, `function ($v) ...`
# ============================================================
check_closures() {
  local files="$1"
  # 'function' 뒤에 식별자가 아닌 공백+(가 오는 경우만 매치 (= anonymous)
  local hits=$(grep -nE 'function[[:space:]]*\(' $files 2>/dev/null)
  if [ -n "$hits" ]; then
    echo "❌ [1] 클로저(익명함수) 사용 — 카페24 PHP에서 파싱 에러 발생"
    echo "$hits" | sed 's/^/    /'
    echo ""
    return 1
  fi
  return 0
}

# ============================================================
# Pattern 2: 2-인자 json_encode with flag constant — `json_encode($v, JSON_*)`
# 안전: `json_encode(array('a'=>'b', 'c'=>'d'))` (array 내부 콤마)
# 위험: `json_encode($v, JSON_UNESCAPED_UNICODE)` (실제 flag 인자)
# 휴리스틱: 같은 라인에 json_encode와 JSON_* 상수가 동시 등장 + 코멘트 아님
# ============================================================
check_json_encode_2arg() {
  local files="$1"
  local hits=$(grep -nE 'json_encode\b' $files 2>/dev/null \
              | grep -E 'JSON_(UNESCAPED|PRETTY|HEX|FORCE|NUMERIC|PARTIAL|PRESERVE|THROW)_[A-Z]+' \
              | grep -vE ':[[:space:]]*(//|#|\*)' || true)
  if [ -n "$hits" ]; then
    echo "❌ [2] 2-인자 json_encode + JSON flag 상수 — 'expects exactly 1 parameter' 경고 + NULL 반환"
    echo "$hits" | sed 's/^/    /'
    echo ""
    return 1
  fi
  return 0
}

# ============================================================
# Pattern 3: JSON_*_* 상수 단독 사용 (json_encode 외 — define으로 정의되어 있을 수 있어 검사)
# ============================================================
check_json_flag_constants() {
  local files="$1"
  # 코멘트 라인(`*`, `//`, `#`) 제외
  local hits=$(grep -nE 'JSON_(UNESCAPED|PRETTY|HEX|FORCE|NUMERIC|PARTIAL|PRESERVE|THROW)_[A-Z]+' $files 2>/dev/null \
              | grep -vE ':[[:space:]]*(\*|//|#)')
  if [ -n "$hits" ]; then
    echo "❌ [3] PHP 5.4+ JSON flag 상수 — 카페24에서 미정의 → 문자열로 해석"
    echo "$hits" | sed 's/^/    /'
    echo ""
    return 1
  fi
  return 0
}

# ============================================================
# Pattern 4: 단축 배열 리터럴 `[...]` (PHP 5.4+, 회피 권장)
#  주: false positive 가능 (배열 인덱싱 $arr[$i] 등). 라인 시작 또는 = 뒤의 [ 만 잡음.
# ============================================================
check_short_array() {
  local files="$1"
  # `= [` 또는 `return [` 또는 라인 시작 `[`
  local hits=$(grep -nE '(=[[:space:]]*\[|return[[:space:]]+\[|^\s*\[)' $files 2>/dev/null | grep -vE '//|#|\*' || true)
  if [ -n "$hits" ]; then
    echo "⚠️  [4] 단축 배열 리터럴 의심 — array() 권장 (false positive 가능, 검토 필요)"
    echo "$hits" | sed 's/^/    /'
    echo ""
    # 경고만, exit 1 안 함
  fi
  return 0
}

# ============================================================
# Pattern 5: silent failure — `if (!$stmt) return;` (반환값/로그 없는 종료)
# ============================================================
check_silent_failure() {
  local files="$1"
  local hits=$(grep -nE 'if[[:space:]]*\(![[:space:]]*\$stmt\)[[:space:]]*\{?[[:space:]]*return[[:space:]]*;' $files 2>/dev/null)
  if [ -n "$hits" ]; then
    echo "❌ [5] silent DB 실패 — error_log() 없이 return"
    echo "$hits" | sed 's/^/    /'
    echo "    → if (!\$stmt) { error_log('...'); return false; } 패턴 사용"
    echo ""
    return 1
  fi
  return 0
}

# ============================================================
# Pattern 6: PHP 5.3+/5.4+ 함수·문법 — 운영 PHP(5.4 미만, 2026-10-19 실측)에 없음
#  http_response_code() 는 호출 순간 Fatal error → 오류 응답이 빈 500(또는 200 + HTML)으로 나간다.
#  ?: / ?? 는 파싱 에러, json_last_error/array_column 은 Fatal, __DIR__ 는 리터럴로 해석될 수 있다.
# ============================================================
check_modern_php() {
  local files="$1"
  local hits=$(grep -nE 'http_response_code[[:space:]]*\(|json_last_error[[:space:]]*\(|array_column[[:space:]]*\(|__DIR__|\?\?|\?:' $files 2>/dev/null \
              | grep -vE ':[[:space:]]*(\*|//|#)')
  if [ -n "$hits" ]; then
    echo "❌ [6] PHP 5.3+/5.4+ 함수·문법 — 카페24에서 Fatal/파싱 에러"
    echo "$hits" | sed 's/^/    /'
    echo "    → header('HTTP/1.1 …') (sync_lib.php sl_status), 일반 삼항, dirname(__FILE__)"
    echo ""
    return 1
  fi
  return 0
}

# ============================================================
# Pattern 7: empty()/isset() 안의 함수 호출, 호출 결과 바로 인덱싱 — PHP 5.5/5.4 미만 Fatal
# ============================================================
check_call_in_empty() {
  local files="$1"
  local hits=$(grep -nE '(empty|isset)[[:space:]]*\([[:space:]]*[A-Za-z_]+[[:space:]]*\(|[A-Za-z_]\([^()]*\)\[' $files 2>/dev/null \
              | grep -vE ':[[:space:]]*(\*|//|#)')
  if [ -n "$hits" ]; then
    echo "❌ [7] empty(함수()) 또는 함수()[...] — 카페24 PHP 에서 Fatal"
    echo "$hits" | sed 's/^/    /'
    echo "    → 결과를 변수에 담은 뒤 검사/인덱싱"
    echo ""
    return 1
  fi
  return 0
}

# 실행
check_closures "$TARGETS" || VIOLATIONS=$((VIOLATIONS+1))
check_json_encode_2arg "$TARGETS" || VIOLATIONS=$((VIOLATIONS+1))
check_json_flag_constants "$TARGETS" || VIOLATIONS=$((VIOLATIONS+1))
check_short_array "$TARGETS"  # 경고만
check_silent_failure "$TARGETS" || VIOLATIONS=$((VIOLATIONS+1))
check_modern_php "$TARGETS" || VIOLATIONS=$((VIOLATIONS+1))
check_call_in_empty "$TARGETS" || VIOLATIONS=$((VIOLATIONS+1))

if [ "$VIOLATIONS" -eq 0 ]; then
  echo "✅ 모든 PHP 호환성 검사 통과"
  exit 0
else
  echo "================================================================"
  echo "❌ $VIOLATIONS 개 카테고리에서 위반 발견 — 위 항목을 수정한 뒤 커밋"
  echo "    상세 가이드: api/COMPATIBILITY.md"
  exit 1
fi
