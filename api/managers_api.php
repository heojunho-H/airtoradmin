<?php
/**
 * 고객 담당자 관리 API — airtoradmin 전용
 * 테이블: airtor_customer_managers
 *
 * [컬럼 매핑]
 * id                  → id (PK, AUTO_INCREMENT)
 * name                → name (담당자명)
 * position            → position (직책)
 * phone               → phone (전화번호)
 * email               → email (이메일)
 * address             → address (주소)
 * assigned_area       → assignedArea (담당 지역)
 * join_date           → joinDate (입사일)
 * assigned_customers  → assignedCustomers (담당 고객 수)
 * active_projects     → activeProjects (진행 중 프로젝트)
 * completed_projects  → completedProjects (완료 프로젝트)
 * total_sales_amount  → totalSalesAmount (총 매출액)
 * performance_rating  → performanceRating (성과 평점)
 * status              → status (상태: active/vacation/leave)
 * repurchase_rate     → repurchaseRate (재구매율)
 * new_customers       → newCustomers (신규 고객 수)
 * repurchase_customers→ repurchaseCustomers (재구매 고객 수)
 * specialties         → specialties (전문 분야, JSON array TEXT)
 * recent_activities   → recentActivities (최근 활동, JSON array TEXT)
 * created_at          → 자동 설정 (POST 시)
 *
 * [안전 규칙]
 * - SELECT: 기존 데이터 변형 없이 읽기만 수행
 * - INSERT: 매핑된 필드만 설정, 나머지는 DB 기본값 유지
 * - UPDATE: 매핑된 필드만 수정, id 기준 WHERE 조건
 * - DELETE: id 단건 삭제만 허용
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
// GET — 담당자 목록 조회 (읽기 전용, 기존 데이터 변형 없음)
// ============================================================
if ($method === 'GET') {
    $sql = "SELECT id, name, position, phone, email, address,
                   assigned_area, join_date, assigned_customers,
                   active_projects, completed_projects, total_sales_amount,
                   performance_rating, status, repurchase_rate,
                   new_customers, repurchase_customers,
                   specialties, recent_activities, created_at
            FROM airtor_customer_managers
            ORDER BY id DESC";

    $result = $conn->query($sql);
    if (!$result) {
        http_response_code(500);
        echo json_encode(array('error' => 'Query failed'));
        $conn->close();
        exit;
    }

    $managers = array();
    while ($row = $result->fetch_assoc()) {
        $specialties = array();
        if ($row['specialties'] !== null && $row['specialties'] !== '') {
            $decoded = json_decode($row['specialties'], true);
            if (is_array($decoded)) {
                $specialties = $decoded;
            }
        }

        $recentActivities = array();
        if ($row['recent_activities'] !== null && $row['recent_activities'] !== '') {
            $decoded = json_decode($row['recent_activities'], true);
            if (is_array($decoded)) {
                $recentActivities = $decoded;
            }
        }

        $managers[] = array(
            'id' => intval($row['id']),
            'name' => $row['name'] ? $row['name'] : '',
            'position' => $row['position'] ? $row['position'] : '',
            'phone' => $row['phone'] ? $row['phone'] : '',
            'email' => $row['email'] ? $row['email'] : '',
            'address' => $row['address'] ? $row['address'] : '',
            'assignedArea' => $row['assigned_area'] ? $row['assigned_area'] : '',
            'joinDate' => $row['join_date'] ? $row['join_date'] : '',
            'assignedCustomers' => intval($row['assigned_customers']),
            'activeProjects' => intval($row['active_projects']),
            'completedProjects' => intval($row['completed_projects']),
            'totalSalesAmount' => intval($row['total_sales_amount']),
            'performanceRating' => floatval($row['performance_rating']),
            'status' => ($row['status'] !== '' && $row['status'] !== null) ? $row['status'] : 'active',
            'repurchaseRate' => floatval($row['repurchase_rate']),
            'newCustomers' => intval($row['new_customers']),
            'repurchaseCustomers' => intval($row['repurchase_customers']),
            'specialties' => $specialties,
            'recentActivities' => $recentActivities,
            'createdAt' => $row['created_at'] ? $row['created_at'] : ''
        );
    }

    echo json_encode(array('success' => true, 'data' => $managers));
    $conn->close();
    exit;
}

// ============================================================
// POST — 담당자 추가 (매핑 필드만 설정, 나머지 DB 기본값 유지)
// ============================================================
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(array('error' => 'Invalid JSON'));
        $conn->close();
        exit;
    }

    $sql = "INSERT INTO airtor_customer_managers
            (name, position, phone, email, address,
             assigned_area, join_date, assigned_customers,
             active_projects, completed_projects, total_sales_amount,
             performance_rating, status, repurchase_rate,
             new_customers, repurchase_customers,
             specialties, recent_activities, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(array('error' => 'Prepare failed'));
        $conn->close();
        exit;
    }

    $name = isset($input['name']) ? $input['name'] : '';
    $position = isset($input['position']) ? $input['position'] : '';
    $phone = isset($input['phone']) ? $input['phone'] : '';
    $email = isset($input['email']) ? $input['email'] : '';
    $address = isset($input['address']) ? $input['address'] : '';
    $assignedArea = isset($input['assignedArea']) ? $input['assignedArea'] : '';
    $joinDate = isset($input['joinDate']) ? $input['joinDate'] : '';
    $assignedCustomers = isset($input['assignedCustomers']) ? intval($input['assignedCustomers']) : 0;
    $activeProjects = isset($input['activeProjects']) ? intval($input['activeProjects']) : 0;
    $completedProjects = isset($input['completedProjects']) ? intval($input['completedProjects']) : 0;
    $totalSalesAmount = isset($input['totalSalesAmount']) ? intval($input['totalSalesAmount']) : 0;
    $performanceRating = isset($input['performanceRating']) ? floatval($input['performanceRating']) : 0.0;
    $status = isset($input['status']) ? $input['status'] : 'active';
    $repurchaseRate = isset($input['repurchaseRate']) ? floatval($input['repurchaseRate']) : 0.0;
    $newCustomers = isset($input['newCustomers']) ? intval($input['newCustomers']) : 0;
    $repurchaseCustomers = isset($input['repurchaseCustomers']) ? intval($input['repurchaseCustomers']) : 0;

    $specialties = '[]';
    if (isset($input['specialties']) && is_array($input['specialties'])) {
        $specialties = json_encode($input['specialties']);
    }

    $recentActivities = '[]';
    if (isset($input['recentActivities']) && is_array($input['recentActivities'])) {
        $recentActivities = json_encode($input['recentActivities']);
    }

    $stmt->bind_param('ssssssssssssssssss',
        $name, $position, $phone, $email, $address,
        $assignedArea, $joinDate, $assignedCustomers,
        $activeProjects, $completedProjects, $totalSalesAmount,
        $performanceRating, $status, $repurchaseRate,
        $newCustomers, $repurchaseCustomers,
        $specialties, $recentActivities
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
// PUT — 담당자 수정 (매핑 필드만 UPDATE, id 기준)
// ============================================================
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        http_response_code(400);
        echo json_encode(array('error' => 'Invalid JSON or missing id'));
        $conn->close();
        exit;
    }

    $sql = "UPDATE airtor_customer_managers SET
                name = ?, position = ?, phone = ?, email = ?, address = ?,
                assigned_area = ?, join_date = ?, assigned_customers = ?,
                active_projects = ?, completed_projects = ?, total_sales_amount = ?,
                performance_rating = ?, status = ?, repurchase_rate = ?,
                new_customers = ?, repurchase_customers = ?,
                specialties = ?, recent_activities = ?
            WHERE id = ?";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(array('error' => 'Prepare failed'));
        $conn->close();
        exit;
    }

    $name = isset($input['name']) ? $input['name'] : '';
    $position = isset($input['position']) ? $input['position'] : '';
    $phone = isset($input['phone']) ? $input['phone'] : '';
    $email = isset($input['email']) ? $input['email'] : '';
    $address = isset($input['address']) ? $input['address'] : '';
    $assignedArea = isset($input['assignedArea']) ? $input['assignedArea'] : '';
    $joinDate = isset($input['joinDate']) ? $input['joinDate'] : '';
    $assignedCustomers = isset($input['assignedCustomers']) ? intval($input['assignedCustomers']) : 0;
    $activeProjects = isset($input['activeProjects']) ? intval($input['activeProjects']) : 0;
    $completedProjects = isset($input['completedProjects']) ? intval($input['completedProjects']) : 0;
    $totalSalesAmount = isset($input['totalSalesAmount']) ? intval($input['totalSalesAmount']) : 0;
    $performanceRating = isset($input['performanceRating']) ? floatval($input['performanceRating']) : 0.0;
    $status = isset($input['status']) ? $input['status'] : 'active';
    $repurchaseRate = isset($input['repurchaseRate']) ? floatval($input['repurchaseRate']) : 0.0;
    $newCustomers = isset($input['newCustomers']) ? intval($input['newCustomers']) : 0;
    $repurchaseCustomers = isset($input['repurchaseCustomers']) ? intval($input['repurchaseCustomers']) : 0;
    $id = intval($input['id']);

    $specialties = '[]';
    if (isset($input['specialties']) && is_array($input['specialties'])) {
        $specialties = json_encode($input['specialties']);
    }

    $recentActivities = '[]';
    if (isset($input['recentActivities']) && is_array($input['recentActivities'])) {
        $recentActivities = json_encode($input['recentActivities']);
    }

    $stmt->bind_param('ssssssssssssssssssi',
        $name, $position, $phone, $email, $address,
        $assignedArea, $joinDate, $assignedCustomers,
        $activeProjects, $completedProjects, $totalSalesAmount,
        $performanceRating, $status, $repurchaseRate,
        $newCustomers, $repurchaseCustomers,
        $specialties, $recentActivities,
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
// DELETE — 담당자 삭제 (단건만, id 기준)
// ============================================================
if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        http_response_code(400);
        echo json_encode(array('error' => 'Missing id'));
        $conn->close();
        exit;
    }

    $sql = "DELETE FROM airtor_customer_managers WHERE id = ? LIMIT 1";
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
