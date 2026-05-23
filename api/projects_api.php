<?php
/**
 * ⚠️ 카페24 PHP 5.2.x 호환 코드 — 모던 문법 금지
 *    상세: api/COMPATIBILITY.md
 *
 * 프로젝트 손익 데이터 API — airtoradmin 전용
 * 테이블: airtor_projects
 *
 * [컬럼 매핑]
 * id                  → id
 * deal_id             → dealId
 * customer_id         → customerId
 * work_history_dealid → workHistoryDealId
 * project_name        → projectName
 * service_type        → serviceType
 * work_date           → workDate
 * status              → status ('in-progress'|'completed')
 * completed_at        → completedAt
 * completed_reason    → completedReason
 * quotation_amount    → quotationAmount
 * tax_amount          → taxAmount
 * net_revenue         → netRevenue
 * worker_assignments  → workerAssignments (JSON TEXT)
 * labor_breakdown     → laborBreakdown (JSON TEXT)
 * labor_cost          → laborCost
 * meal_cost           → mealCost
 * transport_cost      → transportCost
 * other_cost          → otherCost
 * total_cost          → totalCost (파생)
 * labor_cost_ratio    → laborCostRatio (파생, 퍼센트)
 * net_profit          → netProfit (파생)
 * profit_ratio        → profitRatio (파생, 퍼센트)
 * ai_suggestion       → aiSuggestion (TEXT)
 * ai_applied          → aiApplied (BOOLEAN)
 * memo                → memo
 * created_at          → createdAt
 * updated_at          → updatedAt
 *
 * [안전 규칙]
 * - SELECT: 변형 없이 읽기만
 * - INSERT: 매핑된 필드만, 나머지는 DB 기본값
 * - UPDATE: 매핑된 필드만 (id WHERE)
 * - PUT/POST 후 recomputeProjectDerived() 호출하여 파생지표 자동 갱신
 * - DELETE: 단건만 (LIMIT 1)
 * - 모든 쿼리는 prepared statement
 * - status='completed' 전환 감지: 현재 status 조회 후 첫 전환에만 completed_at 스탬프
 */
error_reporting(0);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ============================================================
// 단가 캐스케이드 조회 — 당월 → 가장 가까운 직전 월 (1년 이내)
// 1년 초과 또는 미존재 시 0 + error_log
// ============================================================
function getLaborRateWithCascade($conn, $yearMonth, $role) {
    // 1) 정확히 해당 월
    $stmt = $conn->prepare("SELECT daily_rate FROM airtor_labor_rates WHERE `year_month` = ? AND role = ?");
    if (!$stmt) {
        error_log('[getLaborRateWithCascade] prepare1 failed (year_month=' . $yearMonth . ', role=' . $role . '): ' . $conn->error);
        return 0;
    }
    $stmt->bind_param('ss', $yearMonth, $role);
    if (!$stmt->execute()) {
        error_log('[getLaborRateWithCascade] execute1 failed: ' . $stmt->error);
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

    // 2) 가장 가까운 직전 월
    $stmt = $conn->prepare("SELECT `year_month`, daily_rate FROM airtor_labor_rates WHERE role = ? AND `year_month` < ? ORDER BY `year_month` DESC LIMIT 1");
    if (!$stmt) {
        error_log('[getLaborRateWithCascade] prepare2 failed: ' . $conn->error);
        return 0;
    }
    $stmt->bind_param('ss', $role, $yearMonth);
    if (!$stmt->execute()) {
        error_log('[getLaborRateWithCascade] execute2 failed: ' . $stmt->error);
        $stmt->close();
        return 0;
    }
    $foundMonth = '';
    $rate2 = 0;
    $stmt->bind_result($foundMonth, $rate2);
    if (!$stmt->fetch()) {
        $stmt->close();
        error_log('[getLaborRateWithCascade] no rate found (year_month=' . $yearMonth . ', role=' . $role . ')');
        return 0;
    }
    $stmt->close();

    // 3) 12개월 이내인지 검증
    if (!preg_match('/^(\d{4})-(\d{2})$/', $yearMonth, $mc) ||
        !preg_match('/^(\d{4})-(\d{2})$/', $foundMonth, $mf)) {
        // year_month 형식이 깨졌으면 안전하게 폴백 사용
        return intval($rate2);
    }
    $diff = (intval($mc[1]) - intval($mf[1])) * 12 + (intval($mc[2]) - intval($mf[2]));
    if ($diff > 12) {
        error_log('[getLaborRateWithCascade] cascade out of range (year_month=' . $yearMonth . ', role=' . $role . ', foundMonth=' . $foundMonth . ', diffMonths=' . $diff . ')');
        return 0;
    }
    return intval($rate2);
}

// ============================================================
// 파생지표 재계산
// workerAssignments + meal/transport/other + 단가표 → labor_breakdown, labor_cost,
// total_cost, labor_cost_ratio, net_profit, profit_ratio 6개 컬럼 UPDATE
// 반환값: true 성공 | false 실패 (error_log 후)
// ============================================================
function recomputeProjectDerived($conn, $projectId) {
    // 1) 현재 행 조회
    $stmt = $conn->prepare("SELECT worker_assignments, work_date, net_revenue, meal_cost, transport_cost, other_cost FROM airtor_projects WHERE id = ?");
    if (!$stmt) {
        error_log('[recomputeProjectDerived] SELECT prepare failed (id=' . $projectId . '): ' . $conn->error);
        return false;
    }
    $stmt->bind_param('i', $projectId);
    if (!$stmt->execute()) {
        error_log('[recomputeProjectDerived] SELECT execute failed (id=' . $projectId . '): ' . $stmt->error);
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
        // 행 없음 — 조용히 OK (다른 요청에서 삭제됐을 수 있음)
        $stmt->close();
        return true;
    }
    $stmt->close();

    // 2) workerAssignments 파싱
    $assignments = array('lead' => 0, 'member' => 0, 'support' => 0, 'days' => 0);
    if ($workerJson) {
        $parsed = json_decode($workerJson, true);
        if (is_array($parsed)) {
            if (isset($parsed['lead']))    $assignments['lead']    = intval($parsed['lead']);
            if (isset($parsed['member']))  $assignments['member']  = intval($parsed['member']);
            if (isset($parsed['support'])) $assignments['support'] = intval($parsed['support']);
            if (isset($parsed['days']))    $assignments['days']    = intval($parsed['days']);
        }
    }

    // 3) work_date의 YYYY-MM (없으면 현재 월 폴백)
    $yearMonth = '';
    if ($workDate && preg_match('/^(\d{4})-(\d{2})/', $workDate, $m)) {
        $yearMonth = $m[1] . '-' . $m[2];
    } else {
        $yearMonth = date('Y-m');
    }

    // 4) 각 role별 단가 캐스케이드 조회 + breakdown 구성
    $days = intval($assignments['days']);
    $roles = array('lead', 'member', 'support');
    $breakdown = array();
    $laborCost = 0;
    foreach ($roles as $role) {
        $count = intval($assignments[$role]);
        $rate = getLaborRateWithCascade($conn, $yearMonth, $role);
        $subtotal = $rate * $count * $days;
        $breakdown[$role] = array(
            'rate' => $rate,
            'count' => $count,
            'days' => $days,
            'subtotal' => $subtotal,
        );
        $laborCost += $subtotal;
    }

    // 5) 파생지표 계산 — ratio는 fraction (0~1 범위, 소수점 4자리)
    //    AI staffing 응답(StaffingSuggestion.estimatedProfitRatio)·프론트 UI와 단위 일관성 유지.
    //    UI 측에서 (ratio * 100).toFixed(N) 로 퍼센트 표시.
    $netRev = intval($netRev);
    $totalCost = $laborCost + intval($meal) + intval($transport) + intval($other);
    $laborCostRatio = ($netRev > 0) ? round($laborCost / $netRev, 4) : 0.0000;
    $netProfit = $netRev - $totalCost;
    $profitRatio = ($netRev > 0) ? round($netProfit / $netRev, 4) : 0.0000;
    $breakdownJson = json_encode($breakdown); // 카페24 PHP는 flag 인자 불가

    // 6) UPDATE
    $sql = "UPDATE airtor_projects SET
                labor_breakdown = ?, labor_cost = ?, total_cost = ?,
                labor_cost_ratio = ?, net_profit = ?, profit_ratio = ?
            WHERE id = ?";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        error_log('[recomputeProjectDerived] UPDATE prepare failed (id=' . $projectId . '): ' . $conn->error);
        return false;
    }
    // type: s(breakdown), i(labor), i(total), d(laborRatio), i(profit), d(profitRatio), i(id) = 'siididi'
    $stmt->bind_param('siididi',
        $breakdownJson, $laborCost, $totalCost, $laborCostRatio, $netProfit, $profitRatio, $projectId
    );
    if (!$stmt->execute()) {
        error_log('[recomputeProjectDerived] UPDATE execute failed (id=' . $projectId . '): ' . $stmt->error);
        $stmt->close();
        return false;
    }
    $stmt->close();
    return true;
}

// ============================================================
// DB 연결 — customers_api.php와 동일한 폴백 패턴
// ============================================================
$_dbConfigPath = dirname(__FILE__) . '/db_config.php';
if (file_exists($_dbConfigPath)) {
    require_once $_dbConfigPath;
} else {
    $conn = new mysqli('localhost', 'airtor2014', 'aesd1122!', 'airtor2014');
    if ($conn->connect_error) {
        http_response_code(500);
        echo json_encode(array('error' => 'DB connection failed'));
        exit;
    }
    $conn->set_charset('utf8');
}

$method = $_SERVER['REQUEST_METHOD'];

// ============================================================
// GET — 프로젝트 목록 조회 (필터: ?status= / ?customer_id=)
// 필터 값은 intval / 화이트리스트 비교 + real_escape_string으로 sanitize
// ============================================================
if ($method === 'GET') {
    $where = array();
    if (isset($_GET['status'])) {
        $st = $_GET['status'];
        if ($st === 'in-progress' || $st === 'completed') {
            $where[] = "status = '" . $conn->real_escape_string($st) . "'";
        }
    }
    if (isset($_GET['customer_id'])) {
        $cid = intval($_GET['customer_id']);
        if ($cid > 0) {
            $where[] = "customer_id = " . $cid;
        }
    }
    $whereClause = empty($where) ? '1=1' : implode(' AND ', $where);

    $sql = "SELECT id, deal_id, customer_id, work_history_dealid, project_name, service_type,
                   work_date, status, completed_at, completed_reason,
                   quotation_amount, tax_amount, net_revenue,
                   worker_assignments, labor_breakdown, labor_cost,
                   meal_cost, transport_cost, other_cost,
                   total_cost, labor_cost_ratio, net_profit, profit_ratio,
                   ai_suggestion, ai_applied, memo, created_at, updated_at
            FROM airtor_projects
            WHERE " . $whereClause . "
            ORDER BY work_date DESC, id DESC";

    $result = $conn->query($sql);
    if (!$result) {
        http_response_code(500);
        echo json_encode(array('error' => 'Query failed: ' . $conn->error));
        $conn->close();
        exit;
    }

    $projects = array();
    while ($row = $result->fetch_assoc()) {
        $aiAppliedRaw = $row['ai_applied'];
        $projects[] = array(
            'id'                => intval($row['id']),
            'dealId'            => intval($row['deal_id']),
            'customerId'        => $row['customer_id'] !== null ? intval($row['customer_id']) : null,
            'workHistoryDealId' => $row['work_history_dealid'] !== null ? intval($row['work_history_dealid']) : null,
            'projectName'       => $row['project_name'] ? $row['project_name'] : '',
            'serviceType'       => $row['service_type'] ? $row['service_type'] : '',
            'workDate'          => $row['work_date'] ? $row['work_date'] : '',
            'status'            => $row['status'] ? $row['status'] : 'in-progress',
            'completedAt'       => $row['completed_at'] ? $row['completed_at'] : '',
            'completedReason'   => $row['completed_reason'] ? $row['completed_reason'] : '',
            'quotationAmount'   => intval($row['quotation_amount']),
            'taxAmount'         => intval($row['tax_amount']),
            'netRevenue'        => intval($row['net_revenue']),
            'workerAssignments' => $row['worker_assignments'] ? json_decode($row['worker_assignments'], true) : null,
            'laborBreakdown'    => $row['labor_breakdown'] ? json_decode($row['labor_breakdown'], true) : null,
            'laborCost'         => intval($row['labor_cost']),
            'mealCost'          => intval($row['meal_cost']),
            'transportCost'     => intval($row['transport_cost']),
            'otherCost'         => intval($row['other_cost']),
            'totalCost'         => intval($row['total_cost']),
            'laborCostRatio'    => floatval($row['labor_cost_ratio']),
            'netProfit'         => intval($row['net_profit']),
            'profitRatio'       => floatval($row['profit_ratio']),
            'aiSuggestion'      => $row['ai_suggestion'] ? $row['ai_suggestion'] : '',
            'aiApplied'         => ($aiAppliedRaw === '1' || $aiAppliedRaw === 1) ? true : false,
            'memo'              => $row['memo'] ? $row['memo'] : '',
            'createdAt'         => $row['created_at'] ? $row['created_at'] : '',
            'updatedAt'         => $row['updated_at'] ? $row['updated_at'] : '',
        );
    }

    echo json_encode(array('success' => true, 'data' => $projects));
    $conn->close();
    exit;
}

// ============================================================
// POST — 프로젝트 추가 (수동 추가용; syncDealToProject는 Phase 4 deals_api에 별도 구현)
// 필수: dealId / customerId / projectName 중 최소 1개
// status='completed'면 INSERT 후 별도 UPDATE로 completed_at/reason 스탬프
// ============================================================
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(array('error' => 'Invalid JSON'));
        $conn->close();
        exit;
    }

    $hasDealId = isset($input['dealId']) && intval($input['dealId']) > 0;
    $hasCustomerId = isset($input['customerId']) && intval($input['customerId']) > 0;
    $hasProjectName = isset($input['projectName']) && trim($input['projectName']) !== '';
    if (!$hasDealId && !$hasCustomerId && !$hasProjectName) {
        http_response_code(400);
        echo json_encode(array('error' => 'At least one of dealId, customerId, projectName is required'));
        $conn->close();
        exit;
    }

    // 필드 추출 + sanitize (ENUM 검증)
    $dealId            = isset($input['dealId'])            ? intval($input['dealId'])            : 0;
    $customerId        = isset($input['customerId'])        ? intval($input['customerId'])        : 0;
    $workHistoryDealId = isset($input['workHistoryDealId']) ? intval($input['workHistoryDealId']) : $dealId;
    $projectName       = isset($input['projectName'])       ? (string)$input['projectName']       : '';
    $serviceType       = isset($input['serviceType'])       ? (string)$input['serviceType']       : '';
    $workDate          = isset($input['workDate']) && $input['workDate'] !== '' ? $input['workDate'] : null;

    $status = isset($input['status']) ? $input['status'] : 'in-progress';
    if ($status !== 'in-progress' && $status !== 'completed') $status = 'in-progress';

    $quotationAmount = isset($input['quotationAmount']) ? intval($input['quotationAmount']) : 0;
    $taxAmount       = isset($input['taxAmount'])       ? intval($input['taxAmount'])       : 0;
    $netRevenue      = isset($input['netRevenue'])      ? intval($input['netRevenue'])      : 0;
    $workerAssignments = isset($input['workerAssignments']) ? json_encode($input['workerAssignments']) : null;
    $mealCost      = isset($input['mealCost'])      ? intval($input['mealCost'])      : 0;
    $transportCost = isset($input['transportCost']) ? intval($input['transportCost']) : 0;
    $otherCost     = isset($input['otherCost'])     ? intval($input['otherCost'])     : 0;
    $aiSuggestion  = isset($input['aiSuggestion'])  ? (string)$input['aiSuggestion']  : '';
    $aiApplied     = !empty($input['aiApplied']) ? 1 : 0;
    $memo          = isset($input['memo'])          ? (string)$input['memo']          : '';

    $sql = "INSERT INTO airtor_projects
        (deal_id, customer_id, work_history_dealid, project_name, service_type, work_date,
         status, quotation_amount, tax_amount, net_revenue,
         worker_assignments, meal_cost, transport_cost, other_cost,
         ai_suggestion, ai_applied, memo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(array('error' => 'Prepare failed: ' . $conn->error));
        $conn->close();
        exit;
    }
    // 17 vars: i,i,i,s,s,s,s,i,i,i,s,i,i,i,s,i,s = 'iiissssiiisiiisis'
    $stmt->bind_param('iiissssiiisiiisis',
        $dealId, $customerId, $workHistoryDealId, $projectName, $serviceType, $workDate,
        $status, $quotationAmount, $taxAmount, $netRevenue,
        $workerAssignments, $mealCost, $transportCost, $otherCost,
        $aiSuggestion, $aiApplied, $memo
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

    // status='completed'로 생성된 경우 — 별도 UPDATE로 completed_at/reason 스탬프
    if ($status === 'completed') {
        $reasonInput = isset($input['completedReason']) ? $input['completedReason'] : '';
        $validReasons = array('manual', 'report_sent');
        if (!in_array($reasonInput, $validReasons)) {
            $reasonInput = 'manual';
        }
        $stmt2 = $conn->prepare("UPDATE airtor_projects SET completed_at = NOW(), completed_reason = ? WHERE id = ?");
        if (!$stmt2) {
            error_log('[POST] completion stamp prepare failed (id=' . $newId . '): ' . $conn->error);
        } else {
            $stmt2->bind_param('si', $reasonInput, $newId);
            if (!$stmt2->execute()) {
                error_log('[POST] completion stamp execute failed (id=' . $newId . '): ' . $stmt2->error);
            }
            $stmt2->close();
        }
    }

    // 파생지표 재계산
    $recomputeOk = recomputeProjectDerived($conn, $newId);
    if (!$recomputeOk) {
        http_response_code(500);
        echo json_encode(array(
            'success' => false,
            'id' => $newId,
            'error' => 'Project created but derived metrics recompute failed. Check PHP error log.',
            'project_persisted' => true
        ));
        $conn->close();
        exit;
    }

    echo json_encode(array('success' => true, 'id' => $newId));
    $conn->close();
    exit;
}

// ============================================================
// PUT — 프로젝트 수정 (부분 업데이트, customers_api.php의 동적 빌더 패턴)
// 핵심:
//   - 매핑된 필드만 SET (omit된 필드는 DB 값 보존)
//   - status='completed'로의 첫 전환에만 completed_at = NOW() 스탬프
//     (이미 completed였으면 보존; 명시적 completedReason은 fields가 처리)
//   - 마지막에 recomputeProjectDerived 호출하여 파생지표 갱신
//   - 파생지표 6개 컬럼(labor_breakdown, labor_cost, total_cost, labor_cost_ratio,
//     net_profit, profit_ratio)은 클라이언트 PUT에서 제외 — 서버가 단독 계산
// ============================================================
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        http_response_code(400);
        echo json_encode(array('error' => 'Invalid JSON or missing id'));
        $conn->close();
        exit;
    }
    $projectId = intval($input['id']);

    // ENUM sanitize — 잘못된 값은 입력에서 제거 (omit과 동등 효과)
    if (isset($input['status'])) {
        if ($input['status'] !== 'in-progress' && $input['status'] !== 'completed') {
            unset($input['status']);
        }
    }
    if (isset($input['completedReason']) && $input['completedReason'] !== '') {
        if ($input['completedReason'] !== 'manual' && $input['completedReason'] !== 'report_sent') {
            unset($input['completedReason']);
        }
    }

    // 키 → (DB 컬럼, bind 타입, 변환종류 'str'|'int'|'json')
    // 클로저 금지 — 카페24 PHP 환경 호환을 위해 문자열 식별자 디스패치 (customers_api.php와 동일).
    $fields = array(
        'dealId'            => array('deal_id',              'i', 'int'),
        'customerId'        => array('customer_id',          'i', 'int'),
        'workHistoryDealId' => array('work_history_dealid',  'i', 'int'),
        'projectName'       => array('project_name',         's', 'str'),
        'serviceType'       => array('service_type',         's', 'str'),
        'workDate'          => array('work_date',            's', 'str'),
        'status'            => array('status',               's', 'str'),
        'completedReason'   => array('completed_reason',     's', 'str'),
        'quotationAmount'   => array('quotation_amount',     'i', 'int'),
        'taxAmount'         => array('tax_amount',           'i', 'int'),
        'netRevenue'        => array('net_revenue',          'i', 'int'),
        'workerAssignments' => array('worker_assignments',   's', 'json'),
        'mealCost'          => array('meal_cost',            'i', 'int'),
        'transportCost'     => array('transport_cost',       'i', 'int'),
        'otherCost'         => array('other_cost',           'i', 'int'),
        'aiSuggestion'      => array('ai_suggestion',        's', 'str'),
        'aiApplied'         => array('ai_applied',           'i', 'int'),
        'memo'              => array('memo',                 's', 'str'),
    );

    $setClauses = array();
    $types = '';
    $values = array();
    foreach ($fields as $inKey => $meta) {
        if (!array_key_exists($inKey, $input)) continue;
        list($col, $type, $conv) = $meta;
        $setClauses[] = "$col = ?";
        $types .= $type;
        $raw = $input[$inKey];
        if ($conv === 'int') {
            $values[] = intval($raw);
        } elseif ($conv === 'json') {
            $values[] = json_encode($raw);
        } else {
            $values[] = (string)$raw;
        }
    }

    // status='completed' 첫 전환 감지 + completed_at 스탬프
    if (isset($input['status']) && $input['status'] === 'completed') {
        $stCheck = $conn->prepare("SELECT status FROM airtor_projects WHERE id = ?");
        $curStatus = '';
        if ($stCheck) {
            $stCheck->bind_param('i', $projectId);
            if ($stCheck->execute()) {
                $stCheck->bind_result($curStatus);
                $stCheck->fetch();
            }
            $stCheck->close();
        }
        if ($curStatus !== 'completed') {
            $setClauses[] = "completed_at = NOW()";
            // completedReason이 입력에 없으면 'manual' 자동 추가
            if (!isset($input['completedReason']) || $input['completedReason'] === '') {
                $setClauses[] = "completed_reason = ?";
                $types .= 's';
                $values[] = 'manual';
            }
        }
    }

    if (empty($setClauses)) {
        echo json_encode(array('success' => true, 'note' => 'no fields to update'));
        $conn->close();
        exit;
    }

    $sql = "UPDATE airtor_projects SET " . implode(', ', $setClauses) . " WHERE id = ?";
    $types .= 'i';
    $values[] = $projectId;

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(array('error' => 'Prepare failed: ' . $conn->error));
        $conn->close();
        exit;
    }
    // mysqli bind_param은 reference 배열 요구
    $bindRefs = array($types);
    foreach ($values as $i => $_) {
        $bindRefs[] = &$values[$i];
    }
    call_user_func_array(array($stmt, 'bind_param'), $bindRefs);

    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode(array('error' => 'Update failed: ' . $stmt->error));
        $stmt->close();
        $conn->close();
        exit;
    }
    $stmt->close();

    // 파생지표 재계산
    $recomputeOk = recomputeProjectDerived($conn, $projectId);
    if (!$recomputeOk) {
        http_response_code(500);
        echo json_encode(array(
            'success' => false,
            'error' => 'Project updated but derived metrics recompute failed. Check PHP error log.',
            'project_persisted' => true
        ));
        $conn->close();
        exit;
    }

    echo json_encode(array(
        'success' => true,
        'updated_fields' => array_keys(array_intersect_key($input, $fields))
    ));
    $conn->close();
    exit;
}

// ============================================================
// DELETE — 프로젝트 삭제 (단건만, LIMIT 1)
// ============================================================
if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        http_response_code(400);
        echo json_encode(array('error' => 'Missing id'));
        $conn->close();
        exit;
    }

    $sql = "DELETE FROM airtor_projects WHERE id = ? LIMIT 1";
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
