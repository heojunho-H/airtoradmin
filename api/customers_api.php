<?php
/**
 * 고객(거래처) 데이터 API — airtoradmin 전용
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
 * address             → address (주소)
 * field_manager       → fieldManager (현장담당자)
 * memo                → memo (메모)
 * detailed_quantity   → detailedQuantity (상세수량, JSON TEXT)
 * work_history        → workHistory (작업이력, JSON TEXT)
 * email_history       → emailHistory (이메일이력, JSON TEXT)
 * internal_notes      → internalNotes (내부노트, JSON TEXT)
 * created_at          → createdAt (생성일, auto set on POST)
 *
 * [안전 규칙]
 * - SELECT: 기존 데이터 변형 없이 읽기만 수행
 * - INSERT: 매핑된 필드만 설정, 나머지는 DB 기본값 유지
 * - UPDATE: 매핑된 필드만 수정, id 기준 WHERE 조건
 * - DELETE: id 단건 삭제만 허용 (LIMIT 1)
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

$conn = new mysqli('localhost', 'airtor2014', 'aesd1122!', 'airtor2014');
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(array('error' => 'DB connection failed'));
    exit;
}
$conn->set_charset('utf8');

$method = $_SERVER['REQUEST_METHOD'];

// ============================================================
// GET — 고객 목록 조회 (읽기 전용, 기존 데이터 변형 없음)
// ============================================================
if ($method === 'GET') {
    $sql = "SELECT id, company, grade, customer_status, contact_name,
                   contact_position, deals, last_work_date, total_quantity,
                   total_amount, management_cycle, next_management_date,
                   reminder_status, account_manager, phone, email, address,
                   field_manager, memo, detailed_quantity, work_history,
                   email_history, internal_notes, created_at
            FROM airtor_customers
            ORDER BY id DESC";

    $result = $conn->query($sql);
    if (!$result) {
        http_response_code(500);
        echo json_encode(array('error' => 'Query failed'));
        $conn->close();
        exit;
    }

    $customers = array();
    while ($row = $result->fetch_assoc()) {
        $customers[] = array(
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
            'createdAt' => $row['created_at'] ? $row['created_at'] : ''
        );
    }

    echo json_encode(array('success' => true, 'data' => $customers));
    $conn->close();
    exit;
}

// ============================================================
// POST — 고객 추가 (매핑 필드만 설정, 나머지 DB 기본값 유지)
// ============================================================
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(array('error' => 'Invalid JSON'));
        $conn->close();
        exit;
    }

    $sql = "INSERT INTO airtor_customers
            (company, grade, customer_status, contact_name, contact_position,
             deals, last_work_date, total_quantity, total_amount,
             management_cycle, next_management_date, reminder_status,
             account_manager, phone, email, address, field_manager, memo,
             detailed_quantity, work_history, email_history, internal_notes,
             created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(array('error' => 'Prepare failed'));
        $conn->close();
        exit;
    }

    $company = isset($input['company']) ? $input['company'] : '';
    $grade = isset($input['grade']) ? $input['grade'] : '';
    $customerStatus = isset($input['customerStatus']) ? $input['customerStatus'] : '';
    $contactName = isset($input['contactName']) ? $input['contactName'] : '';
    $contactPosition = isset($input['contactPosition']) ? $input['contactPosition'] : '';
    $deals = isset($input['deals']) ? intval($input['deals']) : 0;
    $lastWorkDate = isset($input['lastWorkDate']) ? $input['lastWorkDate'] : '';
    $totalQuantity = isset($input['totalQuantity']) ? intval($input['totalQuantity']) : 0;
    $totalAmount = isset($input['totalAmount']) ? intval($input['totalAmount']) : 0;
    $managementCycle = isset($input['managementCycle']) ? intval($input['managementCycle']) : 0;
    $nextManagementDate = isset($input['nextManagementDate']) ? $input['nextManagementDate'] : '';
    $reminderStatus = isset($input['reminderStatus']) ? $input['reminderStatus'] : '';
    $accountManager = isset($input['accountManager']) ? $input['accountManager'] : '';
    $phone = isset($input['phone']) ? $input['phone'] : '';
    $email = isset($input['email']) ? $input['email'] : '';
    $address = isset($input['address']) ? $input['address'] : '';
    $fieldManager = isset($input['fieldManager']) ? $input['fieldManager'] : '';
    $memo = isset($input['memo']) ? $input['memo'] : '';
    $detailedQuantity = isset($input['detailedQuantity']) ? json_encode($input['detailedQuantity']) : '[]';
    $workHistory = isset($input['workHistory']) ? json_encode($input['workHistory']) : '[]';
    $emailHistory = isset($input['emailHistory']) ? json_encode($input['emailHistory']) : '[]';
    $internalNotes = isset($input['internalNotes']) ? json_encode($input['internalNotes']) : '[]';

    $stmt->bind_param('ssssssssssssssssssssss',
        $company, $grade, $customerStatus, $contactName, $contactPosition,
        $deals, $lastWorkDate, $totalQuantity, $totalAmount,
        $managementCycle, $nextManagementDate, $reminderStatus,
        $accountManager, $phone, $email, $address, $fieldManager, $memo,
        $detailedQuantity, $workHistory, $emailHistory, $internalNotes
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

    echo json_encode(array('success' => true, 'id' => $newId));
    $conn->close();
    exit;
}

// ============================================================
// PUT — 고객 수정 (매핑 필드만 UPDATE, id 기준)
// ============================================================
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        http_response_code(400);
        echo json_encode(array('error' => 'Invalid JSON or missing id'));
        $conn->close();
        exit;
    }

    $sql = "UPDATE airtor_customers SET
                company = ?, grade = ?, customer_status = ?,
                contact_name = ?, contact_position = ?, deals = ?,
                last_work_date = ?, total_quantity = ?, total_amount = ?,
                management_cycle = ?, next_management_date = ?,
                reminder_status = ?, account_manager = ?,
                phone = ?, email = ?, address = ?,
                field_manager = ?, memo = ?,
                detailed_quantity = ?, work_history = ?,
                email_history = ?, internal_notes = ?
            WHERE id = ?";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(array('error' => 'Prepare failed'));
        $conn->close();
        exit;
    }

    $company = isset($input['company']) ? $input['company'] : '';
    $grade = isset($input['grade']) ? $input['grade'] : '';
    $customerStatus = isset($input['customerStatus']) ? $input['customerStatus'] : '';
    $contactName = isset($input['contactName']) ? $input['contactName'] : '';
    $contactPosition = isset($input['contactPosition']) ? $input['contactPosition'] : '';
    $deals = isset($input['deals']) ? intval($input['deals']) : 0;
    $lastWorkDate = isset($input['lastWorkDate']) ? $input['lastWorkDate'] : '';
    $totalQuantity = isset($input['totalQuantity']) ? intval($input['totalQuantity']) : 0;
    $totalAmount = isset($input['totalAmount']) ? intval($input['totalAmount']) : 0;
    $managementCycle = isset($input['managementCycle']) ? intval($input['managementCycle']) : 0;
    $nextManagementDate = isset($input['nextManagementDate']) ? $input['nextManagementDate'] : '';
    $reminderStatus = isset($input['reminderStatus']) ? $input['reminderStatus'] : '';
    $accountManager = isset($input['accountManager']) ? $input['accountManager'] : '';
    $phone = isset($input['phone']) ? $input['phone'] : '';
    $email = isset($input['email']) ? $input['email'] : '';
    $address = isset($input['address']) ? $input['address'] : '';
    $fieldManager = isset($input['fieldManager']) ? $input['fieldManager'] : '';
    $memo = isset($input['memo']) ? $input['memo'] : '';
    $detailedQuantity = isset($input['detailedQuantity']) ? json_encode($input['detailedQuantity']) : '[]';
    $workHistory = isset($input['workHistory']) ? json_encode($input['workHistory']) : '[]';
    $emailHistory = isset($input['emailHistory']) ? json_encode($input['emailHistory']) : '[]';
    $internalNotes = isset($input['internalNotes']) ? json_encode($input['internalNotes']) : '[]';
    $id = intval($input['id']);

    $stmt->bind_param('ssssssssssssssssssssssi',
        $company, $grade, $customerStatus,
        $contactName, $contactPosition, $deals,
        $lastWorkDate, $totalQuantity, $totalAmount,
        $managementCycle, $nextManagementDate,
        $reminderStatus, $accountManager,
        $phone, $email, $address,
        $fieldManager, $memo,
        $detailedQuantity, $workHistory,
        $emailHistory, $internalNotes,
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
    echo json_encode(array('success' => true));
    $conn->close();
    exit;
}

// ============================================================
// DELETE — 고객 삭제 (단건만, id 기준 LIMIT 1)
// ============================================================
if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        http_response_code(400);
        echo json_encode(array('error' => 'Missing id'));
        $conn->close();
        exit;
    }

    $sql = "DELETE FROM airtor_customers WHERE id = ? LIMIT 1";
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
