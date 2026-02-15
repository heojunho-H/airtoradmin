<?php
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

$conn = new mysqli('localhost', 'airtor2014', 'aesd1122!', 'airtor2014');
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(array('error' => 'DB connection failed'));
    exit;
}
$conn->set_charset('utf8mb4');

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
            'status' => ($row['on_option3'] !== '' && $row['on_option3'] !== null) ? $row['on_option3'] : 'new',
            'successStatus' => ($row['on_option4'] !== '' && $row['on_option4'] !== null) ? $row['on_option4'] : 'in-progress',
            'salesManager' => $row['on_option5'] ? $row['on_option5'] : '',
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