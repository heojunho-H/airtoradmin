<?php
/**
 * ⚠️ 카페24 PHP 5.2.x 호환 코드 — 모던 문법 금지
 *    상세: api/COMPATIBILITY.md
 *    - 클로저, 2-인자 json_encode, JSON_UNESCAPED_UNICODE, http_response_code 등 사용 금지
 *    - prepare/execute 실패 시 반드시 error_log() + return false
 *
 * 영업(딜) 데이터 API v2 — airtoradmin 전용
 * 테이블: Gn_Online (문의하기 폼과 동일한 테이블). 컬럼 매핑은 sync_lib.php sl_deal_api / sl_deal_colmap.
 *
 * v1(deals_api.php)과 다른 점 — docs/data-sync.md
 *  - PUT 은 보낸 칸만 고친다(부분 수정). 문의 등록일(on_regist)도 저장한다. 화면은 바뀐 칸만 보낸다.
 *    `_v` 가 없는 PUT(새로고침 안 한 옛 화면의 행 전체 저장)은 409 reload_required — 최신 값을 되돌리지 않게.
 *  - 딜이 수주로 바뀌면 고객 작업이력·프로젝트 연결을 만들고, 연결된 딜은 바뀐 항목만 고객·프로젝트로 전파한다.
 *  - 수주 취소·딜 삭제는 연결을 지우지 않는다(화면에서 '수주 취소' 표시만).
 *  - 응답에 저장된 딜(deal)·함께 바뀐 대상(synced)·전환(transition: won|lost)을 담고, 오류는 HTTP 상태로 알린다.
 *
 * GET               → { success, data: Deal[] }
 * GET ?action=probe → 서버 환경 점검 (읽기 전용)
 * POST Deal         → { success, id, deal, synced, transition, warnings }
 * PUT { id, _v, ...바뀐 칸 } → { success, deal, changed, synced, transition, warnings }
 * DELETE { id }     → { success }
 * 동기화 실패(딜은 저장됨) → 500 { success:false, persisted:true, deal_persisted:true, ... }
 */
error_reporting(0);
ini_set('display_errors', 0);
// 에러 로그는 카페24 호스팅 기본 위치로 보냄 (디스플레이는 막되 기록은 남김).
ini_set('log_errors', 1);
ignore_user_abort(true);

require_once dirname(__FILE__) . '/sync_lib.php';
sl_headers();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    sl_status(204);
    exit;
}

// DB 접속 — 서버 전용 db_config.php 가 $conn 을 만든다(접속 정보는 저장소에 두지 않는다 — .gitignore)
$_dbConfigPath = dirname(__FILE__) . '/db_config.php';
if (!file_exists($_dbConfigPath)) {
    sl_out(null, 500, array('error' => 'DB 설정 파일(api/db_config.php)이 서버에 없습니다.'));
}
require_once $_dbConfigPath;
if (!isset($conn) || !$conn) {
    sl_out(null, 500, array('error' => 'DB connection failed'));
}

$method = $_SERVER['REQUEST_METHOD'];

function deals_sync_response($conn, $ok, $resp) {
    if ($ok) sl_out($conn, 200, $resp);
    $resp['success'] = false;
    $resp['persisted'] = true;
    $resp['deal_persisted'] = true;
    $resp['error'] = '딜은 저장했지만 고객·프로젝트에 반영하지 못했습니다. 잠시 후 다시 저장해 주세요.';
    sl_out($conn, 500, $resp);
}

// ============================================================
// GET — 딜 목록 (읽기 전용) / ?action=probe
// ============================================================
if ($method === 'GET') {
    if (isset($_GET['action']) && $_GET['action'] === 'probe') {
        sl_out($conn, 200, array('success' => true, 'probe' => sl_probe($conn)));
    }
    $rows = sl_rows($conn, 'SELECT ' . sl_deal_cols() . " FROM Gn_Online WHERE on_site = 'airtor2014' ORDER BY on_num DESC");
    if ($rows === false) sl_out($conn, 500, array('error' => 'Query failed'));
    $deals = array();
    foreach ($rows as $row) {
        $deals[] = sl_deal_api($row);
    }
    sl_out($conn, 200, array('success' => true, 'data' => $deals));
}

// ============================================================
// POST — 딜 추가. 처음부터 수주면 고객·프로젝트 연결을 만든다.
// ============================================================
if ($method === 'POST') {
    $input = sl_input();
    if (!$input) sl_out($conn, 400, array('error' => 'Invalid JSON'));
    $err = '';
    $f = sl_deal_clean_input($input, $err);
    if ($err !== '') sl_out($conn, 400, array('error' => $err, 'code' => 'invalid'));

    $regTs = isset($f['registrationDate']) ? sl_regist_value($f['registrationDate'], '') : strval(time());
    $vals = array(
        $regTs,
        isset($f['company']) ? $f['company'] : '',
        isset($f['contactName']) ? $f['contactName'] : '',
        isset($f['contactPosition']) ? $f['contactPosition'] : '',
        isset($f['phone']) ? $f['phone'] : '',
        isset($f['email']) ? $f['email'] : '',
        isset($f['address']) ? $f['address'] : '',
        isset($f['desiredService']) ? $f['desiredService'] : '',
        isset($f['detailedQuantity']) ? $f['detailedQuantity'] : '',
        isset($f['requirements']) ? $f['requirements'] : '',
        isset($f['managementMemo']) ? $f['managementMemo'] : '',
        (isset($f['isChecked']) && $f['isChecked']) ? '1' : '0',
        isset($f['status']) ? $f['status'] : 'new',
        isset($f['successStatus']) ? $f['successStatus'] : 'in-progress',
        isset($f['salesManager']) ? $f['salesManager'] : '',
        isset($f['quotationAmount']) ? $f['quotationAmount'] : '',
        isset($f['confirmedWorkDate']) ? $f['confirmedWorkDate'] : '',
        isset($f['totalQuantity']) ? strval($f['totalQuantity']) : '',
    );
    $sql = "INSERT INTO Gn_Online
            (on_regist, on_subject, on_username, on_mobile,
             on_phone, on_email, on_fax, on_option1, on_option2,
             on_content, on_memo, on_viewch,
             on_option3, on_option4, on_option5,
             on_link1, on_link2, on_visit_date, on_site)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'airtor2014')";
    if (!sl_exec($conn, $sql, str_repeat('s', count($vals)), $vals, 'deals_post')) {
        sl_out($conn, 500, array('error' => 'Insert failed'));
    }
    $newId = intval($conn->insert_id);

    $deal = sl_load_deal($conn, $newId);
    $ctx = sl_ctx();
    $transition = null;
    $ok = true;
    if ($deal && sl_is_won($deal['api'])) {
        sl_lock($conn);
        $transition = 'won';
        $ok = sl_link_deal($conn, $deal['api'], $ctx);
    }
    deals_sync_response($conn, $ok, array(
        'success' => true,
        'id' => $newId,
        'deal' => $deal ? $deal['api'] : null,
        'synced' => sl_ctx_synced($ctx),
        'transition' => $transition,
        'warnings' => $ctx['warnings'],
    ));
}

// ============================================================
// PUT — 딜 부분 수정 { id, _v, ...바뀐 칸 }
// 저장 전후를 DB 에서 다시 읽어 실제로 바뀐 항목만 전파한다.
// ============================================================
if ($method === 'PUT') {
    $input = sl_input();
    if (!$input || !isset($input['id'])) sl_out($conn, 400, array('error' => 'Invalid JSON or missing id'));
    if (!isset($input['_v'])) {
        sl_out($conn, 409, array('error' => '새 버전이 배포되었습니다. 화면을 새로고침한 뒤 다시 저장해 주세요.', 'code' => 'reload_required'));
    }
    $id = intval($input['id']);
    $err = '';
    $f = sl_deal_clean_input($input, $err);
    if ($err !== '') sl_out($conn, 400, array('error' => $err, 'code' => 'invalid'));

    sl_lock($conn);
    $before = sl_load_deal($conn, $id);
    if ($before === false) sl_out($conn, 500, array('error' => 'Query failed'));
    if ($before === null) sl_out($conn, 404, array('error' => '딜을 찾을 수 없습니다. 다른 곳에서 삭제됐을 수 있습니다.', 'code' => 'not_found'));

    $n = sl_deal_write($conn, $id, $f, $before);
    if ($n === false) sl_out($conn, 500, array('error' => 'Update failed'));
    $after = ($n > 0) ? sl_load_deal($conn, $id) : $before;
    if (!$after) sl_out($conn, 500, array('error' => 'Reload failed', 'persisted' => true));

    $changed = sl_deal_changed($before['api'], $after['api']);
    $wasWon = sl_is_won($before['api']);
    $nowWon = sl_is_won($after['api']);
    $ctx = sl_ctx();
    $transition = null;
    $ok = true;
    if ($nowWon && !$wasWon) {
        $transition = 'won';
        $ok = sl_link_deal($conn, $after['api'], $ctx);
    } else {
        if ($wasWon && !$nowWon) $transition = 'lost'; // 연결은 그대로 — 화면이 '수주 취소'로 표시
        if (count($changed) > 0) $ok = sl_push_deal($conn, $before['api'], $after['api'], $changed, $ctx);
    }
    deals_sync_response($conn, $ok, array(
        'success' => true,
        'deal' => $after['api'],
        'changed' => $changed,
        'synced' => sl_ctx_synced($ctx),
        'transition' => $transition,
        'warnings' => $ctx['warnings'],
    ));
}

// ============================================================
// DELETE — 딜 삭제 (단건, on_site 조건). 고객 작업이력·프로젝트는 그대로 두고 화면이 '딜 삭제됨'으로 표시.
// ============================================================
if ($method === 'DELETE') {
    $input = sl_input();
    if (!$input || !isset($input['id'])) sl_out($conn, 400, array('error' => 'Missing id'));
    $id = intval($input['id']);
    sl_lock($conn);
    if (!sl_exec($conn, "DELETE FROM Gn_Online WHERE on_num = ? AND on_site = 'airtor2014' LIMIT 1", 'i', array($id), 'deals_delete')) {
        sl_out($conn, 500, array('error' => 'Delete failed'));
    }
    sl_out($conn, 200, array('success' => true));
}

sl_out($conn, 405, array('error' => 'Method not allowed'));
