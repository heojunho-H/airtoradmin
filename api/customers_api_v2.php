<?php
/**
 * ⚠️ 카페24 PHP 5.2.x 호환 코드 — 모던 문법 금지 (api/COMPATIBILITY.md)
 *
 * 고객(거래처) 데이터 API v2 — airtoradmin 전용
 * 테이블: airtor_customers
 *
 * [컬럼 매핑]
 * id                  → id (PK, AUTO_INCREMENT)
 * company             → company (기업명)
 * grade               → grade (등급)
 * customer_status     → customerStatus (고객상태)
 * contact_name        → contactName (담당자명)
 * contact_position    → contactPosition (직책)
 * deals               → deals (딜 수)
 * last_work_date      → lastWorkDate (최근작업일)
 * total_quantity      → totalQuantity (총수량)
 * total_amount        → totalAmount (총금액)
 * management_cycle    → managementCycle (관리주기)
 * next_management_date → nextManagementDate (다음관리일)
 * reminder_status     → reminderStatus (리마인더상태)
 * account_manager     → accountManager (고객책임자)
 * phone               → phone (전화번호)
 * email               → email (이메일)
 * contacts            → contacts (복수 담당자, JSON TEXT: [{name,position,phone,email}]) — 006 마이그레이션
 * newsletter_status   → newsletterStatus (스티비 뉴스레터 상태: none/subscribed/unsubscribed/bounced) — 006
 * stibee_synced_at    → stibeeSyncedAt (스티비 주소록 마지막 동기화 시각) — 006
 * address             → address (주소)
 * field_manager       → fieldManager (현장담당자)
 * memo                → memo (메모)
 * detailed_quantity   → detailedQuantity (상세수량, JSON TEXT)
 * work_history        → workHistory (작업이력, JSON TEXT)
 * email_history       → emailHistory (이메일이력, JSON TEXT)
 * internal_notes      → internalNotes (내부노트, JSON TEXT)
 * created_at          → createdAt (생성일, auto set on POST)
 *
 * v1(customers_api.php)과 다른 점 — docs/data-sync.md
 *  - 작업이력은 통째로 받지 않고 workHistoryPatch 연산으로만 고친다(서버가 현재 값에 적용 → 오래 열어 둔 화면이 덮지 않음).
 *    연결된 항목(dealId)의 작업 값이 바뀌면 딜·프로젝트로, 회사명·주소·담당자가 바뀌면 연결 딜로 전파한다.
 *  - 메일 기록은 emailHistoryAppend 로 덧붙인다. 작업이력·메일기록·내부노트는 `_v` 가 있어야 받는다(없으면 409).
 *  - 삭제하면 이 고객을 가리키던 프로젝트의 customer_id 를 같은 딜의 다른 고객 또는 NULL 로 바꾼다.
 *
 * PUT { id, _v, ...바뀐 칸, contactPairs?:[{old,new}], workHistoryPatch?:[op], emailHistoryAppend?:[entry] }
 *   op: { op:'update', key, set } | { op:'add', entry } | { op:'remove', key, cascade?:'fail-deal' }
 *   key: 'deal:<딜ID>' 또는 'wd:<작업일>|<프로젝트명>|<문의일>#<순번>' (functions/_lib/followups.ts jobKey 호환)
 *   → { success, customer, updated_fields, synced, conflicts, warnings }
 */
error_reporting(0);
ini_set('display_errors', 0);
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

// 006 마이그레이션(contacts / newsletter_status / stibee_synced_at) 적용 여부
$hasNewsletterCols = false;
$_colRes = $conn->query("SHOW COLUMNS FROM airtor_customers LIKE 'newsletter_status'");
if ($_colRes) {
    $hasNewsletterCols = ($_colRes->num_rows > 0);
    $_colRes->free();
}

// DB 행 → API 모양 (v1 GET 과 같다)
function ca_api($row) {
    $contacts = array();
    if (isset($row['contacts']) && $row['contacts'] !== '') {
        $decodedContacts = json_decode($row['contacts'], true);
        if (is_array($decodedContacts)) $contacts = $decodedContacts;
    }
    return array(
        'id' => intval($row['id']),
        'company' => $row['company'] ? $row['company'] : '',
        'grade' => $row['grade'] ? $row['grade'] : '',
        'customerStatus' => $row['customer_status'] ? $row['customer_status'] : '',
        'contactName' => $row['contact_name'] ? $row['contact_name'] : '',
        'contactPosition' => $row['contact_position'] ? $row['contact_position'] : '',
        'deals' => $row['deals'] ? intval($row['deals']) : 0,
        'lastWorkDate' => $row['last_work_date'] ? $row['last_work_date'] : '',
        'totalQuantity' => $row['total_quantity'] ? intval($row['total_quantity']) : 0,
        'totalAmount' => $row['total_amount'] ? intval($row['total_amount']) : 0,
        'managementCycle' => $row['management_cycle'] ? intval($row['management_cycle']) : 0,
        'nextManagementDate' => $row['next_management_date'] ? $row['next_management_date'] : '',
        'reminderStatus' => $row['reminder_status'] ? $row['reminder_status'] : '',
        'accountManager' => $row['account_manager'] ? $row['account_manager'] : '',
        'phone' => $row['phone'] ? $row['phone'] : '',
        'email' => $row['email'] ? $row['email'] : '',
        'address' => $row['address'] ? $row['address'] : '',
        'fieldManager' => $row['field_manager'] ? $row['field_manager'] : '',
        'memo' => $row['memo'] ? $row['memo'] : '',
        'detailedQuantity' => $row['detailed_quantity'] ? json_decode($row['detailed_quantity'], true) : array(),
        'workHistory' => $row['work_history'] ? json_decode($row['work_history'], true) : array(),
        'emailHistory' => $row['email_history'] ? json_decode($row['email_history'], true) : array(),
        'internalNotes' => $row['internal_notes'] ? json_decode($row['internal_notes'], true) : array(),
        'createdAt' => $row['created_at'] ? $row['created_at'] : '',
        'contacts' => $contacts,
        'newsletterStatus' => !empty($row['newsletter_status']) ? $row['newsletter_status'] : 'none',
        'stibeeSyncedAt' => !empty($row['stibee_synced_at']) ? $row['stibee_synced_at'] : ''
    );
}

function ca_reload_required($conn) {
    sl_out($conn, 409, array('error' => '새 버전이 배포되었습니다. 화면을 새로고침한 뒤 다시 저장해 주세요.', 'code' => 'reload_required'));
}

// ============================================================
// GET — 고객 목록 조회 (읽기 전용)
// ============================================================
if ($method === 'GET') {
    $extraCols = $hasNewsletterCols ? ', contacts, newsletter_status, stibee_synced_at' : '';
    $rows = sl_rows($conn, "SELECT id, company, grade, customer_status, contact_name,
                   contact_position, deals, last_work_date, total_quantity,
                   total_amount, management_cycle, next_management_date,
                   reminder_status, account_manager, phone, email, address,
                   field_manager, memo, detailed_quantity, work_history,
                   email_history, internal_notes, created_at" . $extraCols . "
            FROM airtor_customers
            ORDER BY id DESC");
    if ($rows === false) sl_out($conn, 500, array('error' => 'Query failed'));
    $customers = array();
    foreach ($rows as $row) {
        $customers[] = ca_api($row);
    }
    sl_out($conn, 200, array('success' => true, 'data' => $customers));
}

// ============================================================
// POST — 고객 추가 (고객 관리 화면의 '고객 추가'. 딜이 만드는 고객은 sync_lib 가 직접 INSERT)
// ============================================================
if ($method === 'POST') {
    $input = sl_input();
    if (!$input) sl_out($conn, 400, array('error' => 'Invalid JSON'));

    $str = array('company', 'grade', 'customerStatus', 'contactName', 'contactPosition', 'lastWorkDate',
        'nextManagementDate', 'reminderStatus', 'accountManager', 'phone', 'email', 'address', 'fieldManager', 'memo');
    $v = array();
    foreach ($str as $k) {
        $v[$k] = isset($input[$k]) ? sl_str($input[$k]) : '';
    }
    $vals = array(
        $v['company'], $v['grade'], $v['customerStatus'], $v['contactName'], $v['contactPosition'],
        strval(isset($input['deals']) ? intval($input['deals']) : 0), $v['lastWorkDate'],
        strval(isset($input['totalQuantity']) ? intval($input['totalQuantity']) : 0),
        strval(isset($input['totalAmount']) ? intval($input['totalAmount']) : 0),
        strval(isset($input['managementCycle']) ? intval($input['managementCycle']) : 0),
        $v['nextManagementDate'], $v['reminderStatus'], $v['accountManager'], $v['phone'], $v['email'],
        $v['address'], $v['fieldManager'], $v['memo'],
        isset($input['detailedQuantity']) ? json_encode($input['detailedQuantity']) : '[]',
        isset($input['workHistory']) ? json_encode($input['workHistory']) : '[]',
        isset($input['emailHistory']) ? json_encode($input['emailHistory']) : '[]',
        isset($input['internalNotes']) ? json_encode($input['internalNotes']) : '[]',
    );
    $cols = 'company, grade, customer_status, contact_name, contact_position, deals, last_work_date, total_quantity, total_amount, '
        . 'management_cycle, next_management_date, reminder_status, account_manager, phone, email, address, field_manager, memo, '
        . 'detailed_quantity, work_history, email_history, internal_notes';
    if ($hasNewsletterCols) {
        $cols .= ', contacts';
        // contacts 미전송 시 NULL — 화면은 단일 필드(contact_name/email/phone)로 폴백한다.
        $vals[] = (isset($input['contacts']) && is_array($input['contacts'])) ? json_encode($input['contacts']) : null;
    }
    $ph = implode(', ', array_fill(0, count($vals), '?'));
    if (!sl_exec($conn, 'INSERT INTO airtor_customers (' . $cols . ', created_at) VALUES (' . $ph . ', NOW())', str_repeat('s', count($vals)), $vals, 'customers_post')) {
        sl_out($conn, 500, array('error' => 'Insert failed'));
    }
    sl_out($conn, 200, array('success' => true, 'id' => intval($conn->insert_id)));
}

// ============================================================
// PUT — 고객 부분 수정 + 작업이력 패치 + 연결 딜·프로젝트 전파
// ============================================================
if ($method === 'PUT') {
    $input = sl_input();
    if (!$input || !isset($input['id'])) sl_out($conn, 400, array('error' => 'Invalid JSON or missing id'));
    $hasV = isset($input['_v']);
    if (array_key_exists('workHistory', $input)) {
        if (!$hasV) ca_reload_required($conn);
        sl_out($conn, 400, array('error' => '작업이력은 workHistoryPatch 로만 고칠 수 있습니다.', 'code' => 'invalid'));
    }
    if (!$hasV && (array_key_exists('emailHistory', $input) || array_key_exists('internalNotes', $input)
        || array_key_exists('workHistoryPatch', $input) || array_key_exists('emailHistoryAppend', $input))) {
        ca_reload_required($conn);
    }
    $id = intval($input['id']);

    // 키 → (DB 컬럼, bind 타입, 변환 'str'|'int'|'json')
    $fields = array(
        'company'             => array('company',               's', 'str'),
        'grade'               => array('grade',                 's', 'str'),
        'customerStatus'      => array('customer_status',       's', 'str'),
        'contactName'         => array('contact_name',          's', 'str'),
        'contactPosition'     => array('contact_position',      's', 'str'),
        'deals'               => array('deals',                 'i', 'int'),
        'lastWorkDate'        => array('last_work_date',        's', 'str'),
        'totalQuantity'       => array('total_quantity',        'i', 'int'),
        'totalAmount'         => array('total_amount',          'i', 'int'),
        'managementCycle'     => array('management_cycle',      'i', 'int'),
        'nextManagementDate'  => array('next_management_date',  's', 'str'),
        'reminderStatus'      => array('reminder_status',       's', 'str'),
        'accountManager'      => array('account_manager',       's', 'str'),
        'phone'               => array('phone',                 's', 'str'),
        'email'               => array('email',                 's', 'str'),
        'address'             => array('address',               's', 'str'),
        'fieldManager'        => array('field_manager',         's', 'str'),
        'memo'                => array('memo',                  's', 'str'),
        'detailedQuantity'    => array('detailed_quantity',     's', 'json'),
        'emailHistory'        => array('email_history',         's', 'json'),
        'internalNotes'       => array('internal_notes',        's', 'json'),
        'contacts'            => array('contacts',              's', 'json'),
        'newsletterStatus'    => array('newsletter_status',     's', 'str'),
        'stibeeSyncedAt'      => array('stibee_synced_at',      's', 'str'),
    );
    if (!$hasNewsletterCols) {
        unset($fields['contacts'], $fields['newsletterStatus'], $fields['stibeeSyncedAt']);
    }

    sl_lock($conn);
    $before = sl_customer($conn, $id);
    if ($before === false) sl_out($conn, 500, array('error' => 'Query failed'));
    if ($before === null) sl_out($conn, 404, array('error' => '고객을 찾을 수 없습니다. 다른 곳에서 삭제됐을 수 있습니다.', 'code' => 'not_found'));

    $set = array();
    $updated = array();
    foreach ($fields as $inKey => $meta) {
        if (!array_key_exists($inKey, $input)) continue;
        $col = $meta[0];
        $raw = $input[$inKey];
        $updated[] = $inKey;
        if ($inKey === 'stibeeSyncedAt' && ($raw === '' || $raw === null)) {
            $set[$col] = array('s', null); // DATETIME 에 빈 문자열은 strict 모드에서 실패
        } elseif ($meta[2] === 'int') {
            $set[$col] = array('i', intval($raw));
        } elseif ($meta[2] === 'json') {
            $json = json_encode($raw);
            if (strlen($json) > SL_MAX_JSON) sl_out($conn, 400, array('error' => $inKey . ' 이(가) 너무 큽니다.', 'code' => 'too_large'));
            $set[$col] = array('s', $json);
        } else {
            $set[$col] = array('s', sl_str($raw));
        }
    }
    // 담당자 목록을 보냈으면 예전 단일 칸은 첫 담당자로 맞춘다
    if (array_key_exists('contacts', $input) && is_array($input['contacts']) && $hasNewsletterCols) {
        $list = array();
        foreach ($input['contacts'] as $c) {
            if (is_array($c)) $list[] = sl_contact_norm($c);
        }
        $cs = sl_contacts_set($conn, $list);
        foreach ($cs as $k => $v) {
            $set[$k] = $v;
        }
    }

    // 작업이력 패치 — 서버가 현재 값에 적용한다
    $patchRes = null;
    $newWh = null;
    if (array_key_exists('workHistoryPatch', $input)) {
        if (!$before['_wh_ok']) sl_out($conn, 500, array('error' => '작업이력 데이터가 손상되어 저장을 멈췄습니다. 관리자에게 알려 주세요.', 'code' => 'broken_json'));
        $newWh = sl_apply_wh_patch($before['_wh'], $input['workHistoryPatch'], $patchRes);
        if ($patchRes['error'] !== '') sl_out($conn, 400, array('error' => $patchRes['error'], 'code' => 'invalid'));
        $updated[] = 'workHistory';
    }

    // 메일 기록 덧붙이기 (후속 안내 실행기)
    if (array_key_exists('emailHistoryAppend', $input) && is_array($input['emailHistoryAppend'])) {
        $ok = true;
        $ledger = sl_decode_list(isset($before['email_history']) ? $before['email_history'] : '', $ok);
        if (!$ok) sl_out($conn, 500, array('error' => '메일 기록 데이터가 손상되어 저장을 멈췄습니다.', 'code' => 'broken_json'));
        foreach ($input['emailHistoryAppend'] as $le) {
            if (is_array($le)) $ledger[] = $le;
        }
        $json = json_encode($ledger);
        if (strlen($json) > SL_MAX_JSON) sl_out($conn, 500, array('error' => '메일 기록이 너무 커서 저장하지 못했습니다.', 'code' => 'too_large'));
        $set['email_history'] = array('s', $json);
        $updated[] = 'emailHistory';
    }

    $whChanged = ($newWh !== null && $patchRes['changed']);
    if (count($set) === 0 && !$whChanged) {
        sl_out($conn, 200, array(
            'success' => true, 'note' => 'no fields to update', 'customer' => ca_api($before),
            'updated_fields' => array(), 'synced' => sl_ctx_synced(sl_ctx()),
            'conflicts' => ($patchRes ? $patchRes['conflicts'] : array()), 'warnings' => array(),
        ));
    }

    if ($whChanged) {
        // 작업이력이 바뀌면 집계(작업 수·총수량·총금액·최근 작업일·고객상태)는 서버가 다시 계산한다
        unset($set['deals'], $set['total_quantity'], $set['total_amount'], $set['last_work_date']);
        $base = $before;
        if (isset($set['customer_status'])) $base['customer_status'] = $set['customer_status'][1];
        unset($set['customer_status']);
        $saved = sl_customer_save_wh($conn, $base, $newWh, $set);
    } else {
        $saved = sl_update($conn, 'airtor_customers', 'id', $id, $set, 'customers_put', '');
    }
    if (!$saved) sl_out($conn, 500, array('error' => 'Update failed'));

    // 전파
    $ctx = sl_ctx();
    $syncOk = true;
    if ($patchRes) {
        foreach ($patchRes['pushes'] as $dealId => $jobSet) {
            if ($syncOk) $syncOk = sl_push_wh($conn, $id, intval($dealId), $jobSet, $ctx);
        }
        foreach ($patchRes['reports'] as $dealId) {
            if ($syncOk) $syncOk = sl_project_report_complete($conn, intval($dealId), $ctx);
        }
        foreach ($patchRes['removed'] as $dealId) {
            if ($syncOk) $syncOk = sl_after_entry_removed($conn, $id, intval($dealId), $ctx);
        }
        $ctx['conflicts'] = $patchRes['conflicts'];
    }
    $after = sl_customer($conn, $id);
    if ($syncOk && $after) {
        $pairs = (isset($input['contactPairs']) && is_array($input['contactPairs'])) ? $input['contactPairs'] : array();
        $syncOk = sl_push_customer($conn, $before, $after, $pairs, $ctx);
    }

    $resp = array(
        'success' => $syncOk,
        'customer' => $after ? ca_api($after) : null,
        'updated_fields' => $updated,
        'synced' => sl_ctx_synced($ctx),
        'conflicts' => $ctx['conflicts'],
        'warnings' => $ctx['warnings'],
    );
    if (!$syncOk) {
        $resp['persisted'] = true;
        $resp['error'] = '고객 정보는 저장했지만 연결된 딜·프로젝트에 반영하지 못했습니다. 잠시 후 다시 저장해 주세요.';
        sl_out($conn, 500, $resp);
    }
    sl_out($conn, 200, $resp);
}

// ============================================================
// DELETE — 고객 삭제 (단건). 이 고객을 가리키던 프로젝트는 같은 딜의 다른 고객 또는 NULL 로.
// ============================================================
if ($method === 'DELETE') {
    $input = sl_input();
    if (!$input || !isset($input['id'])) sl_out($conn, 400, array('error' => 'Missing id'));
    $id = intval($input['id']);
    sl_lock($conn);
    $projs = sl_rows($conn, 'SELECT id, deal_id, customer_id FROM airtor_projects WHERE customer_id = ' . $id);
    if ($projs === false) sl_out($conn, 500, array('error' => 'Query failed'));
    if (!sl_exec($conn, 'DELETE FROM airtor_customers WHERE id = ? LIMIT 1', 'i', array($id), 'customers_delete')) {
        sl_out($conn, 500, array('error' => 'Delete failed'));
    }
    $ctx = sl_ctx();
    foreach ($projs as $p) {
        $holders = sl_find_holders($conn, intval($p['deal_id']));
        $next = ($holders && count($holders) > 0) ? intval($holders[0]['id']) : null;
        sl_project_apply($conn, $p, array('customerId' => $next), $ctx);
    }
    sl_out($conn, 200, array('success' => true, 'synced' => sl_ctx_synced($ctx)));
}

sl_out($conn, 405, array('error' => 'Method not allowed'));
