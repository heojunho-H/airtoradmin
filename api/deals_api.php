<?php
/**
 * 영업(딜) 데이터 API — airtoradmin 전용
 *
 * [안전 규칙]
 * - SELECT: 기존 데이터 변형 없이 읽기만 수행
 * - INSERT: 매핑된 필드만 설정, 나머지는 DB 기본값 유지
 * - UPDATE: 매핑된 필드만 수정, b_no 기준으로만 WHERE 조건
 * - DELETE: b_no 단건 삭제만 허용
 * - 모든 쿼리에 prepared statement 사용 (SQL Injection 방지)
 * - dbname='bbs61' 조건으로 이 게시판 데이터만 조회
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// OPTIONS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// DB 연결
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
    $sql = "SELECT b_no, b_regist, b_category, b_subject, b_writer,
                   b_ex1, b_ex2, b_email, b_ex3, b_ex4, b_ex5,
                   b_ex6, b_ex7, b_ex8, b_ex9, b_content, b_ex10,
                   b_link1, b_link2
            FROM Gn_Board_Item_bbs61
            WHERE dbname = 'bbs61'
            ORDER BY b_no DESC";

    $result = $conn->query($sql);
    if (!$result) {
        http_response_code(500);
        echo json_encode(array('error' => 'Query failed'));
        $conn->close();
        exit;
    }

    $deals = array();
    while ($row = $result->fetch_assoc()) {
        $deals[] = array(
            'id' => intval($row['b_no']),
            'registrationDate' => substr($row['b_regist'], 0, 10),
            'status' => $row['b_category'] !== '' ? $row['b_category'] : 'new',
            'company' => $row['b_subject'],
            'contactName' => $row['b_writer'],
            'contactPosition' => $row['b_ex1'],
            'phone' => $row['b_ex2'],
            'email' => $row['b_email'],
            'desiredService' => $row['b_ex3'],
            'totalQuantity' => intval($row['b_ex4']),
            'quotationAmount' => $row['b_ex5'],
            'salesManager' => $row['b_ex6'],
            'successStatus' => $row['b_ex7'] !== '' ? $row['b_ex7'] : 'in-progress',
            'isChecked' => $row['b_ex8'] === '1' ? true : false,
            'address' => $row['b_ex9'],
            'requirements' => $row['b_content'],
            'detailedQuantity' => $row['b_ex10'],
            'confirmedWorkDate' => $row['b_link1'],
            'managementMemo' => $row['b_link2']
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

    $now = date('Y-m-d H:i:s');

    // 매핑 필드만 INSERT, 그 외 컬럼은 DB 기본값 그대로
    $sql = "INSERT INTO Gn_Board_Item_bbs61
            (b_regist, b_modify, b_category, b_subject, b_writer,
             b_ex1, b_ex2, b_email, b_ex3, b_ex4, b_ex5,
             b_ex6, b_ex7, b_ex8, b_ex9, b_content, b_ex10,
             b_link1, b_link2, dbname)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bbs61')";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(array('error' => 'Prepare failed'));
        $conn->close();
        exit;
    }

    $regDate = isset($input['registrationDate']) ? $input['registrationDate'] . ' 00:00:00' : $now;
    $status = isset($input['status']) ? $input['status'] : 'new';
    $company = isset($input['company']) ? $input['company'] : '';
    $contactName = isset($input['contactName']) ? $input['contactName'] : '';
    $contactPosition = isset($input['contactPosition']) ? $input['contactPosition'] : '';
    $phone = isset($input['phone']) ? $input['phone'] : '';
    $email = isset($input['email']) ? $input['email'] : '';
    $desiredService = isset($input['desiredService']) ? $input['desiredService'] : '';
    $totalQuantity = isset($input['totalQuantity']) ? strval($input['totalQuantity']) : '0';
    $quotationAmount = isset($input['quotationAmount']) ? $input['quotationAmount'] : '';
    $salesManager = isset($input['salesManager']) ? $input['salesManager'] : '';
    $successStatus = isset($input['successStatus']) ? $input['successStatus'] : 'in-progress';
    $isChecked = (!empty($input['isChecked']) && $input['isChecked']) ? '1' : '0';
    $address = isset($input['address']) ? $input['address'] : '';
    $requirements = isset($input['requirements']) ? $input['requirements'] : '';
    $detailedQuantity = isset($input['detailedQuantity']) ? $input['detailedQuantity'] : '';
    $confirmedWorkDate = isset($input['confirmedWorkDate']) ? $input['confirmedWorkDate'] : '';
    $managementMemo = isset($input['managementMemo']) ? $input['managementMemo'] : '';

    $stmt->bind_param('sssssssssssssssssss',
        $regDate, $now, $status, $company, $contactName,
        $contactPosition, $phone, $email, $desiredService, $totalQuantity, $quotationAmount,
        $salesManager, $successStatus, $isChecked, $address, $requirements, $detailedQuantity,
        $confirmedWorkDate, $managementMemo
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
// PUT — 딜 수정 (매핑 필드만 UPDATE, WHERE b_no = ? AND dbname = 'bbs61')
// ============================================================
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        http_response_code(400);
        echo json_encode(array('error' => 'Invalid JSON or missing id'));
        $conn->close();
        exit;
    }

    $now = date('Y-m-d H:i:s');

    // 매핑 필드만 수정, dbname 조건으로 이 게시판 데이터만 대상
    $sql = "UPDATE Gn_Board_Item_bbs61 SET
                b_modify = ?,
                b_category = ?, b_subject = ?, b_writer = ?,
                b_ex1 = ?, b_ex2 = ?, b_email = ?, b_ex3 = ?,
                b_ex4 = ?, b_ex5 = ?, b_ex6 = ?, b_ex7 = ?,
                b_ex8 = ?, b_ex9 = ?, b_content = ?, b_ex10 = ?,
                b_link1 = ?, b_link2 = ?
            WHERE b_no = ? AND dbname = 'bbs61'";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(array('error' => 'Prepare failed'));
        $conn->close();
        exit;
    }

    $status = isset($input['status']) ? $input['status'] : 'new';
    $company = isset($input['company']) ? $input['company'] : '';
    $contactName = isset($input['contactName']) ? $input['contactName'] : '';
    $contactPosition = isset($input['contactPosition']) ? $input['contactPosition'] : '';
    $phone = isset($input['phone']) ? $input['phone'] : '';
    $email = isset($input['email']) ? $input['email'] : '';
    $desiredService = isset($input['desiredService']) ? $input['desiredService'] : '';
    $totalQuantity = isset($input['totalQuantity']) ? strval($input['totalQuantity']) : '0';
    $quotationAmount = isset($input['quotationAmount']) ? $input['quotationAmount'] : '';
    $salesManager = isset($input['salesManager']) ? $input['salesManager'] : '';
    $successStatus = isset($input['successStatus']) ? $input['successStatus'] : 'in-progress';
    $isChecked = (!empty($input['isChecked']) && $input['isChecked']) ? '1' : '0';
    $address = isset($input['address']) ? $input['address'] : '';
    $requirements = isset($input['requirements']) ? $input['requirements'] : '';
    $detailedQuantity = isset($input['detailedQuantity']) ? $input['detailedQuantity'] : '';
    $confirmedWorkDate = isset($input['confirmedWorkDate']) ? $input['confirmedWorkDate'] : '';
    $managementMemo = isset($input['managementMemo']) ? $input['managementMemo'] : '';
    $id = intval($input['id']);

    $stmt->bind_param('ssssssssssssssssssi',
        $now,
        $status, $company, $contactName,
        $contactPosition, $phone, $email, $desiredService,
        $totalQuantity, $quotationAmount, $salesManager, $successStatus,
        $isChecked, $address, $requirements, $detailedQuantity,
        $confirmedWorkDate, $managementMemo,
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
// DELETE — 딜 삭제 (단건만, dbname 조건으로 안전하게)
// ============================================================
if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        http_response_code(400);
        echo json_encode(array('error' => 'Missing id'));
        $conn->close();
        exit;
    }

    $sql = "DELETE FROM Gn_Board_Item_bbs61 WHERE b_no = ? AND dbname = 'bbs61' LIMIT 1";
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
