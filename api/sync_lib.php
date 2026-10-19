<?php
/**
 * ⚠️ 카페24 PHP 5.2.x 호환 코드 — 모던 문법 금지 (api/COMPATIBILITY.md)
 *    클로저 · ?: · ?? · [] · __DIR__ · http_response_code · json_last_error · 2-인자 json_encode ·
 *    empty(함수호출) · 호출 결과 바로 인덱싱 금지
 *
 * 딜(Gn_Online) ↔ 고객 작업이력(airtor_customers.work_history) ↔ 프로젝트(airtor_projects) 동기화 공용 함수.
 * deals_api_v2.php · customers_api_v2.php · projects_api_v2.php 가 require_once 한다. 규칙: docs/data-sync.md
 *
 * 연결: 딜 #N ↔ 작업이력 항목(dealId=N) ↔ 프로젝트(deal_id=N).
 *  - 연결은 딜이 수주로 바뀔 때(또는 처음부터 수주로 등록할 때)만 만든다 — sl_link_deal
 *  - 그 뒤에는 수주 여부와 상관없이 "바뀐 항목만" 서로 전파한다 — sl_push_deal / sl_push_wh / sl_push_customer
 *  - 전파 함수는 서로를 부르지 않는다(재귀·무한 전파 없음). DB 를 직접 고치므로 API 를 다시 타지 않는다.
 *  - 수주 취소·딜 삭제는 연결을 지우지 않는다(화면에서 '수주 취소' 표시만 — 사용자 결정 2026-10-19).
 *
 * 함수는 모두 sl_ 접두사(다른 파일의 normalizeCompanyName 등과 이름 충돌 방지). 실패는 error_log 후 false.
 */

define('SL_LOCK_NAME', 'airtor2014_sync');
define('SL_MAX_JSON', 60000); // TEXT(65,535) 잘림 방지 — PHP 5.2 json_encode 는 한글 1자를 6바이트로 쓴다

// ============================================================
// HTTP · 잠금 · 입출력
// ============================================================

// http_response_code() 는 운영 PHP 에 없다(5.4 미만, 2026-10-19 실측) — 상태줄을 직접 보낸다
function sl_status($code) {
    $texts = array(
        200 => 'OK', 204 => 'No Content', 400 => 'Bad Request', 404 => 'Not Found',
        405 => 'Method Not Allowed', 409 => 'Conflict', 500 => 'Internal Server Error',
    );
    $text = isset($texts[$code]) ? $texts[$code] : 'OK';
    header('HTTP/1.1 ' . $code . ' ' . $text);
}

function sl_headers() {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}

function sl_input() {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') return null;
    $v = json_decode($raw, true);
    return is_array($v) ? $v : null;
}

// 세 API 의 쓰기를 한 줄로 세운다 — work_history JSON 을 읽고-고치고-쓰는 사이에 다른 쓰기가 끼지 않게.
// 이름은 공유 MySQL 서버 전체에서 유일해야 한다. 못 얻어도 저장은 진행한다(로그만).
function sl_lock($conn) {
    $res = $conn->query("SELECT GET_LOCK('" . SL_LOCK_NAME . "', 5)");
    if (!$res) {
        error_log('[sl_lock] ' . $conn->error);
        return false;
    }
    $row = $res->fetch_row();
    $res->free();
    $ok = ($row && (string)$row[0] === '1');
    if (!$ok) error_log('[sl_lock] lock not acquired');
    $GLOBALS['SL_LOCKED'] = $ok;
    return $ok;
}

function sl_unlock($conn) {
    if (empty($GLOBALS['SL_LOCKED'])) return;
    $res = $conn->query("SELECT RELEASE_LOCK('" . SL_LOCK_NAME . "')");
    if ($res) $res->free();
    $GLOBALS['SL_LOCKED'] = false;
}

function sl_out($conn, $code, $arr) {
    if ($conn) {
        sl_unlock($conn);
        $conn->close();
    }
    sl_status($code);
    echo json_encode($arr);
    exit;
}

// ============================================================
// DB 헬퍼
// ============================================================

function sl_rows($conn, $sql) {
    $res = $conn->query($sql);
    if (!$res) {
        error_log('[sl_rows] ' . $conn->error . ' :: ' . substr($sql, 0, 160));
        return false;
    }
    $rows = array();
    while ($row = $res->fetch_assoc()) {
        $rows[] = $row;
    }
    $res->free();
    return $rows;
}

// $values 는 0..n-1 인덱스 배열. bind_param 참조는 이 함수 안에서 만들고 바로 실행한다.
function sl_exec($conn, $sql, $types, $values, $tag) {
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        error_log('[' . $tag . '] prepare failed: ' . $conn->error);
        return false;
    }
    if ($types !== '') {
        $values = array_values($values);
        $refs = array($types);
        $n = count($values);
        for ($k = 0; $k < $n; $k++) {
            $refs[] = &$values[$k];
        }
        call_user_func_array(array($stmt, 'bind_param'), $refs);
    }
    if (!$stmt->execute()) {
        error_log('[' . $tag . '] execute failed: ' . $stmt->error);
        $stmt->close();
        return false;
    }
    $stmt->close();
    return true;
}

// $set: 컬럼 => array(bind 타입, 값). 값이 null 이면 SQL NULL.
function sl_update($conn, $table, $idCol, $id, $set, $tag, $extraWhere) {
    if (count($set) === 0) return true;
    $clauses = array();
    $types = '';
    $values = array();
    foreach ($set as $col => $tv) {
        $clauses[] = $col . ' = ?';
        $types .= $tv[0];
        $values[] = $tv[1];
    }
    $types .= 'i';
    $values[] = intval($id);
    $sql = 'UPDATE ' . $table . ' SET ' . implode(', ', $clauses) . ' WHERE ' . $idCol . ' = ?' . $extraWhere;
    return sl_exec($conn, $sql, $types, $values, $tag);
}

// ============================================================
// 값 변환
// ============================================================

function sl_str($v) {
    if ($v === null) return '';
    if (is_bool($v)) return $v ? '1' : '';
    if (is_array($v)) return '';
    return (string)$v;
}

function sl_is_ymd($s) {
    if (!is_string($s)) return false;
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) return false;
    $y = intval($m[1]);
    if ($y < 2000 || $y > 2099) return false;
    return checkdate(intval($m[2]), intval($m[3]), $y);
}

// 회사명 정규화 — deals_api.php normalizeCompanyName / src/lib/company.ts 와 같은 규칙
function sl_normalize_company($name) {
    $name = trim(sl_str($name));
    if ($name === '') return '';
    $patterns = array(
        '/주식회사\s*/u', '/\(주\)\s*/u',
        '/유한회사\s*/u', '/\(유\)\s*/u',
        '/사단법인\s*/u', '/\(사\)\s*/u',
        '/재단법인\s*/u', '/\(재\)\s*/u',
        '/의료법인\s*/u', '/\(의\)\s*/u',
        '/학교법인\s*/u', '/\(학\)\s*/u',
    );
    foreach ($patterns as $p) {
        $r = preg_replace($p, '', $name);
        if ($r !== null) $name = $r;
    }
    $r = preg_replace('/\s+/u', '', $name);
    return ($r === null) ? $name : $r;
}

// 견적금액 문자열 → 원 ("₩790만", "₩1억 2,000만", "₩115.5만", "1,155,000원", "7900000")
function sl_parse_amount($v) {
    if ($v === null || $v === '') return 0;
    if (is_int($v)) return $v;
    if (is_float($v)) return intval(round($v));
    $s = str_replace(array(',', ' ', "\t", '₩', '원'), '', (string)$v);
    if ($s === '') return 0;
    $total = 0.0;
    $unit = false;
    if (preg_match('/([0-9]+(\.[0-9]+)?)억/u', $s, $m)) {
        $total += floatval($m[1]) * 100000000;
        $unit = true;
    }
    if (preg_match('/([0-9]+(\.[0-9]+)?)만/u', $s, $m)) {
        $total += floatval($m[1]) * 10000;
        $unit = true;
    }
    if ($unit) {
        $rest = preg_replace('/[0-9]+(\.[0-9]+)?(억|만)/u', '', $s);
        $rest = preg_replace('/[^0-9.]/', '', sl_str($rest));
        if ($rest !== '' && $rest !== '.') $total += floatval($rest);
        return intval(round($total));
    }
    $digits = preg_replace('/[^0-9.]/', '', $s);
    if ($digits === '' || $digits === '.') return 0;
    return intval(round(floatval($digits)));
}

// 원 → 딜 견적 문자열 — src/lib/ai/intake.ts amountText 와 같다 (만 원 단위면 "₩115만", 아니면 "1155000")
function sl_amount_text($won) {
    $won = intval(round(floatval($won)));
    if ($won % 10000 === 0) return '₩' . number_format($won / 10000) . '만';
    return (string)$won;
}

// 수주 판정 — src/lib/dealSync.ts isWonDeal 과 같다. 성공여부가 우선, 진행상태 '수주확정'은 성공여부가 진행중일 때만.
function sl_is_won($deal) {
    $s = isset($deal['status']) ? $deal['status'] : '';
    $ss = isset($deal['successStatus']) ? $deal['successStatus'] : '';
    if ($ss === 'success') return true;
    return ($s === 'confirmed' && $ss === 'in-progress');
}

// ============================================================
// 딜 (Gn_Online)
// ============================================================

function sl_deal_cols() {
    return 'on_num, on_regist, on_subject, on_username, on_mobile, on_phone, on_email, on_fax, '
        . 'on_option1, on_option2, on_content, on_memo, on_viewch, on_option3, on_option4, on_option5, '
        . 'on_link1, on_link2, on_visit_date, on_userfile1_oname, on_userfile1_rname, '
        . 'on_userfile2_oname, on_userfile2_rname, on_userfile3_oname, on_userfile3_rname';
}

// DB 행 → API 모양 (v1 GET 과 같은 정규화 — 문의 폼이 on_option3/4/5 에 넣는 값은 기본값으로)
function sl_deal_api($row) {
    $regDate = '';
    if ($row['on_regist'] && is_numeric($row['on_regist'])) {
        $regDate = date('Y-m-d', intval($row['on_regist']));
    } else if ($row['on_regist']) {
        $regDate = substr($row['on_regist'], 0, 10);
    }

    $validStatuses = array('new', 'call', 'quote-sent', 'quote-call', 'price-negotiation', 'schedule', 'confirmed');
    $rawStatus = ($row['on_option3'] !== '' && $row['on_option3'] !== null) ? $row['on_option3'] : '';
    $statusVal = in_array($rawStatus, $validStatuses) ? $rawStatus : 'new';

    $validSuccess = array('in-progress', 'success', 'failed', 'no-quote');
    $rawSuccess = ($row['on_option4'] !== '' && $row['on_option4'] !== null) ? $row['on_option4'] : '';
    $successVal = in_array($rawSuccess, $validSuccess) ? $rawSuccess : 'in-progress';

    $formMethods = array('simple', 'detail', 'file');
    $rawManager = $row['on_option5'] ? $row['on_option5'] : '';
    $managerVal = in_array($rawManager, $formMethods) ? '' : $rawManager;

    return array(
        'id' => intval($row['on_num']),
        'registrationDate' => $regDate,
        'company' => $row['on_subject'],
        'contactName' => $row['on_username'],
        'contactPosition' => $row['on_mobile'] ? $row['on_mobile'] : '',
        'phone' => $row['on_phone'] ? $row['on_phone'] : '',
        'email' => $row['on_email'],
        'address' => $row['on_fax'] ? $row['on_fax'] : '',
        'desiredService' => $row['on_option1'] ? $row['on_option1'] : '',
        'detailedQuantity' => $row['on_option2'] ? $row['on_option2'] : '',
        'requirements' => $row['on_content'],
        'managementMemo' => $row['on_memo'],
        'isChecked' => ($row['on_viewch'] === '1') ? true : false,
        'status' => $statusVal,
        'successStatus' => $successVal,
        'salesManager' => $managerVal,
        'quotationAmount' => $row['on_link1'] ? $row['on_link1'] : '',
        'confirmedWorkDate' => $row['on_link2'] ? $row['on_link2'] : '',
        'totalQuantity' => $row['on_visit_date'] ? intval($row['on_visit_date']) : 0,
        'file1Name' => $row['on_userfile1_oname'] ? $row['on_userfile1_oname'] : '',
        'file1Path' => $row['on_userfile1_rname'] ? $row['on_userfile1_rname'] : '',
        'file2Name' => $row['on_userfile2_oname'] ? $row['on_userfile2_oname'] : '',
        'file2Path' => $row['on_userfile2_rname'] ? $row['on_userfile2_rname'] : '',
        'file3Name' => $row['on_userfile3_oname'] ? $row['on_userfile3_oname'] : '',
        'file3Path' => $row['on_userfile3_rname'] ? $row['on_userfile3_rname'] : ''
    );
}

// 반환: array('raw' => DB 행, 'api' => API 모양) | null(없음) | false(DB 오류)
function sl_load_deal($conn, $id) {
    $rows = sl_rows($conn, 'SELECT ' . sl_deal_cols() . ' FROM Gn_Online WHERE on_num = ' . intval($id) . " AND on_site = 'airtor2014' LIMIT 1");
    if ($rows === false) return false;
    if (count($rows) === 0) return null;
    return array('raw' => $rows[0], 'api' => sl_deal_api($rows[0]));
}

function sl_deal_colmap() {
    return array(
        'company' => 'on_subject', 'contactName' => 'on_username', 'contactPosition' => 'on_mobile',
        'phone' => 'on_phone', 'email' => 'on_email', 'address' => 'on_fax',
        'desiredService' => 'on_option1', 'detailedQuantity' => 'on_option2',
        'requirements' => 'on_content', 'managementMemo' => 'on_memo', 'isChecked' => 'on_viewch',
        'status' => 'on_option3', 'successStatus' => 'on_option4', 'salesManager' => 'on_option5',
        'quotationAmount' => 'on_link1', 'confirmedWorkDate' => 'on_link2', 'totalQuantity' => 'on_visit_date',
    );
}

// 클라이언트가 보낸 딜 값 검증·정리. 보낸 키만 돌려준다. 잘못된 값이면 $error 에 사유.
function sl_deal_clean_input($in, &$error) {
    $error = '';
    $out = array();
    $map = sl_deal_colmap();
    foreach ($map as $k => $col) {
        if (!array_key_exists($k, $in)) continue;
        $v = $in[$k];
        if ($k === 'isChecked') {
            $out[$k] = !empty($in[$k]);
            continue;
        }
        if ($k === 'totalQuantity') {
            $n = intval($v);
            $out[$k] = ($n < 0) ? 0 : $n;
            continue;
        }
        $s = sl_str($v);
        if ($k === 'status' && !in_array($s, array('new', 'call', 'quote-sent', 'quote-call', 'price-negotiation', 'schedule', 'confirmed'), true)) {
            $error = '진행상태 값이 올바르지 않습니다.';
            return array();
        }
        if ($k === 'successStatus' && !in_array($s, array('in-progress', 'success', 'failed', 'no-quote'), true)) {
            $error = '성공여부 값이 올바르지 않습니다.';
            return array();
        }
        if ($k === 'confirmedWorkDate') {
            $s = trim($s);
            if ($s !== '' && !sl_is_ymd($s)) {
                $error = '확정작업일 형식이 올바르지 않습니다 (YYYY-MM-DD).';
                return array();
            }
        }
        $out[$k] = $s;
    }
    if (array_key_exists('registrationDate', $in)) {
        $s = trim(sl_str($in['registrationDate']));
        if ($s !== '') {
            if (!sl_is_ymd($s)) {
                $error = '문의 등록일 형식이 올바르지 않습니다 (YYYY-MM-DD).';
                return array();
            }
            $out['registrationDate'] = $s;
        }
    }
    return $out;
}

// 문의 등록일 저장값 — 원래 형식(유닉스 시각/문자열)과 시각(시:분:초)은 그대로 두고 날짜만 바꾼다
function sl_regist_value($ymd, $oldRaw) {
    $p = explode('-', $ymd);
    $y = intval($p[0]);
    $m = intval($p[1]);
    $d = intval($p[2]);
    $old = sl_str($oldRaw);
    if ($old !== '' && is_numeric($old)) {
        $ts = intval($old);
        return strval(mktime(intval(date('G', $ts)), intval(date('i', $ts)), intval(date('s', $ts)), $m, $d, $y));
    }
    if ($old !== '' && preg_match('/^\d{4}-\d{2}-\d{2}/', $old)) return $ymd . substr($old, 10);
    return strval(mktime(0, 0, 0, $m, $d, $y));
}

// 정리된 값 중 지금 값과 다른 것만 쓴다. 반환: 쓴 컬럼 수 | false
function sl_deal_write($conn, $id, $fields, $before) {
    $map = sl_deal_colmap();
    $api = $before['api'];
    $set = array();
    foreach ($fields as $k => $v) {
        if ($k === 'registrationDate') {
            if ($v !== $api['registrationDate']) $set['on_regist'] = array('s', sl_regist_value($v, $before['raw']['on_regist']));
            continue;
        }
        if (!isset($map[$k])) continue;
        $col = $map[$k];
        if ($k === 'isChecked') {
            if ((bool)$api['isChecked'] !== (bool)$v) $set[$col] = array('s', $v ? '1' : '0');
            continue;
        }
        if ($k === 'totalQuantity') {
            if (intval($api['totalQuantity']) !== intval($v)) $set[$col] = array('s', strval(intval($v)));
            continue;
        }
        if (sl_str($api[$k]) !== sl_str($v)) $set[$col] = array('s', sl_str($v));
    }
    if (count($set) === 0) return 0;
    if (!sl_update($conn, 'Gn_Online', 'on_num', $id, $set, 'sl_deal_write', " AND on_site = 'airtor2014'")) return false;
    return count($set);
}

// 저장 전후 API 값 비교 — 금액은 숫자로, 나머지는 문자열로
function sl_deal_changed($b, $a) {
    $keys = array('registrationDate', 'company', 'contactName', 'contactPosition', 'phone', 'email', 'address',
        'desiredService', 'detailedQuantity', 'requirements', 'managementMemo', 'isChecked', 'status',
        'successStatus', 'salesManager', 'quotationAmount', 'confirmedWorkDate', 'totalQuantity');
    $out = array();
    foreach ($keys as $k) {
        if ($k === 'quotationAmount') {
            if (sl_parse_amount($b[$k]) !== sl_parse_amount($a[$k])) $out[] = $k;
        } elseif ($k === 'isChecked') {
            if ((bool)$b[$k] !== (bool)$a[$k]) $out[] = $k;
        } elseif ($k === 'totalQuantity') {
            if (intval($b[$k]) !== intval($a[$k])) $out[] = $k;
        } elseif (sl_str($b[$k]) !== sl_str($a[$k])) {
            $out[] = $k;
        }
    }
    return $out;
}

// 딜 항목 → 작업이력 항목 키
function sl_job_map() {
    return array(
        'registrationDate' => 'inquiryDate', 'desiredService' => 'projectName', 'totalQuantity' => 'totalQuantity',
        'detailedQuantity' => 'detailedQuantity', 'quotationAmount' => 'quotationAmount',
        'salesManager' => 'accountManager', 'confirmedWorkDate' => 'workDate',
    );
}

// 딜 → 작업이력 작업 항목 7개 (확정작업일이 없으면 빈 값 — 예전처럼 오늘 날짜를 넣지 않는다)
function sl_job_from_deal($api) {
    return array(
        'inquiryDate' => sl_str($api['registrationDate']),
        'projectName' => sl_str($api['desiredService']),
        'totalQuantity' => intval($api['totalQuantity']),
        'detailedQuantity' => sl_str($api['detailedQuantity']),
        'quotationAmount' => sl_parse_amount($api['quotationAmount']),
        'accountManager' => sl_str($api['salesManager']),
        'workDate' => trim(sl_str($api['confirmedWorkDate'])),
    );
}

// ============================================================
// 고객 (airtor_customers)
// ============================================================

function sl_decode_list($json, &$ok) {
    $ok = true;
    if ($json === null) return array();
    $s = trim((string)$json);
    if ($s === '' || $s === 'null') return array();
    $v = json_decode($s, true);
    if (!is_array($v)) {
        $ok = false;
        return array();
    }
    return array_values($v);
}

// 작업이력을 풀어 _wh 에 넣는다. JSON 이 깨졌으면 _wh_ok=false — 이런 고객은 절대 덮어쓰지 않는다.
function sl_customer_prepare($row) {
    $ok = true;
    $row['_wh'] = sl_decode_list(isset($row['work_history']) ? $row['work_history'] : '', $ok);
    $row['_wh_ok'] = $ok;
    return $row;
}

function sl_customer($conn, $id) {
    $rows = sl_rows($conn, 'SELECT * FROM airtor_customers WHERE id = ' . intval($id) . ' LIMIT 1');
    if ($rows === false) return false;
    if (count($rows) === 0) return null;
    return sl_customer_prepare($rows[0]);
}

function sl_entry_deal_id($e) {
    if (!is_array($e) || !isset($e['dealId'])) return 0;
    $n = intval($e['dealId']);
    return ($n > 0) ? $n : 0;
}

function sl_entry_index($wh, $dealId) {
    foreach ($wh as $i => $e) {
        if (sl_entry_deal_id($e) === $dealId) return $i;
    }
    return -1;
}

function sl_linked_count($wh) {
    $n = 0;
    foreach ($wh as $e) {
        if (sl_entry_deal_id($e) > 0) $n++;
    }
    return $n;
}

// 이 딜 항목을 가진 고객들 (보통 1명, 예전 중복이면 여럿). id 오름차순.
function sl_find_holders($conn, $dealId) {
    $rows = sl_rows($conn, "SELECT * FROM airtor_customers WHERE work_history LIKE '%dealId%' ORDER BY id");
    if ($rows === false) return false;
    $out = array();
    foreach ($rows as $row) {
        $row = sl_customer_prepare($row);
        if (!$row['_wh_ok']) {
            error_log('[sl_find_holders] broken work_history JSON (customer=' . $row['id'] . ')');
            continue;
        }
        if (sl_entry_index($row['_wh'], $dealId) >= 0) $out[] = $row;
    }
    return $out;
}

function sl_holder_ids($holders) {
    $ids = array();
    foreach ($holders as $h) {
        $ids[] = intval($h['id']);
    }
    return $ids;
}

// 대표 고객 — 프로젝트가 가리키는 고객, 없으면 id 가 가장 작은 고객
function sl_main_holder($holders, $proj) {
    if (count($holders) === 0) return null;
    if ($proj && $proj['customer_id'] !== null) {
        foreach ($holders as $h) {
            if (intval($h['id']) === intval($proj['customer_id'])) return $h;
        }
    }
    return $holders[0];
}

// 회사명으로 고객 찾기 — 정확히 같은 이름 우선, 다음은 정규화가 같은 이름(id 오름차순)
function sl_find_customer_by_name($conn, $company, $excludeId) {
    $company = trim(sl_str($company));
    $norm = sl_normalize_company($company);
    if ($norm === '') return null;
    $rows = sl_rows($conn, 'SELECT * FROM airtor_customers ORDER BY id');
    if ($rows === false) return false;
    $normHit = null;
    foreach ($rows as $row) {
        if (intval($row['id']) === intval($excludeId)) continue;
        $c = trim(sl_str($row['company']));
        if ($c === $company) return sl_customer_prepare($row);
        if ($normHit === null && sl_normalize_company($c) === $norm) $normHit = $row;
    }
    return ($normHit === null) ? null : sl_customer_prepare($normHit);
}

// 작업 수 · 총수량 · 총금액 · 최근 작업일 · 고객상태 (CustomersPage recomputeCustomerTotals 와 같은 규칙)
function sl_wh_aggregate($wh, $curStatus, $curLast) {
    $qty = 0;
    $amt = 0.0;
    $last = '';
    foreach ($wh as $e) {
        if (!is_array($e)) continue;
        $qty += isset($e['totalQuantity']) ? intval($e['totalQuantity']) : 0;
        $amt += isset($e['quotationAmount']) ? floatval($e['quotationAmount']) : 0;
        $wd = isset($e['workDate']) ? sl_str($e['workDate']) : '';
        if ($wd !== '' && $wd > $last) $last = $wd;
    }
    $n = count($wh);
    if ($n >= 3) {
        $status = '충성고객';
    } elseif ($n === 2) {
        $status = '재구매';
    } else {
        $status = (sl_str($curStatus) !== '') ? sl_str($curStatus) : '신규';
    }
    return array(
        'deals' => $n,
        'total_quantity' => $qty,
        'total_amount' => sprintf('%.0f', $amt),
        'last_work_date' => $last, // 빈 값이면 저장하지 않는다(예전 값 유지)
        'customer_status' => $status,
    );
}

// 작업이력 + 집계 + 덧붙일 컬럼을 한 번에 저장
function sl_customer_save_wh($conn, $cust, $wh, $extraSet) {
    $json = json_encode(array_values($wh));
    if (!is_string($json) || strlen($json) > SL_MAX_JSON) {
        error_log('[sl_customer_save_wh] work_history encode failed or too large (customer=' . $cust['id'] . ')');
        return false;
    }
    $agg = sl_wh_aggregate($wh, isset($cust['customer_status']) ? $cust['customer_status'] : '', isset($cust['last_work_date']) ? $cust['last_work_date'] : '');
    $set = $extraSet;
    $set['work_history'] = array('s', $json);
    $set['deals'] = array('i', $agg['deals']);
    $set['total_quantity'] = array('i', $agg['total_quantity']);
    $set['total_amount'] = array('s', $agg['total_amount']);
    if ($agg['last_work_date'] !== '') $set['last_work_date'] = array('s', $agg['last_work_date']);
    $set['customer_status'] = array('s', $agg['customer_status']);
    return sl_update($conn, 'airtor_customers', 'id', $cust['id'], $set, 'sl_customer_save_wh', '');
}

// --- 담당자 -------------------------------------------------

function sl_has_contacts_col($conn) {
    if (isset($GLOBALS['SL_HAS_CONTACTS'])) return $GLOBALS['SL_HAS_CONTACTS'];
    $has = false;
    $res = $conn->query("SHOW COLUMNS FROM airtor_customers LIKE 'contacts'");
    if ($res) {
        $has = ($res->num_rows > 0);
        $res->free();
    }
    $GLOBALS['SL_HAS_CONTACTS'] = $has;
    return $has;
}

function sl_contact_norm($c) {
    return array(
        'name' => sl_str(isset($c['name']) ? $c['name'] : ''),
        'position' => sl_str(isset($c['position']) ? $c['position'] : ''),
        'phone' => sl_str(isset($c['phone']) ? $c['phone'] : ''),
        'email' => sl_str(isset($c['email']) ? $c['email'] : ''),
    );
}

// contacts 목록 (비어 있으면 예전 단일 칸으로 — 화면 getContacts 와 같다)
function sl_contacts_of($cust) {
    $ok = true;
    $list = sl_decode_list(isset($cust['contacts']) ? $cust['contacts'] : '', $ok);
    $out = array();
    foreach ($list as $c) {
        if (is_array($c)) $out[] = sl_contact_norm($c);
    }
    if (count($out) > 0) return $out;
    $legacy = array(
        'name' => sl_str(isset($cust['contact_name']) ? $cust['contact_name'] : ''),
        'position' => sl_str(isset($cust['contact_position']) ? $cust['contact_position'] : ''),
        'phone' => sl_str(isset($cust['phone']) ? $cust['phone'] : ''),
        'email' => sl_str(isset($cust['email']) ? $cust['email'] : ''),
    );
    if ($legacy['name'] !== '' || $legacy['phone'] !== '' || $legacy['email'] !== '') return array($legacy);
    return array();
}

function sl_digits($s) {
    return sl_str(preg_replace('/[^0-9]/', '', sl_str($s)));
}

// 같은 사람 찾기 — 이름 → 전화(숫자 7자리 이상) → 이메일 순
function sl_contact_find($list, $name, $phone, $email) {
    $name = trim(sl_str($name));
    $pd = sl_digits($phone);
    $em = strtolower(trim(sl_str($email)));
    if ($name !== '') {
        foreach ($list as $i => $c) {
            if (trim(sl_str($c['name'])) === $name) return $i;
        }
    }
    if (strlen($pd) >= 7) {
        foreach ($list as $i => $c) {
            if (sl_digits($c['phone']) === $pd) return $i;
        }
    }
    if ($em !== '') {
        foreach ($list as $i => $c) {
            if (strtolower(trim(sl_str($c['email']))) === $em) return $i;
        }
    }
    return -1;
}

// 고객 담당자 → contacts JSON + 예전 단일 칸(첫 담당자)
function sl_contacts_set($conn, $list) {
    $first = (count($list) > 0) ? $list[0] : array('name' => '', 'position' => '', 'phone' => '', 'email' => '');
    $set = array(
        'contact_name' => array('s', sl_str($first['name'])),
        'contact_position' => array('s', sl_str($first['position'])),
        'phone' => array('s', sl_str($first['phone'])),
        'email' => array('s', sl_str($first['email'])),
    );
    if (sl_has_contacts_col($conn)) $set['contacts'] = array('s', json_encode(array_values($list)));
    return $set;
}

// 딜 담당자 변경 → 고객 담당자 (예전 값으로 같은 사람을 찾아 바뀐 칸만 고친다, 없으면 추가). 바뀔 게 없으면 null.
function sl_contacts_apply_deal($list, $old, $new, $changed) {
    $keys = array('contactName' => 'name', 'contactPosition' => 'position', 'phone' => 'phone', 'email' => 'email');
    $touched = false;
    foreach ($keys as $k => $ck) {
        if (in_array($k, $changed, true)) $touched = true;
    }
    if (!$touched) return null;
    $idx = sl_contact_find($list, $old['contactName'], $old['phone'], $old['email']);
    if ($idx < 0) $idx = sl_contact_find($list, $new['contactName'], $new['phone'], $new['email']);
    if ($idx >= 0) {
        $c = $list[$idx];
        $any = false;
        foreach ($keys as $k => $ck) {
            if (!in_array($k, $changed, true)) continue;
            $nv = sl_str($new[$k]);
            if (sl_str($c[$ck]) !== $nv) {
                $c[$ck] = $nv;
                $any = true;
            }
        }
        if (!$any) return null;
        $list[$idx] = $c;
        return $list;
    }
    $nc = array('name' => sl_str($new['contactName']), 'position' => sl_str($new['contactPosition']), 'phone' => sl_str($new['phone']), 'email' => sl_str($new['email']));
    if ($nc['name'] === '' && $nc['phone'] === '' && $nc['email'] === '') return null;
    $list[] = $nc;
    return $list;
}

// 연결을 처음 만들 때 — 같은 사람이면 비어 있는 칸만 채우고, 없으면 담당자로 추가. 바뀔 게 없으면 null.
function sl_contacts_merge_deal($list, $deal) {
    $vals = array('name' => sl_str($deal['contactName']), 'position' => sl_str($deal['contactPosition']), 'phone' => sl_str($deal['phone']), 'email' => sl_str($deal['email']));
    $idx = sl_contact_find($list, $vals['name'], $vals['phone'], $vals['email']);
    if ($idx >= 0) {
        $c = $list[$idx];
        $any = false;
        foreach ($vals as $ck => $v) {
            if ($v !== '' && trim(sl_str($c[$ck])) === '') {
                $c[$ck] = $v;
                $any = true;
            }
        }
        if (!$any) return null;
        $list[$idx] = $c;
        return $list;
    }
    if ($vals['name'] === '' && $vals['phone'] === '' && $vals['email'] === '') return null;
    $list[] = $vals;
    return $list;
}

// 고객 담당자 변경(화면이 보낸 예전→새 값 쌍) → 이 딜에 바꿀 칸
function sl_deal_changes_from_pairs($api, $pairs) {
    $out = array();
    if (!is_array($pairs)) return $out;
    $dealList = array(array('name' => sl_str($api['contactName']), 'position' => sl_str($api['contactPosition']), 'phone' => sl_str($api['phone']), 'email' => sl_str($api['email'])));
    $map = array('name' => 'contactName', 'position' => 'contactPosition', 'phone' => 'phone', 'email' => 'email');
    foreach ($pairs as $p) {
        if (!is_array($p) || !isset($p['old']) || !isset($p['new']) || !is_array($p['old']) || !is_array($p['new'])) continue;
        $o = sl_contact_norm($p['old']);
        $n = sl_contact_norm($p['new']);
        if (sl_contact_find($dealList, $o['name'], $o['phone'], $o['email']) !== 0) continue;
        foreach ($map as $ck => $dk) {
            if ($o[$ck] !== $n[$ck] && sl_str($api[$dk]) !== $n[$ck]) $out[$dk] = $n[$ck];
        }
        break;
    }
    return $out;
}

// ============================================================
// 작업이력 항목 키 · 패치 (customers_api_v2 PUT workHistoryPatch)
// ============================================================

// functions/_lib/followups.ts jobKeyOf · src/lib/newsletter.ts jobKeyOf 와 같은 키
function sl_job_key($e) {
    $d = sl_entry_deal_id($e);
    if ($d > 0) return 'deal:' . $d;
    return 'wd:' . sl_str(isset($e['workDate']) ? $e['workDate'] : '') . '|'
        . sl_str(isset($e['projectName']) ? $e['projectName'] : '') . '|'
        . sl_str(isset($e['inquiryDate']) ? $e['inquiryDate'] : '');
}

// 키 → 인덱스. 연결 없는 항목은 같은 키가 여러 개일 수 있어 배열 순서대로 #0, #1 … 을 붙인다.
function sl_wh_key_index($wh) {
    $idx = array();
    $occ = array();
    foreach ($wh as $i => $e) {
        if (!is_array($e)) continue;
        $k = sl_job_key($e);
        if (substr($k, 0, 5) === 'deal:') {
            if (!isset($idx[$k])) $idx[$k] = $i;
            continue;
        }
        $n = isset($occ[$k]) ? $occ[$k] : 0;
        $idx[$k . '#' . $n] = $i;
        $occ[$k] = $n + 1;
    }
    return $idx;
}

function sl_resolve_key($idx, $key) {
    $key = sl_str($key);
    if (substr($key, 0, 5) !== 'deal:' && !preg_match('/#\d+$/', $key)) $key .= '#0';
    return isset($idx[$key]) ? $idx[$key] : -1;
}

function sl_wh_job_keys() {
    return array('inquiryDate', 'projectName', 'totalQuantity', 'detailedQuantity', 'quotationAmount', 'accountManager', 'workDate');
}

// 작업 항목 값 검증·정리 (dealId 는 바꿀 수 없다)
function sl_wh_clean_set($set, &$error) {
    $error = '';
    $out = array();
    if (!is_array($set)) return $out;
    $strs = array('projectName', 'detailedQuantity', 'accountManager', 'subcontractorManager');
    $ints = array('totalQuantity', 'quotationAmount');
    $dates = array('inquiryDate', 'workDate');
    $bools = array('reportSent', 'reminder1', 'reminder2', 'reminder3');
    foreach ($set as $k => $v) {
        if (in_array($k, $strs, true)) {
            $out[$k] = sl_str($v);
        } elseif (in_array($k, $ints, true)) {
            $n = intval(round(floatval($v)));
            $out[$k] = ($n < 0) ? 0 : $n;
        } elseif (in_array($k, $dates, true)) {
            $s = trim(sl_str($v));
            if ($s !== '' && !sl_is_ymd($s)) {
                $error = '날짜 형식이 올바르지 않습니다 (' . $k . ': ' . $s . ').';
                return array();
            }
            $out[$k] = $s;
        } elseif (in_array($k, $bools, true)) {
            $out[$k] = !empty($set[$k]);
        }
    }
    return $out;
}

function sl_wh_new_entry($in) {
    $err = '';
    $s = sl_wh_clean_set($in, $err);
    $e = array(
        'inquiryDate' => '', 'projectName' => '', 'totalQuantity' => 0, 'detailedQuantity' => '',
        'quotationAmount' => 0, 'accountManager' => '', 'workDate' => '', 'subcontractorManager' => '',
        'reportSent' => false, 'reminder1' => false, 'reminder2' => false, 'reminder3' => false,
    );
    foreach ($s as $k => $v) {
        $e[$k] = $v;
    }
    return $e;
}

function sl_same_value($cur, $v) {
    if (is_bool($v)) return (!empty($cur)) === $v;
    if ($cur === null) return false;
    if (is_int($v)) return intval($cur) === $v;
    return sl_str($cur) === $v;
}

// 패치 적용. $res 에 전파할 일(pushes: dealId => 바뀐 작업 항목, reports, removed), conflicts, error 를 담는다.
function sl_apply_wh_patch($wh, $ops, &$res) {
    $res = array('pushes' => array(), 'reports' => array(), 'removed' => array(), 'conflicts' => array(), 'error' => '', 'changed' => false);
    if (!is_array($ops)) {
        $res['error'] = 'workHistoryPatch 형식이 올바르지 않습니다.';
        return $wh;
    }
    // 1) 먼저 전부 검증 — 하나라도 틀리면 아무것도 바꾸지 않는다
    foreach ($ops as $op) {
        $kind = (is_array($op) && isset($op['op'])) ? sl_str($op['op']) : '';
        $err = '';
        if ($kind === 'update') {
            sl_wh_clean_set(isset($op['set']) ? $op['set'] : array(), $err);
        } elseif ($kind === 'add') {
            sl_wh_clean_set(isset($op['entry']) ? $op['entry'] : array(), $err);
        } elseif ($kind !== 'remove') {
            $err = '알 수 없는 작업이력 연산입니다.';
        }
        if ($err !== '') {
            $res['error'] = $err;
            return $wh;
        }
    }
    // 2) 적용
    $idx = sl_wh_key_index($wh);
    $remove = array();
    $add = array();
    $jobKeys = sl_wh_job_keys();
    foreach ($ops as $op) {
        $kind = sl_str($op['op']);
        $key = isset($op['key']) ? sl_str($op['key']) : '';
        if ($kind === 'add') {
            $add[] = sl_wh_new_entry(isset($op['entry']) ? $op['entry'] : array());
            $res['changed'] = true;
            continue;
        }
        $i = sl_resolve_key($idx, $key);
        if ($i < 0 || isset($remove[$i])) {
            $res['conflicts'][] = array('type' => 'not_found', 'key' => $key);
            continue;
        }
        $d = sl_entry_deal_id($wh[$i]);
        if ($kind === 'remove') {
            $cascade = isset($op['cascade']) ? sl_str($op['cascade']) : '';
            if ($d > 0 && $cascade !== 'fail-deal') {
                $res['conflicts'][] = array('type' => 'needs_confirmation', 'key' => $key);
                continue;
            }
            $remove[$i] = true;
            $res['changed'] = true;
            if ($d > 0) $res['removed'][] = $d;
            continue;
        }
        // update
        $err = '';
        $set = sl_wh_clean_set(isset($op['set']) ? $op['set'] : array(), $err);
        $e = $wh[$i];
        $job = array();
        foreach ($set as $k => $v) {
            $cur = isset($e[$k]) ? $e[$k] : null;
            if (sl_same_value($cur, $v)) continue;
            if ($k === 'reportSent' && $v && empty($e['reportSent']) && $d > 0) $res['reports'][] = $d;
            $e[$k] = $v;
            $res['changed'] = true;
            if (in_array($k, $jobKeys, true)) $job[$k] = $v;
        }
        $wh[$i] = $e;
        if ($d > 0 && count($job) > 0) {
            if (!isset($res['pushes'][$d])) $res['pushes'][$d] = array();
            foreach ($job as $k => $v) {
                $res['pushes'][$d][$k] = $v;
            }
        }
    }
    $out = array();
    foreach ($wh as $i => $e) {
        if (!isset($remove[$i])) $out[] = $e;
    }
    foreach ($add as $e) {
        $out[] = $e;
    }
    return $out;
}

// ============================================================
// 프로젝트 (airtor_projects) · 손익 재계산
// ============================================================

function sl_project_by_deal($conn, $dealId) {
    $rows = sl_rows($conn, 'SELECT id, deal_id, customer_id, project_name, service_type, work_date, status, quotation_amount, tax_amount, net_revenue FROM airtor_projects WHERE deal_id = ' . intval($dealId) . ' LIMIT 1');
    if ($rows === false) return false;
    return (count($rows) > 0) ? $rows[0] : null;
}

// 견적(VAT 포함) → 견적·부가세·순매출
function sl_project_amounts($q) {
    $q = intval($q);
    $tax = intval(round($q * 10 / 110));
    return array($q, $tax, $q - $tax);
}

function sl_project_name($service, $dealId) {
    $s = sl_str($service);
    return ($s !== '') ? $s : ('딜 #' . intval($dealId));
}

// $job: projectName / quotationAmount / workDate / customerId 중 바뀐 것. 금액·작업일이 바뀌면 손익 재계산.
function sl_project_apply($conn, $proj, $job, &$ctx) {
    $set = array();
    $recompute = false;
    if (array_key_exists('projectName', $job)) {
        $name = sl_project_name($job['projectName'], $proj['deal_id']);
        if (sl_str($proj['project_name']) !== $name) $set['project_name'] = array('s', $name);
        if (sl_str($proj['service_type']) !== sl_str($job['projectName'])) $set['service_type'] = array('s', sl_str($job['projectName']));
    }
    if (array_key_exists('quotationAmount', $job)) {
        $a = sl_project_amounts($job['quotationAmount']);
        if (intval($proj['quotation_amount']) !== $a[0] || intval($proj['tax_amount']) !== $a[1] || intval($proj['net_revenue']) !== $a[2]) {
            $set['quotation_amount'] = array('i', $a[0]);
            $set['tax_amount'] = array('i', $a[1]);
            $set['net_revenue'] = array('i', $a[2]);
            $recompute = true;
        }
    }
    if (array_key_exists('workDate', $job)) {
        $wd = sl_is_ymd(sl_str($job['workDate'])) ? sl_str($job['workDate']) : '';
        $cur = sl_str($proj['work_date']);
        if ($cur === '0000-00-00') $cur = '';
        if ($cur !== $wd) {
            $set['work_date'] = array('s', ($wd === '') ? null : $wd);
            $recompute = true;
        }
    }
    if (array_key_exists('customerId', $job)) {
        $cid = $job['customerId'];
        $curCid = ($proj['customer_id'] === null) ? null : intval($proj['customer_id']);
        if ($cid !== $curCid) $set['customer_id'] = array('i', $cid);
    }
    if (count($set) === 0) return true;
    if (!sl_update($conn, 'airtor_projects', 'id', $proj['id'], $set, 'sl_project_apply', '')) return false;
    $ctx['projects'][] = intval($proj['id']);
    if ($recompute && !sl_recompute_project($conn, intval($proj['id']))) return false;
    return true;
}

function sl_project_insert($conn, $dealId, $customerId, $job, &$ctx) {
    $a = sl_project_amounts($job['quotationAmount']);
    $wd = sl_is_ymd($job['workDate']) ? $job['workDate'] : null;
    $cid = $customerId ? intval($customerId) : null;
    $sql = "INSERT IGNORE INTO airtor_projects
            (deal_id, customer_id, work_history_dealid, project_name, service_type, work_date, status,
             quotation_amount, tax_amount, net_revenue)
            VALUES (?, ?, ?, ?, ?, ?, 'in-progress', ?, ?, ?)";
    $ok = sl_exec($conn, $sql, 'iiisssiii', array(
        intval($dealId), $cid, intval($dealId), sl_project_name($job['projectName'], $dealId),
        sl_str($job['projectName']), $wd, $a[0], $a[1], $a[2],
    ), 'sl_project_insert');
    if (!$ok) return false;
    $p = sl_project_by_deal($conn, $dealId);
    if ($p === false) return false;
    if ($p === null) return true;
    $ctx['projects'][] = intval($p['id']);
    return sl_recompute_project($conn, intval($p['id']));
}

// 단가 캐스케이드 — 당월 → 가장 가까운 직전 월(12개월 이내), 없으면 0 (projects_api.php v1 그대로)
function sl_labor_rate($conn, $yearMonth, $role) {
    $stmt = $conn->prepare("SELECT daily_rate FROM airtor_labor_rates WHERE `year_month` = ? AND role = ?");
    if (!$stmt) {
        error_log('[sl_labor_rate] prepare1 failed: ' . $conn->error);
        return 0;
    }
    $stmt->bind_param('ss', $yearMonth, $role);
    if (!$stmt->execute()) {
        error_log('[sl_labor_rate] execute1 failed: ' . $stmt->error);
        $stmt->close();
        return 0;
    }
    $rate1 = 0;
    $stmt->bind_result($rate1);
    if ($stmt->fetch()) {
        $stmt->close();
        return intval($rate1);
    }
    $stmt->close();

    $stmt = $conn->prepare("SELECT `year_month`, daily_rate FROM airtor_labor_rates WHERE role = ? AND `year_month` < ? ORDER BY `year_month` DESC LIMIT 1");
    if (!$stmt) {
        error_log('[sl_labor_rate] prepare2 failed: ' . $conn->error);
        return 0;
    }
    $stmt->bind_param('ss', $role, $yearMonth);
    if (!$stmt->execute()) {
        error_log('[sl_labor_rate] execute2 failed: ' . $stmt->error);
        $stmt->close();
        return 0;
    }
    $foundMonth = '';
    $rate2 = 0;
    $stmt->bind_result($foundMonth, $rate2);
    if (!$stmt->fetch()) {
        $stmt->close();
        return 0;
    }
    $stmt->close();

    if (!preg_match('/^(\d{4})-(\d{2})$/', $yearMonth, $mc) || !preg_match('/^(\d{4})-(\d{2})$/', $foundMonth, $mf)) {
        return intval($rate2);
    }
    $diff = (intval($mc[1]) - intval($mf[1])) * 12 + (intval($mc[2]) - intval($mf[2]));
    if ($diff > 12) {
        error_log('[sl_labor_rate] cascade out of range (year_month=' . $yearMonth . ', role=' . $role . ', found=' . $foundMonth . ')');
        return 0;
    }
    return intval($rate2);
}

// 손익 파생지표 재계산 (projects_api.php v1 recomputeProjectDerived 그대로)
function sl_recompute_project($conn, $projectId) {
    $stmt = $conn->prepare('SELECT worker_assignments, work_date, net_revenue, meal_cost, transport_cost, other_cost FROM airtor_projects WHERE id = ?');
    if (!$stmt) {
        error_log('[sl_recompute_project] SELECT prepare failed (id=' . $projectId . '): ' . $conn->error);
        return false;
    }
    $stmt->bind_param('i', $projectId);
    if (!$stmt->execute()) {
        error_log('[sl_recompute_project] SELECT execute failed (id=' . $projectId . '): ' . $stmt->error);
        $stmt->close();
        return false;
    }
    $workerJson = null;
    $workDate = null;
    $netRev = 0;
    $meal = 0;
    $transport = 0;
    $other = 0;
    $stmt->bind_result($workerJson, $workDate, $netRev, $meal, $transport, $other);
    if (!$stmt->fetch()) {
        $stmt->close();
        return true;
    }
    $stmt->close();

    $assign = array('a_grade' => 0, 'b_grade' => 0, 'pin_wash' => 0, 'dely' => 0, 'parts_wash' => 0, 'days' => 0);
    $extras = array();
    if ($workerJson) {
        $parsed = json_decode($workerJson, true);
        if (is_array($parsed)) {
            foreach ($assign as $k => $v0) {
                if (isset($parsed[$k])) $assign[$k] = intval($parsed[$k]);
            }
            if (isset($parsed['extras']) && is_array($parsed['extras'])) {
                foreach ($parsed['extras'] as $e) {
                    if (!is_array($e)) continue;
                    $extras[] = array(
                        'label' => isset($e['label']) ? strval($e['label']) : '',
                        'dailyRate' => isset($e['dailyRate']) ? intval($e['dailyRate']) : 0,
                        'count' => isset($e['count']) ? intval($e['count']) : 0,
                    );
                }
            }
        }
    }

    if ($workDate && preg_match('/^(\d{4})-(\d{2})/', $workDate, $m)) {
        $yearMonth = $m[1] . '-' . $m[2];
    } else {
        $yearMonth = date('Y-m');
    }

    $days = intval($assign['days']);
    $roles = array('a_grade', 'b_grade', 'pin_wash', 'dely', 'parts_wash');
    $breakdown = array();
    $laborCost = 0;
    foreach ($roles as $role) {
        $count = intval($assign[$role]);
        $rate = sl_labor_rate($conn, $yearMonth, $role);
        $subtotal = $rate * $count * $days;
        $breakdown[$role] = array('rate' => $rate, 'count' => $count, 'days' => $days, 'subtotal' => $subtotal);
        $laborCost += $subtotal;
    }
    $extrasBreakdown = array();
    foreach ($extras as $e) {
        $subtotal = $e['dailyRate'] * $e['count'] * $days;
        $extrasBreakdown[] = array('label' => $e['label'], 'rate' => $e['dailyRate'], 'count' => $e['count'], 'days' => $days, 'subtotal' => $subtotal);
        $laborCost += $subtotal;
    }
    $breakdown['extras'] = $extrasBreakdown;

    $netRev = intval($netRev);
    $totalCost = $laborCost + intval($meal) + intval($transport) + intval($other);
    $laborCostRatio = ($netRev > 0) ? round($laborCost / $netRev, 4) : 0.0;
    $netProfit = $netRev - $totalCost;
    $profitRatio = ($netRev > 0) ? round($netProfit / $netRev, 4) : 0.0;

    return sl_exec($conn,
        'UPDATE airtor_projects SET labor_breakdown = ?, labor_cost = ?, total_cost = ?, labor_cost_ratio = ?, net_profit = ?, profit_ratio = ? WHERE id = ?',
        'siididi', array(json_encode($breakdown), $laborCost, $totalCost, $laborCostRatio, $netProfit, $profitRatio, intval($projectId)),
        'sl_recompute_project');
}

// 리포트 전송(작업이력 reportSent false→true) → 진행중 프로젝트 완료
function sl_project_report_complete($conn, $dealId, &$ctx) {
    $proj = sl_project_by_deal($conn, $dealId);
    if (!$proj || $proj['status'] !== 'in-progress') return ($proj !== false);
    $ok = sl_exec($conn, "UPDATE airtor_projects SET status = 'completed', completed_at = NOW(), completed_reason = 'report_sent' WHERE id = ? AND status = 'in-progress'",
        'i', array(intval($proj['id'])), 'sl_project_report_complete');
    if ($ok) $ctx['projects'][] = intval($proj['id']);
    return $ok;
}

// ============================================================
// 전파 — 결과 모음
// ============================================================

function sl_ctx() {
    return array('deals' => array(), 'customers' => array(), 'projects' => array(), 'warnings' => array(), 'conflicts' => array(), 'failed' => array());
}

function sl_ctx_synced($ctx) {
    return array(
        'deals' => array_values(array_unique($ctx['deals'])),
        'customers' => array_values(array_unique($ctx['customers'])),
        'projects' => array_values(array_unique($ctx['projects'])),
    );
}

// 고객 한 명의 이 딜 항목에 작업 값을 넣는다(다른 값만). 집계도 다시 계산.
function sl_holder_apply_job($conn, $h, $dealId, $job, &$ctx) {
    if (!$h['_wh_ok']) {
        $ctx['failed'][] = 'customer_json:' . $h['id'];
        return false;
    }
    $wh = $h['_wh'];
    $i = sl_entry_index($wh, $dealId);
    if ($i < 0) return true;
    $e = $wh[$i];
    $changed = false;
    foreach ($job as $k => $v) {
        $cur = isset($e[$k]) ? $e[$k] : null;
        if (sl_same_value($cur, $v)) continue;
        $e[$k] = $v;
        $changed = true;
    }
    if (!$changed) return true;
    $wh[$i] = $e;
    if (!sl_customer_save_wh($conn, $h, $wh, array())) return false;
    $ctx['customers'][] = intval($h['id']);
    return true;
}

// 새 고객 (v1 syncDealToCustomer INSERT 와 같은 기본값 + contacts JSON)
function sl_customer_insert_from_deal($conn, $deal, $job) {
    $today = date('Y-m-d');
    $entry = array('dealId' => intval($deal['id']));
    foreach ($job as $k => $v) {
        $entry[$k] = $v;
    }
    $entry['subcontractorManager'] = '';
    $entry['reportSent'] = false;
    $entry['reminder1'] = false;
    $entry['reminder2'] = false;
    $entry['reminder3'] = false;

    $requirements = (trim(sl_str($deal['requirements'])) !== '') ? sl_str($deal['requirements']) : '없음';
    $notes = json_encode(array(array('id' => 1, 'author' => sl_str($deal['salesManager']), 'date' => $today, 'content' => '영업관리에서 자동 등록됨. 요구사항: ' . $requirements)));
    $detailed = (sl_str($deal['detailedQuantity']) !== '') ? json_encode(array(array('item' => $job['projectName'], 'quantity' => $job['totalQuantity']))) : '[]';
    $contact = array('name' => sl_str($deal['contactName']), 'position' => sl_str($deal['contactPosition']), 'phone' => sl_str($deal['phone']), 'email' => sl_str($deal['email']));
    $contacts = ($contact['name'] !== '' || $contact['phone'] !== '' || $contact['email'] !== '') ? array($contact) : array();
    $lastWork = sl_is_ymd($job['workDate']) ? $job['workDate'] : $today;

    $cols = 'company, grade, customer_status, contact_name, contact_position, deals, last_work_date, total_quantity, total_amount, '
        . 'management_cycle, next_management_date, reminder_status, account_manager, phone, email, address, field_manager, memo, '
        . 'detailed_quantity, work_history, email_history, internal_notes';
    $vals = array(
        trim(sl_str($deal['company'])), '미설정', '신규', $contact['name'], $contact['position'],
        '1', $lastWork, strval(intval($job['totalQuantity'])), strval(intval($job['quotationAmount'])),
        '365', date('Y-m-d', strtotime('+365 days')), '미발송', sl_str($deal['salesManager']),
        $contact['phone'], $contact['email'], sl_str($deal['address']), '', sl_str($deal['managementMemo']),
        $detailed, json_encode(array($entry)), '[]', $notes,
    );
    if (sl_has_contacts_col($conn)) {
        $cols .= ', contacts';
        $vals[] = json_encode($contacts);
    }
    $ph = implode(', ', array_fill(0, count($vals), '?'));
    $ok = sl_exec($conn, 'INSERT INTO airtor_customers (' . $cols . ', created_at) VALUES (' . $ph . ', NOW())',
        str_repeat('s', count($vals)), $vals, 'sl_customer_insert_from_deal');
    if (!$ok) return 0;
    return intval($conn->insert_id);
}

// 기존 고객에 연결 — 같은 문의일의 예전 항목(dealId 없음)이 있으면 가져오고, 없으면 새 항목을 붙인다
function sl_customer_adopt_or_append($conn, $cust, $deal, $job, &$ctx) {
    if (!$cust['_wh_ok']) {
        $ctx['failed'][] = 'customer_json:' . $cust['id'];
        return false;
    }
    $dealId = intval($deal['id']);
    $wh = $cust['_wh'];
    $extra = array();
    $idx = -1;
    $inq = sl_str($deal['registrationDate']);
    if ($inq !== '') {
        foreach ($wh as $i => $e) {
            if (is_array($e) && sl_entry_deal_id($e) === 0 && isset($e['inquiryDate']) && sl_str($e['inquiryDate']) === $inq) {
                $idx = $i;
                break;
            }
        }
    }
    if ($idx >= 0) {
        $oldKey = sl_job_key($wh[$idx]);
        $e = $wh[$idx];
        $e['dealId'] = $dealId;
        foreach ($job as $k => $v) {
            $e[$k] = $v;
        }
        $wh[$idx] = $e;
        // 후속 안내 메일 장부의 jobKey 도 deal:N 으로 옮긴다 — 안 옮기면 같은 단계 메일이 다시 나간다
        $ok = true;
        $ledger = sl_decode_list(isset($cust['email_history']) ? $cust['email_history'] : '', $ok);
        if ($ok) {
            $moved = false;
            foreach ($ledger as $li => $le) {
                if (is_array($le) && isset($le['jobKey']) && $le['jobKey'] === $oldKey) {
                    $ledger[$li]['jobKey'] = 'deal:' . $dealId;
                    $moved = true;
                }
            }
            if ($moved) $extra['email_history'] = array('s', json_encode($ledger));
        }
    } else {
        $e = array('dealId' => $dealId);
        foreach ($job as $k => $v) {
            $e[$k] = $v;
        }
        $e['subcontractorManager'] = '';
        $e['reportSent'] = false;
        $e['reminder1'] = false;
        $e['reminder2'] = false;
        $e['reminder3'] = false;
        $wh[] = $e;
    }
    $contacts = sl_contacts_merge_deal(sl_contacts_of($cust), $deal);
    if ($contacts !== null) {
        $cs = sl_contacts_set($conn, $contacts);
        foreach ($cs as $k => $v) {
            $extra[$k] = $v;
        }
    }
    if (trim(sl_str($cust['address'])) === '' && trim(sl_str($deal['address'])) !== '') $extra['address'] = array('s', sl_str($deal['address']));
    if (!sl_customer_save_wh($conn, $cust, $wh, $extra)) return false;
    $ctx['customers'][] = intval($cust['id']);
    return true;
}

// 딜이 수주로 바뀜(또는 수주로 새로 등록) → 고객 작업이력·프로젝트 연결을 만들거나 딜 값으로 맞춘다
function sl_link_deal($conn, $deal, &$ctx) {
    $dealId = intval($deal['id']);
    $job = sl_job_from_deal($deal);
    $proj = sl_project_by_deal($conn, $dealId);
    if ($proj === false) return false;
    $holders = sl_find_holders($conn, $dealId);
    if ($holders === false) return false;

    $main = null;
    if (count($holders) > 0) {
        foreach ($holders as $h) {
            if (!sl_holder_apply_job($conn, $h, $dealId, $job, $ctx)) return false;
        }
        $main = sl_main_holder($holders, $proj);
    } else {
        $company = trim(sl_str($deal['company']));
        if (sl_normalize_company($company) === '') {
            $ctx['warnings'][] = 'no_company';
            return true;
        }
        $cust = sl_find_customer_by_name($conn, $company, 0);
        if ($cust === false) return false;
        if ($cust === null) {
            $newId = sl_customer_insert_from_deal($conn, $deal, $job);
            if ($newId <= 0) return false;
            $ctx['customers'][] = $newId;
            $main = array('id' => $newId);
        } else {
            if (!sl_customer_adopt_or_append($conn, $cust, $deal, $job, $ctx)) return false;
            $main = $cust;
        }
    }

    $pj = array('projectName' => $job['projectName'], 'quotationAmount' => $job['quotationAmount'], 'workDate' => $job['workDate']);
    if ($proj) {
        $holderIds = sl_holder_ids($holders);
        if ($main && ($proj['customer_id'] === null || (count($holderIds) > 0 && !in_array(intval($proj['customer_id']), $holderIds, true)) || count($holderIds) === 0)) {
            $pj['customerId'] = intval($main['id']);
        }
        return sl_project_apply($conn, $proj, $pj, $ctx);
    }
    return sl_project_insert($conn, $dealId, $main ? $main['id'] : null, $job, $ctx);
}

// 딜 항목을 다른 고객으로 옮긴다 (딜 회사명이 다른 고객 이름이 됐을 때)
function sl_move_entry($conn, $from, $to, $dealId, $proj, &$ctx) {
    if (!$from['_wh_ok'] || !$to['_wh_ok']) {
        $ctx['failed'][] = 'customer_json';
        return false;
    }
    $wh = $from['_wh'];
    $i = sl_entry_index($wh, $dealId);
    if ($i < 0) return true;
    $e = $wh[$i];
    array_splice($wh, $i, 1);
    $toWh = $to['_wh'];
    if (sl_entry_index($toWh, $dealId) < 0) $toWh[] = $e;
    if (!sl_customer_save_wh($conn, $to, $toWh, array())) return false;
    if (!sl_customer_save_wh($conn, $from, $wh, array())) return false;
    $ctx['customers'][] = intval($to['id']);
    $ctx['customers'][] = intval($from['id']);
    if ($proj && intval($proj['customer_id']) !== intval($to['id'])) {
        if (!sl_project_apply($conn, $proj, array('customerId' => intval($to['id'])), $ctx)) return false;
    }
    return true;
}

// 딜의 회사명·담당자·주소 변경 → 대표 고객
function sl_push_deal_identity($conn, $cust, $before, $after, $identity, $proj, &$ctx) {
    $dealId = intval($after['id']);
    $target = $cust;
    $extra = array();

    if (in_array('company', $identity, true)) {
        $newName = trim(sl_str($after['company']));
        $newNorm = sl_normalize_company($newName);
        $custNorm = sl_normalize_company($cust['company']);
        if ($newNorm !== '') {
            $other = null;
            if ($newNorm !== $custNorm) {
                $other = sl_find_customer_by_name($conn, $newName, intval($cust['id']));
                if ($other === false) return false;
            }
            if ($other !== null) {
                // 다른 고객 이름 → 그 고객으로 옮긴다
                if (!sl_move_entry($conn, $cust, $other, $dealId, $proj, $ctx)) return false;
                $target = sl_customer($conn, $other['id']);
                if (!$target) return ($target === null);
            } elseif (sl_linked_count($cust['_wh']) <= 1) {
                // 이 고객의 연결 작업이 이 1건뿐 → 고객명도 바꾼다
                if (trim(sl_str($cust['company'])) !== $newName) $extra['company'] = array('s', $newName);
            } elseif ($newNorm !== $custNorm) {
                $ctx['warnings'][] = 'company_diverged';
            }
        }
    }

    $contacts = sl_contacts_apply_deal(sl_contacts_of($target), $before, $after, $identity);
    if ($contacts !== null) {
        $cs = sl_contacts_set($conn, $contacts);
        foreach ($cs as $k => $v) {
            $extra[$k] = $v;
        }
    }
    if (in_array('address', $identity, true)) {
        $ca = trim(sl_str($target['address']));
        $na = trim(sl_str($after['address']));
        if (($ca === '' || $ca === trim(sl_str($before['address']))) && $ca !== $na) $extra['address'] = array('s', sl_str($after['address']));
    }
    if (count($extra) === 0) return true;
    if (!sl_update($conn, 'airtor_customers', 'id', $target['id'], $extra, 'sl_push_deal_identity', '')) return false;
    $ctx['customers'][] = intval($target['id']);
    return true;
}

// 연결된 딜이 바뀜 → 작업이력(모든 보유 고객)·프로젝트, 회사명·담당자·주소는 대표 고객
function sl_push_deal($conn, $before, $after, $changed, &$ctx) {
    $dealId = intval($after['id']);
    $jobAll = sl_job_from_deal($after);
    $job = array();
    $map = sl_job_map();
    foreach ($map as $dk => $wk) {
        if (in_array($dk, $changed, true)) $job[$wk] = $jobAll[$wk];
    }
    $identity = array();
    foreach (array('company', 'contactName', 'contactPosition', 'phone', 'email', 'address') as $k) {
        if (in_array($k, $changed, true)) $identity[] = $k;
    }
    if (count($job) === 0 && count($identity) === 0) return true;

    $proj = sl_project_by_deal($conn, $dealId);
    if ($proj === false) return false;
    $holders = sl_find_holders($conn, $dealId);
    if ($holders === false) return false;
    if (count($holders) === 0 && !$proj) return true; // 연결 없는 딜

    if (count($job) > 0) {
        foreach ($holders as $h) {
            if (!sl_holder_apply_job($conn, $h, $dealId, $job, $ctx)) return false;
        }
        if ($proj) {
            $pj = array();
            foreach (array('projectName', 'quotationAmount', 'workDate') as $k) {
                if (array_key_exists($k, $job)) $pj[$k] = $job[$k];
            }
            if (count($pj) > 0 && !sl_project_apply($conn, $proj, $pj, $ctx)) return false;
        }
    }
    if (count($identity) > 0 && count($holders) > 0) {
        $main = sl_main_holder($holders, $proj);
        $main = sl_customer($conn, $main['id']); // 위에서 작업이력을 고쳤을 수 있어 다시 읽는다
        if (!$main) return ($main === null);
        if (!sl_push_deal_identity($conn, $main, $before, $after, $identity, $proj, $ctx)) return false;
    }
    return true;
}

// 고객 페이지에서 연결 항목의 작업 값을 고침 → 딜·같은 딜의 다른 고객·프로젝트
function sl_push_wh($conn, $custId, $dealId, $set, &$ctx) {
    $job = array();
    foreach (sl_wh_job_keys() as $k) {
        if (array_key_exists($k, $set)) $job[$k] = $set[$k];
    }
    if (count($job) === 0) return true;

    $deal = sl_load_deal($conn, $dealId);
    if ($deal === false) return false;
    if ($deal) {
        $f = array();
        if (array_key_exists('inquiryDate', $job) && sl_is_ymd($job['inquiryDate'])) $f['registrationDate'] = $job['inquiryDate'];
        if (array_key_exists('projectName', $job)) $f['desiredService'] = sl_str($job['projectName']);
        if (array_key_exists('totalQuantity', $job)) $f['totalQuantity'] = intval($job['totalQuantity']);
        if (array_key_exists('detailedQuantity', $job)) $f['detailedQuantity'] = sl_str($job['detailedQuantity']);
        if (array_key_exists('quotationAmount', $job) && sl_parse_amount($deal['api']['quotationAmount']) !== intval($job['quotationAmount'])) {
            $f['quotationAmount'] = sl_amount_text($job['quotationAmount']);
        }
        if (array_key_exists('accountManager', $job)) $f['salesManager'] = sl_str($job['accountManager']);
        if (array_key_exists('workDate', $job)) $f['confirmedWorkDate'] = sl_str($job['workDate']);
        if (count($f) > 0) {
            $n = sl_deal_write($conn, $dealId, $f, $deal);
            if ($n === false) return false;
            if ($n > 0) $ctx['deals'][] = $dealId;
        }
    } else {
        $ctx['warnings'][] = 'deal_missing';
    }

    $holders = sl_find_holders($conn, $dealId);
    if ($holders === false) return false;
    foreach ($holders as $h) {
        if (intval($h['id']) === intval($custId)) continue;
        if (!sl_holder_apply_job($conn, $h, $dealId, $job, $ctx)) return false;
    }

    $proj = sl_project_by_deal($conn, $dealId);
    if ($proj === false) return false;
    if ($proj) {
        $pj = array();
        foreach (array('projectName', 'quotationAmount', 'workDate') as $k) {
            if (array_key_exists($k, $job)) $pj[$k] = $job[$k];
        }
        if (count($pj) > 0 && !sl_project_apply($conn, $proj, $pj, $ctx)) return false;
    }
    return true;
}

// 고객의 회사명·주소·담당자 변경 → 연결된 딜
function sl_push_customer($conn, $before, $after, $pairs, &$ctx) {
    $newCompany = trim(sl_str($after['company']));
    $companyChanged = (trim(sl_str($before['company'])) !== $newCompany) && sl_normalize_company($newCompany) !== '';
    $oldAddr = trim(sl_str($before['address']));
    $newAddr = trim(sl_str($after['address']));
    $addrChanged = ($oldAddr !== $newAddr);
    $hasPairs = is_array($pairs) && count($pairs) > 0;
    if (!$companyChanged && !$addrChanged && !$hasPairs) return true;

    $oldNorm = sl_normalize_company($before['company']);
    foreach ($after['_wh'] as $e) {
        $dealId = sl_entry_deal_id($e);
        if ($dealId <= 0) continue;
        $deal = sl_load_deal($conn, $dealId);
        if ($deal === false) return false;
        if (!$deal) continue;
        $api = $deal['api'];
        $f = array();
        if ($companyChanged && sl_normalize_company($api['company']) === $oldNorm && sl_str($api['company']) !== $newCompany) $f['company'] = $newCompany;
        if ($addrChanged) {
            $da = trim(sl_str($api['address']));
            if (($da === '' || $da === $oldAddr) && $da !== $newAddr) $f['address'] = sl_str($after['address']);
        }
        if ($hasPairs) {
            $cf = sl_deal_changes_from_pairs($api, $pairs);
            foreach ($cf as $k => $v) {
                $f[$k] = $v;
            }
        }
        if (count($f) === 0) continue;
        $n = sl_deal_write($conn, $dealId, $f, $deal);
        if ($n === false) return false;
        if ($n > 0) $ctx['deals'][] = $dealId;
    }
    return true;
}

// 고객 페이지에서 연결 작업을 지움(확인 후 fail-deal) → 같은 딜을 가진 다른 고객이 없으면 딜을 '실패'로.
// 프로젝트는 지우지 않는다(표시만). 프로젝트가 이 고객을 가리키는데 다른 보유 고객이 있으면 그쪽으로 옮긴다.
function sl_after_entry_removed($conn, $custId, $dealId, &$ctx) {
    $holders = sl_find_holders($conn, $dealId);
    if ($holders === false) return false;
    $proj = sl_project_by_deal($conn, $dealId);
    if ($proj === false) return false;
    if (count($holders) > 0) {
        if ($proj && intval($proj['customer_id']) === intval($custId)) {
            return sl_project_apply($conn, $proj, array('customerId' => intval($holders[0]['id'])), $ctx);
        }
        return true;
    }
    $deal = sl_load_deal($conn, $dealId);
    if ($deal === false) return false;
    if (!$deal) return true;
    $n = sl_deal_write($conn, $dealId, array('successStatus' => 'failed'), $deal);
    if ($n === false) return false;
    if ($n > 0) $ctx['deals'][] = $dealId;
    return true;
}

// ============================================================
// 점검 (읽기 전용) — deals_api_v2.php?action=probe
// ============================================================

function sl_probe($conn) {
    $out = array(
        'php' => phpversion(),
        'intSize' => PHP_INT_SIZE,
        'timezone' => date_default_timezone_get(),
        'now' => date('Y-m-d H:i:s'),
        'hasHttpResponseCode' => function_exists('http_response_code'),
        'mysql' => $conn->server_info,
    );
    $rows = sl_rows($conn, 'SELECT @@sql_mode AS m');
    $out['sqlMode'] = ($rows && count($rows) > 0) ? $rows[0]['m'] : null;
    $out['lock'] = sl_lock($conn);
    sl_unlock($conn);
    $out['engines'] = array();
    $rows = sl_rows($conn, "SHOW TABLE STATUS WHERE Name IN ('Gn_Online', 'airtor_customers', 'airtor_projects', 'airtor_labor_rates')");
    if ($rows) {
        foreach ($rows as $r) {
            $out['engines'][$r['Name']] = $r['Engine'];
        }
    }
    $out['columns'] = array();
    $checks = array(
        array('airtor_customers', 'last_work_date'), array('airtor_customers', 'next_management_date'),
        array('airtor_customers', 'work_history'), array('airtor_customers', 'email_history'),
        array('airtor_customers', 'contacts'), array('airtor_customers', 'total_amount'),
        array('Gn_Online', 'on_regist'), array('Gn_Online', 'on_link1'), array('Gn_Online', 'on_link2'),
        array('Gn_Online', 'on_visit_date'), array('airtor_projects', 'work_date'), array('airtor_projects', 'customer_id'),
    );
    foreach ($checks as $c) {
        $rows = sl_rows($conn, 'SHOW COLUMNS FROM ' . $c[0] . " LIKE '" . $c[1] . "'");
        $out['columns'][$c[0] . '.' . $c[1]] = ($rows && count($rows) > 0) ? $rows[0]['Type'] . ($rows[0]['Null'] === 'YES' ? ' NULL' : ' NOT NULL') : null;
    }
    return $out;
}
