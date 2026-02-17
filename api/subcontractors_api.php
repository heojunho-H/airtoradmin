<?php
/**
 * 협력업체(하도급) 데이터 API — airtoradmin 전용
 * 테이블: airtor_subcontractors
 *
 * [컬럼 매핑]
 * id                    → id (PK, AUTO_INCREMENT)
 * name                  → name (이름)
 * company               → company (업체명)
 * phone                 → phone (전화번호)
 * email                 → email (이메일)
 * address               → address (주소)
 * assigned_area         → assignedArea (담당지역)
 * registration_date     → registrationDate (등록일)
 * specialization        → specialization (전문분야)
 * team_size             → teamSize (팀원수, INT)
 * grade                 → grade (등급 S/A/B/C)
 * age                   → age (연령, INT)
 * ongoing_projects      → ongoingProjects (진행중 프로젝트, INT)
 * completed_projects    → completedProjects (완료 프로젝트, INT)
 * total_contract_amount → totalContractAmount (총계약금액, BIGINT)
 * performance_rating    → performanceRating (실적평가, FLOAT)
 * cooperation_score     → cooperationScore (협력점수, FLOAT)
 * status                → status (상태: available/busy/unavailable)
 * memo                  → memo (메모, TEXT)
 * repurchase_count      → repurchaseCount (재계약횟수, INT)
 * base_score            → baseScore (기본점수, FLOAT)
 * certifications        → certifications (자격증, JSON array as TEXT)
 * evaluation_history    → evaluationHistory (평가이력, JSON array as TEXT)
 * recent_projects       → recentProjects (최근프로젝트, JSON array as TEXT)
 * recent_activities     → recentActivities (최근활동, JSON array as TEXT)
 * created_at            → createdAt (자동 설정)
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

require_once __DIR__ . '/db_config.php';

$method = $_SERVER['REQUEST_METHOD'];

// ============================================================
// GET — 협력업체 목록 조회 (읽기 전용, 기존 데이터 변형 없음)
// ============================================================
if ($method === 'GET') {
    $sql = "SELECT id, name, company, phone, email, address,
                   assigned_area, registration_date, specialization,
                   team_size, grade, age,
                   ongoing_projects, completed_projects,
                   total_contract_amount, performance_rating,
                   cooperation_score, status, memo,
                   repurchase_count, base_score,
                   certifications, evaluation_history,
                   recent_projects, recent_activities,
                   created_at
            FROM airtor_subcontractors
            ORDER BY id DESC";

    $result = $conn->query($sql);
    if (!$result) {
        http_response_code(500);
        echo json_encode(array('error' => 'Query failed'));
        $conn->close();
        exit;
    }

    $items = array();
    while ($row = $result->fetch_assoc()) {
        $items[] = array(
            'id' => intval($row['id']),
            'name' => $row['name'] ? $row['name'] : '',
            'company' => $row['company'] ? $row['company'] : '',
            'phone' => $row['phone'] ? $row['phone'] : '',
            'email' => $row['email'] ? $row['email'] : '',
            'address' => $row['address'] ? $row['address'] : '',
            'assignedArea' => $row['assigned_area'] ? $row['assigned_area'] : '',
            'registrationDate' => $row['registration_date'] ? $row['registration_date'] : '',
            'specialization' => $row['specialization'] ? $row['specialization'] : '',
            'teamSize' => intval($row['team_size']),
            'grade' => $row['grade'] ? $row['grade'] : '',
            'age' => intval($row['age']),
            'ongoingProjects' => intval($row['ongoing_projects']),
            'completedProjects' => intval($row['completed_projects']),
            'totalContractAmount' => intval($row['total_contract_amount']),
            'performanceRating' => floatval($row['performance_rating']),
            'cooperationScore' => floatval($row['cooperation_score']),
            'status' => $row['status'] ? $row['status'] : 'available',
            'memo' => $row['memo'] ? $row['memo'] : '',
            'repurchaseCount' => intval($row['repurchase_count']),
            'baseScore' => floatval($row['base_score']),
            'certifications' => $row['certifications'] ? json_decode($row['certifications'], true) : array(),
            'evaluationHistory' => $row['evaluation_history'] ? json_decode($row['evaluation_history'], true) : array(),
            'recentProjects' => $row['recent_projects'] ? json_decode($row['recent_projects'], true) : array(),
            'recentActivities' => $row['recent_activities'] ? json_decode($row['recent_activities'], true) : array(),
            'createdAt' => $row['created_at'] ? $row['created_at'] : ''
        );
    }

    echo json_encode(array('success' => true, 'data' => $items));
    $conn->close();
    exit;
}

// ============================================================
// POST — 협력업체 추가 (매핑 필드만 설정, 나머지 DB 기본값 유지)
// ============================================================
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(array('error' => 'Invalid JSON'));
        $conn->close();
        exit;
    }

    $sql = "INSERT INTO airtor_subcontractors
            (name, company, phone, email, address,
             assigned_area, registration_date, specialization,
             team_size, grade, age,
             ongoing_projects, completed_projects,
             total_contract_amount, performance_rating,
             cooperation_score, status, memo,
             repurchase_count, base_score,
             certifications, evaluation_history,
             recent_projects, recent_activities,
             created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(array('error' => 'Prepare failed'));
        $conn->close();
        exit;
    }

    $name = isset($input['name']) ? $input['name'] : '';
    $company = isset($input['company']) ? $input['company'] : '';
    $phone = isset($input['phone']) ? $input['phone'] : '';
    $email = isset($input['email']) ? $input['email'] : '';
    $address = isset($input['address']) ? $input['address'] : '';
    $assignedArea = isset($input['assignedArea']) ? $input['assignedArea'] : '';
    $registrationDate = isset($input['registrationDate']) ? $input['registrationDate'] : date('Y-m-d');
    $specialization = isset($input['specialization']) ? $input['specialization'] : '';
    $teamSize = isset($input['teamSize']) ? intval($input['teamSize']) : 0;
    $grade = isset($input['grade']) ? $input['grade'] : '';
    $age = isset($input['age']) ? intval($input['age']) : 0;
    $ongoingProjects = isset($input['ongoingProjects']) ? intval($input['ongoingProjects']) : 0;
    $completedProjects = isset($input['completedProjects']) ? intval($input['completedProjects']) : 0;
    $totalContractAmount = isset($input['totalContractAmount']) ? intval($input['totalContractAmount']) : 0;
    $performanceRating = isset($input['performanceRating']) ? floatval($input['performanceRating']) : 0.0;
    $cooperationScore = isset($input['cooperationScore']) ? floatval($input['cooperationScore']) : 0.0;
    $status = isset($input['status']) ? $input['status'] : 'available';
    $memo = isset($input['memo']) ? $input['memo'] : '';
    $repurchaseCount = isset($input['repurchaseCount']) ? intval($input['repurchaseCount']) : 0;
    $baseScore = isset($input['baseScore']) ? floatval($input['baseScore']) : 0.0;
    $certifications = isset($input['certifications']) ? json_encode($input['certifications']) : '[]';
    $evaluationHistory = isset($input['evaluationHistory']) ? json_encode($input['evaluationHistory']) : '[]';
    $recentProjects = isset($input['recentProjects']) ? json_encode($input['recentProjects']) : '[]';
    $recentActivities = isset($input['recentActivities']) ? json_encode($input['recentActivities']) : '[]';

    $stmt->bind_param('ssssssssssssssssssssssss',
        $name, $company, $phone, $email, $address,
        $assignedArea, $registrationDate, $specialization,
        $teamSize, $grade, $age,
        $ongoingProjects, $completedProjects,
        $totalContractAmount, $performanceRating,
        $cooperationScore, $status, $memo,
        $repurchaseCount, $baseScore,
        $certifications, $evaluationHistory,
        $recentProjects, $recentActivities
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
// PUT — 협력업체 수정 (매핑 필드만 UPDATE, id 기준)
// ============================================================
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        http_response_code(400);
        echo json_encode(array('error' => 'Invalid JSON or missing id'));
        $conn->close();
        exit;
    }

    $sql = "UPDATE airtor_subcontractors SET
                name = ?, company = ?, phone = ?, email = ?, address = ?,
                assigned_area = ?, registration_date = ?, specialization = ?,
                team_size = ?, grade = ?, age = ?,
                ongoing_projects = ?, completed_projects = ?,
                total_contract_amount = ?, performance_rating = ?,
                cooperation_score = ?, status = ?, memo = ?,
                repurchase_count = ?, base_score = ?,
                certifications = ?, evaluation_history = ?,
                recent_projects = ?, recent_activities = ?
            WHERE id = ?";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(array('error' => 'Prepare failed'));
        $conn->close();
        exit;
    }

    $name = isset($input['name']) ? $input['name'] : '';
    $company = isset($input['company']) ? $input['company'] : '';
    $phone = isset($input['phone']) ? $input['phone'] : '';
    $email = isset($input['email']) ? $input['email'] : '';
    $address = isset($input['address']) ? $input['address'] : '';
    $assignedArea = isset($input['assignedArea']) ? $input['assignedArea'] : '';
    $registrationDate = isset($input['registrationDate']) ? $input['registrationDate'] : '';
    $specialization = isset($input['specialization']) ? $input['specialization'] : '';
    $teamSize = isset($input['teamSize']) ? intval($input['teamSize']) : 0;
    $grade = isset($input['grade']) ? $input['grade'] : '';
    $age = isset($input['age']) ? intval($input['age']) : 0;
    $ongoingProjects = isset($input['ongoingProjects']) ? intval($input['ongoingProjects']) : 0;
    $completedProjects = isset($input['completedProjects']) ? intval($input['completedProjects']) : 0;
    $totalContractAmount = isset($input['totalContractAmount']) ? intval($input['totalContractAmount']) : 0;
    $performanceRating = isset($input['performanceRating']) ? floatval($input['performanceRating']) : 0.0;
    $cooperationScore = isset($input['cooperationScore']) ? floatval($input['cooperationScore']) : 0.0;
    $status = isset($input['status']) ? $input['status'] : 'available';
    $memo = isset($input['memo']) ? $input['memo'] : '';
    $repurchaseCount = isset($input['repurchaseCount']) ? intval($input['repurchaseCount']) : 0;
    $baseScore = isset($input['baseScore']) ? floatval($input['baseScore']) : 0.0;
    $certifications = isset($input['certifications']) ? json_encode($input['certifications']) : '[]';
    $evaluationHistory = isset($input['evaluationHistory']) ? json_encode($input['evaluationHistory']) : '[]';
    $recentProjects = isset($input['recentProjects']) ? json_encode($input['recentProjects']) : '[]';
    $recentActivities = isset($input['recentActivities']) ? json_encode($input['recentActivities']) : '[]';
    $id = intval($input['id']);

    $stmt->bind_param('ssssssssssssssssssssssssi',
        $name, $company, $phone, $email, $address,
        $assignedArea, $registrationDate, $specialization,
        $teamSize, $grade, $age,
        $ongoingProjects, $completedProjects,
        $totalContractAmount, $performanceRating,
        $cooperationScore, $status, $memo,
        $repurchaseCount, $baseScore,
        $certifications, $evaluationHistory,
        $recentProjects, $recentActivities,
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
// DELETE — 협력업체 삭제 (단건만, id 기준)
// ============================================================
if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        http_response_code(400);
        echo json_encode(array('error' => 'Missing id'));
        $conn->close();
        exit;
    }

    $sql = "DELETE FROM airtor_subcontractors WHERE id = ? LIMIT 1";
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
