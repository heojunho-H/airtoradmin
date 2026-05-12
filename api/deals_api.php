<?php
error_reporting(0);
ini_set('display_errors', 0);

/**
 * 영업(딜) 데이터 API — airtoradmin 전용
 * 테이블: Gn_Online (문의하기 폼과 동일한 테이블)
 *
 * [컬럼 매핑]
 * on_num          → id (PK)
 * on_regist       → registrationDate (unix timestamp)
 * on_subject      → company (기업명)
 * on_username     → contactName (담당자명)
 * on_mobile       → contactPosition (직책)
 * on_phone        → phone (전화번호)
 * on_email        → email (이메일)
 * on_fax          → address (주소)
 * on_option1      → desiredService (희망서비스)
 * on_option2      → detailedQuantity (상세수량)
 * on_content      → requirements (세부사항)
 * on_memo         → managementMemo (관리 메모)
 * on_viewch       → isChecked (확인여부)
 * --- 관리용 필드 (빈 컬럼 활용) ---
 * on_option3      → status (진행상태)
 * on_option4      → successStatus (성공여부)
 * on_option5      → salesManager (고객책임자)
 * on_link1        → quotationAmount (견적금액)
 * on_link2        → confirmedWorkDate (확정작업일)
 * on_visit_date   → totalQuantity (총수량)
 * on_userfile1_oname → file1Name (첨부파일1 원본명)
 * on_userfile1_rname → file1Path (첨부파일1 저장명)
 * on_userfile2_oname → file2Name (첨부파일2 원본명)
 * on_userfile2_rname → file2Path (첨부파일2 저장명)
 * on_userfile3_oname → file3Name (첨부파일3 원본명)
 * on_userfile3_rname → file3Path (첨부파일3 저장명)
 *
 * [안전 규칙]
 * - SELECT: 기존 데이터 변형 없이 읽기만 수행
 * - INSERT: 매핑된 필드만 설정, 나머지는 DB 기본값 유지
 * - UPDATE: 매핑된 필드만 수정, on_num 기준 WHERE 조건
 * - DELETE: on_num 단건 삭제만 허용
 * - 모든 쿼리에 prepared statement 사용 (SQL Injection 방지)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ============================================================
// 회사명 정규화 — 표기 변형 매칭용
// "(주) 플리", "주식회사 플리", " 플리 " → "플리"
// 영업관리/고객관리 양쪽에서 동일 규칙 적용 (TS 사본: src/lib/company.ts)
// ============================================================
function normalizeCompanyName($name) {
    if (!$name) return '';
    $name = trim($name);
    $patterns = array(
        '/주식회사\s*/u', '/\(주\)\s*/u',
        '/유한회사\s*/u', '/\(유\)\s*/u',
        '/사단법인\s*/u', '/\(사\)\s*/u',
        '/재단법인\s*/u', '/\(재\)\s*/u',
        '/의료법인\s*/u', '/\(의\)\s*/u',
        '/학교법인\s*/u', '/\(학\)\s*/u',
    );
    foreach ($patterns as $p) {
        $name = preg_replace($p, '', $name);
    }
    return preg_replace('/\s+/u', '', $name);
}

// 견적금액 문자열을 정수로 변환 ("₩790만"→7900000, "7900000"→7900000)
function parseQuotationAmount($str) {
    if (!$str) return 0;
    $hasUk = strpos($str, '억') !== false;
    $hasMan = strpos($str, '만') !== false;
    $cleaned = preg_replace('/[^0-9.]/', '', $str);
    if ($cleaned === '') return 0;
    $num = floatval($cleaned);
    if ($hasUk) return intval($num * 100000000);
    if ($hasMan) return intval($num * 10000);
    return intval($num);
}

// ============================================================
// 딜 → 고객 자동 동기화
// 트리거: status='confirmed' 또는 successStatus='success'
// 매칭: 정규화된 회사명으로 기존 고객 검색
//   - 신규 고객이면 INSERT (workHistory 1건 포함)
//   - 기존 고객이면 workHistory를 dealId 기준으로 upsert + 집계 재계산
// 멱등성: dealId 키로 중복 방지 (legacy 엔트리는 inquiryDate로 폴백 매칭)
// ============================================================
function syncDealToCustomer($conn, $deal) {
    $isSuccess = (isset($deal['status']) && $deal['status'] === 'confirmed')
              || (isset($deal['successStatus']) && $deal['successStatus'] === 'success');
    if (!$isSuccess) return;

    $company = isset($deal['company']) ? trim($deal['company']) : '';
    if ($company === '') return;
    $normalizedTarget = normalizeCompanyName($company);
    if ($normalizedTarget === '') return;

    $today = date('Y-m-d');
    $dealId = intval($deal['id']);
    $inquiryDate = !empty($deal['registrationDate']) ? $deal['registrationDate'] : $today;
    $workDate = !empty($deal['confirmedWorkDate']) ? $deal['confirmedWorkDate'] : $today;
    $amount = parseQuotationAmount(isset($deal['quotationAmount']) ? $deal['quotationAmount'] : '');
    $totalQty = isset($deal['totalQuantity']) ? intval($deal['totalQuantity']) : 0;
    $service = isset($deal['desiredService']) ? $deal['desiredService'] : '';
    $detailedQty = isset($deal['detailedQuantity']) ? $deal['detailedQuantity'] : '';
    $salesManager = isset($deal['salesManager']) ? $deal['salesManager'] : '';

    $workEntry = array(
        'dealId' => $dealId,
        'inquiryDate' => $inquiryDate,
        'projectName' => $service,
        'totalQuantity' => $totalQty,
        'detailedQuantity' => $detailedQty,
        'quotationAmount' => $amount,
        'accountManager' => $salesManager,
        'workDate' => $workDate,
        'subcontractorManager' => '',
        'reportSent' => false,
        'reminder1' => false,
        'reminder2' => false,
        'reminder3' => false,
    );

    // 정규화 매칭으로 기존 고객 검색 (전체 스캔, ~100건 규모)
    $matched = null;
    $res = $conn->query("SELECT id, company, work_history, customer_status FROM airtor_customers");
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            if (normalizeCompanyName($row['company']) === $normalizedTarget) {
                $matched = $row;
                break;
            }
        }
        $res->free();
    }

    if (!$matched) {
        // 신규 고객 INSERT
        $nextDate = date('Y-m-d', strtotime('+365 days'));
        $contactName = isset($deal['contactName']) ? $deal['contactName'] : '';
        $contactPosition = isset($deal['contactPosition']) ? $deal['contactPosition'] : '';
        $phone = isset($deal['phone']) ? $deal['phone'] : '';
        $email = isset($deal['email']) ? $deal['email'] : '';
        $address = isset($deal['address']) ? $deal['address'] : '';
        $memo = isset($deal['managementMemo']) ? $deal['managementMemo'] : '';
        $requirements = !empty($deal['requirements']) ? $deal['requirements'] : '없음';

        $internalNotes = json_encode(array(array(
            'id' => 1,
            'author' => $salesManager,
            'date' => $today,
            'content' => '영업관리에서 자동 등록됨. 요구사항: ' . $requirements,
        )), JSON_UNESCAPED_UNICODE);
        $detailedQuantityJson = !empty($detailedQty)
            ? json_encode(array(array('item' => $service, 'quantity' => $totalQty)), JSON_UNESCAPED_UNICODE)
            : '[]';
        $workHistoryJson = json_encode(array($workEntry), JSON_UNESCAPED_UNICODE);
        $grade = '미설정';
        $customerStatus = '신규';
        $deals = 1;
        $managementCycle = 365;
        $reminderStatus = '미발송';
        $fieldManager = '';
        $emailHistory = '[]';

        $sql = "INSERT INTO airtor_customers
            (company, grade, customer_status, contact_name, contact_position,
             deals, last_work_date, total_quantity, total_amount,
             management_cycle, next_management_date, reminder_status,
             account_manager, phone, email, address, field_manager, memo,
             detailed_quantity, work_history, email_history, internal_notes,
             created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())";
        $stmt = $conn->prepare($sql);
        if (!$stmt) return;
        $stmt->bind_param('ssssssssssssssssssssss',
            $company, $grade, $customerStatus, $contactName, $contactPosition,
            $deals, $workDate, $totalQty, $amount,
            $managementCycle, $nextDate, $reminderStatus,
            $salesManager, $phone, $email, $address, $fieldManager, $memo,
            $detailedQuantityJson, $workHistoryJson, $emailHistory, $internalNotes
        );
        $stmt->execute();
        $stmt->close();
        return;
    }

    // 기존 고객: workHistory upsert (dealId → inquiryDate 폴백)
    $existing = !empty($matched['work_history']) ? json_decode($matched['work_history'], true) : array();
    if (!is_array($existing)) $existing = array();

    $foundIdx = -1;
    foreach ($existing as $i => $entry) {
        if (isset($entry['dealId']) && intval($entry['dealId']) === $dealId) {
            $foundIdx = $i;
            break;
        }
    }
    if ($foundIdx === -1) {
        // legacy 엔트리: dealId 없는 것 중 inquiryDate 일치하는 첫 번째
        foreach ($existing as $i => $entry) {
            if (!isset($entry['dealId']) && isset($entry['inquiryDate']) && $entry['inquiryDate'] === $inquiryDate) {
                $foundIdx = $i;
                break;
            }
        }
    }

    if ($foundIdx >= 0) {
        // 사용자가 편집했을 수 있는 워크플로우 필드는 보존
        $preserved = array(
            'subcontractorManager' => isset($existing[$foundIdx]['subcontractorManager']) ? $existing[$foundIdx]['subcontractorManager'] : '',
            'reportSent' => isset($existing[$foundIdx]['reportSent']) ? $existing[$foundIdx]['reportSent'] : false,
            'reminder1' => isset($existing[$foundIdx]['reminder1']) ? $existing[$foundIdx]['reminder1'] : false,
            'reminder2' => isset($existing[$foundIdx]['reminder2']) ? $existing[$foundIdx]['reminder2'] : false,
            'reminder3' => isset($existing[$foundIdx]['reminder3']) ? $existing[$foundIdx]['reminder3'] : false,
        );
        $existing[$foundIdx] = array_merge($workEntry, $preserved);
    } else {
        $existing[] = $workEntry;
    }

    // 집계 재계산
    $sumQty = 0; $sumAmt = 0; $maxWorkDate = '';
    foreach ($existing as $entry) {
        $sumQty += isset($entry['totalQuantity']) ? intval($entry['totalQuantity']) : 0;
        $sumAmt += isset($entry['quotationAmount']) ? intval($entry['quotationAmount']) : 0;
        $wd = isset($entry['workDate']) ? $entry['workDate'] : '';
        if ($wd > $maxWorkDate) $maxWorkDate = $wd;
    }
    $dealCount = count($existing);
    $newJson = json_encode($existing, JSON_UNESCAPED_UNICODE);
    $custId = intval($matched['id']);

    // 작업횟수 → 고객상태 자동 라벨링 규칙
    // deals >= 3 → 충성고객, deals === 2 → 재구매, deals 0/1 → 기존 값 유지
    $currentStatus = isset($matched['customer_status']) ? $matched['customer_status'] : '';
    if ($dealCount >= 3) {
        $newStatus = '충성고객';
    } elseif ($dealCount === 2) {
        $newStatus = '재구매';
    } else {
        $newStatus = ($currentStatus !== '' && $currentStatus !== null) ? $currentStatus : '신규';
    }

    $stmt = $conn->prepare("UPDATE airtor_customers
        SET work_history = ?, deals = ?, total_quantity = ?, total_amount = ?, last_work_date = ?, customer_status = ?
        WHERE id = ?");
    if (!$stmt) return;
    $stmt->bind_param('siiissi', $newJson, $dealCount, $sumQty, $sumAmt, $maxWorkDate, $newStatus, $custId);
    $stmt->execute();
    $stmt->close();
}

$conn = new mysqli('localhost', 'airtor2014', 'aesd1122!', 'airtor2014');
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(array('error' => 'DB connection failed'));
    exit;
}
$conn->set_charset('utf8');

$method = $_SERVER['REQUEST_METHOD'];

// ============================================================
// GET — 딜 목록 조회 (읽기 전용, 기존 데이터 변형 없음)
// ============================================================
if ($method === 'GET') {
    $sql = "SELECT on_num, on_regist, on_subject, on_username, on_mobile,
                   on_phone, on_email, on_fax, on_option1, on_option2,
                   on_content, on_memo, on_viewch,
                   on_option3, on_option4, on_option5,
                   on_link1, on_link2, on_visit_date,
                   on_userfile1_oname, on_userfile1_rname,
                   on_userfile2_oname, on_userfile2_rname,
                   on_userfile3_oname, on_userfile3_rname
            FROM Gn_Online
            WHERE on_site = 'airtor2014'
            ORDER BY on_num DESC";

    $result = $conn->query($sql);
    if (!$result) {
        http_response_code(500);
        echo json_encode(array('error' => 'Query failed'));
        $conn->close();
        exit;
    }

    $deals = array();
    while ($row = $result->fetch_assoc()) {
        // on_regist는 unix timestamp → YYYY-MM-DD 변환
        $regDate = '';
        if ($row['on_regist'] && is_numeric($row['on_regist'])) {
            $regDate = date('Y-m-d', intval($row['on_regist']));
        } else if ($row['on_regist']) {
            $regDate = substr($row['on_regist'], 0, 10);
        }

        // on_option3/4/5 는 고객 폼 데이터와 충돌 — 유효한 관리값이 아니면 기본값으로 대체
        $validStatuses = array('new','call','quote-sent','quote-call','price-negotiation','schedule','confirmed');
        $rawStatus = ($row['on_option3'] !== '' && $row['on_option3'] !== null) ? $row['on_option3'] : '';
        $statusVal = in_array($rawStatus, $validStatuses) ? $rawStatus : 'new';

        $validSuccess = array('in-progress','success','failed','no-quote');
        $rawSuccess = ($row['on_option4'] !== '' && $row['on_option4'] !== null) ? $row['on_option4'] : '';
        $successVal = in_array($rawSuccess, $validSuccess) ? $rawSuccess : 'in-progress';

        $formMethods = array('simple','detail','file');
        $rawManager = $row['on_option5'] ? $row['on_option5'] : '';
        $managerVal = in_array($rawManager, $formMethods) ? '' : $rawManager;

        $deals[] = array(
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

    echo json_encode(array('success' => true, 'data' => $deals));
    $conn->close();
    exit;
}

// ============================================================
// POST — 딜 추가 (매핑 필드만 설정, 나머지 DB 기본값 유지)
// ============================================================
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(array('error' => 'Invalid JSON'));
        $conn->close();
        exit;
    }

    $now = time();

    $sql = "INSERT INTO Gn_Online
            (on_regist, on_subject, on_username, on_mobile,
             on_phone, on_email, on_fax, on_option1, on_option2,
             on_content, on_memo, on_viewch,
             on_option3, on_option4, on_option5,
             on_link1, on_link2, on_visit_date, on_site)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'airtor2014')";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(array('error' => 'Prepare failed'));
        $conn->close();
        exit;
    }

    // registrationDate → unix timestamp
    $regTimestamp = strval($now);
    if (isset($input['registrationDate']) && $input['registrationDate'] !== '') {
        $ts = strtotime($input['registrationDate']);
        if ($ts !== false) $regTimestamp = strval($ts);
    }

    $company = isset($input['company']) ? $input['company'] : '';
    $contactName = isset($input['contactName']) ? $input['contactName'] : '';
    $contactPosition = isset($input['contactPosition']) ? $input['contactPosition'] : '';
    $phone = isset($input['phone']) ? $input['phone'] : '';
    $email = isset($input['email']) ? $input['email'] : '';
    $address = isset($input['address']) ? $input['address'] : '';
    $desiredService = isset($input['desiredService']) ? $input['desiredService'] : '';
    $detailedQuantity = isset($input['detailedQuantity']) ? $input['detailedQuantity'] : '';
    $requirements = isset($input['requirements']) ? $input['requirements'] : '';
    $managementMemo = isset($input['managementMemo']) ? $input['managementMemo'] : '';
    $isChecked = (!empty($input['isChecked']) && $input['isChecked']) ? '1' : '0';
    $status = isset($input['status']) ? $input['status'] : 'new';
    $successStatus = isset($input['successStatus']) ? $input['successStatus'] : 'in-progress';
    $salesManager = isset($input['salesManager']) ? $input['salesManager'] : '';
    $quotationAmount = isset($input['quotationAmount']) ? $input['quotationAmount'] : '';
    $confirmedWorkDate = isset($input['confirmedWorkDate']) ? $input['confirmedWorkDate'] : '';
    $totalQuantity = isset($input['totalQuantity']) ? strval($input['totalQuantity']) : '';

    $stmt->bind_param('ssssssssssssssssss',
        $regTimestamp, $company, $contactName, $contactPosition,
        $phone, $email, $address, $desiredService, $detailedQuantity,
        $requirements, $managementMemo, $isChecked,
        $status, $successStatus, $salesManager,
        $quotationAmount, $confirmedWorkDate, $totalQuantity
    );

    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode(array('error' => 'Insert failed: ' . $stmt->error));
        $stmt->close();
        $conn->close();
        exit;
    }

    $newId = $conn->insert_id;
    $stmt->close();

    // 새 딜이 처음부터 성공 상태로 추가되면 고객 자동 동기화
    $dealForSync = $input;
    $dealForSync['id'] = $newId;
    syncDealToCustomer($conn, $dealForSync);

    echo json_encode(array('success' => true, 'id' => $newId));
    $conn->close();
    exit;
}

// ============================================================
// PUT — 딜 수정 (매핑 필드만 UPDATE, on_num 기준)
// 주의: on_regist, on_subject, on_username, on_phone, on_email,
//       on_fax, on_option1, on_option2, on_content 등
//       문의 원본 데이터도 수정 가능 (관리자 편집 용도)
// ============================================================
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        http_response_code(400);
        echo json_encode(array('error' => 'Invalid JSON or missing id'));
        $conn->close();
        exit;
    }

    $sql = "UPDATE Gn_Online SET
                on_subject = ?, on_username = ?, on_mobile = ?,
                on_phone = ?, on_email = ?, on_fax = ?,
                on_option1 = ?, on_option2 = ?,
                on_content = ?, on_memo = ?, on_viewch = ?,
                on_option3 = ?, on_option4 = ?, on_option5 = ?,
                on_link1 = ?, on_link2 = ?, on_visit_date = ?
            WHERE on_num = ?";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(array('error' => 'Prepare failed'));
        $conn->close();
        exit;
    }

    $company = isset($input['company']) ? $input['company'] : '';
    $contactName = isset($input['contactName']) ? $input['contactName'] : '';
    $contactPosition = isset($input['contactPosition']) ? $input['contactPosition'] : '';
    $phone = isset($input['phone']) ? $input['phone'] : '';
    $email = isset($input['email']) ? $input['email'] : '';
    $address = isset($input['address']) ? $input['address'] : '';
    $desiredService = isset($input['desiredService']) ? $input['desiredService'] : '';
    $detailedQuantity = isset($input['detailedQuantity']) ? $input['detailedQuantity'] : '';
    $requirements = isset($input['requirements']) ? $input['requirements'] : '';
    $managementMemo = isset($input['managementMemo']) ? $input['managementMemo'] : '';
    $isChecked = (!empty($input['isChecked']) && $input['isChecked']) ? '1' : '0';
    $status = isset($input['status']) ? $input['status'] : 'new';
    $successStatus = isset($input['successStatus']) ? $input['successStatus'] : 'in-progress';
    $salesManager = isset($input['salesManager']) ? $input['salesManager'] : '';
    $quotationAmount = isset($input['quotationAmount']) ? $input['quotationAmount'] : '';
    $confirmedWorkDate = isset($input['confirmedWorkDate']) ? $input['confirmedWorkDate'] : '';
    $totalQuantity = isset($input['totalQuantity']) ? strval($input['totalQuantity']) : '';
    $id = intval($input['id']);

    $stmt->bind_param('sssssssssssssssssi',
        $company, $contactName, $contactPosition,
        $phone, $email, $address,
        $desiredService, $detailedQuantity,
        $requirements, $managementMemo, $isChecked,
        $status, $successStatus, $salesManager,
        $quotationAmount, $confirmedWorkDate, $totalQuantity,
        $id
    );

    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode(array('error' => 'Update failed: ' . $stmt->error));
        $stmt->close();
        $conn->close();
        exit;
    }

    $stmt->close();

    // 딜이 성공/수주확정 상태로 저장되면 고객 자동 동기화
    $dealForSync = $input;
    $dealForSync['id'] = $id;
    syncDealToCustomer($conn, $dealForSync);

    echo json_encode(array('success' => true));
    $conn->close();
    exit;
}

// ============================================================
// DELETE — 딜 삭제 (단건만, on_site 조건으로 안전하게)
// ============================================================
if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        http_response_code(400);
        echo json_encode(array('error' => 'Missing id'));
        $conn->close();
        exit;
    }

    $sql = "DELETE FROM Gn_Online WHERE on_num = ? AND on_site = 'airtor2014' LIMIT 1";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(array('error' => 'Prepare failed'));
        $conn->close();
        exit;
    }

    $id = intval($input['id']);
    $stmt->bind_param('i', $id);

    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode(array('error' => 'Delete failed'));
        $stmt->close();
        $conn->close();
        exit;
    }

    $stmt->close();
    echo json_encode(array('success' => true));
    $conn->close();
    exit;
}

http_response_code(405);
echo json_encode(array('error' => 'Method not allowed'));
$conn->close();