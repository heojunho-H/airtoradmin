<?php
/**
 * ⚠️ 카페24 PHP 5.2.x 호환 코드 — 모던 문법 금지
 *    상세: api/COMPATIBILITY.md
 *
 * 프로젝트 손익 데이터 API v2 — airtoradmin 전용
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
 * labor_cost_ratio    → laborCostRatio (파생, 비율 0~1)
 * net_profit          → netProfit (파생)
 * profit_ratio        → profitRatio (파생, 비율 0~1)
 * ai_suggestion       → aiSuggestion (TEXT)
 * ai_applied          → aiApplied (BOOLEAN)
 * ai_status           → aiStatus (ENUM: pending|generating|success|failed|manual)
 * ai_attempted_at     → aiAttemptedAt (DATETIME)
 * ai_error            → aiError (TEXT)
 * ai_influence        → aiInfluence (ENUM: high|medium|low|none)
 * memo                → memo
 * created_at          → createdAt
 * updated_at          → updatedAt
 *
 * v1(projects_api.php)과 다른 점 — docs/data-sync.md
 *  - 딜·고객과 겹치는 항목(이름·서비스·작업일·금액·연결 ID)은 딜과 고객 작업이력이 정하고 여기서는 복사만 한다.
 *    PUT 으로 보내면 무시하고 ignored_fields 로 알려 준다. (프로젝트 화면에서도 원래 수정할 수 없는 항목)
 *  - 쓰기는 sync_lib 잠금으로 딜·고객 동기화와 순서를 맞춘다. 손익 재계산은 sync_lib.php sl_recompute_project.
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

// ============================================================
// GET — 프로젝트 목록 (필터: ?status= / ?customer_id=)
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
        if ($cid > 0) $where[] = 'customer_id = ' . $cid;
    }
    $whereClause = (count($where) === 0) ? '1=1' : implode(' AND ', $where);

    $rows = sl_rows($conn, "SELECT id, deal_id, customer_id, work_history_dealid, project_name, service_type,
                   work_date, status, completed_at, completed_reason,
                   quotation_amount, tax_amount, net_revenue,
                   worker_assignments, labor_breakdown, labor_cost,
                   meal_cost, transport_cost, other_cost,
                   total_cost, labor_cost_ratio, net_profit, profit_ratio,
                   ai_suggestion, ai_applied,
                   ai_status, ai_attempted_at, ai_error, ai_influence,
                   memo, created_at, updated_at
            FROM airtor_projects
            WHERE " . $whereClause . "
            ORDER BY work_date DESC, id DESC");
    if ($rows === false) sl_out($conn, 500, array('error' => 'Query failed'));

    $projects = array();
    foreach ($rows as $row) {
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
            'aiStatus'          => $row['ai_status'] ? $row['ai_status'] : 'pending',
            'aiAttemptedAt'     => $row['ai_attempted_at'] ? $row['ai_attempted_at'] : '',
            'aiError'           => $row['ai_error'] ? $row['ai_error'] : '',
            'aiInfluence'       => $row['ai_influence'] ? $row['ai_influence'] : '',
            'memo'              => $row['memo'] ? $row['memo'] : '',
            'createdAt'         => $row['created_at'] ? $row['created_at'] : '',
            'updatedAt'         => $row['updated_at'] ? $row['updated_at'] : '',
        );
    }
    sl_out($conn, 200, array('success' => true, 'data' => $projects));
}

// ============================================================
// POST — 프로젝트 수동 추가 (화면은 지원하지 않음 — 수주 딜이 sync_lib 로 만든다). v1 과 같다.
// ============================================================
if ($method === 'POST') {
    $input = sl_input();
    if (!$input) sl_out($conn, 400, array('error' => 'Invalid JSON'));

    $hasDealId = isset($input['dealId']) && intval($input['dealId']) > 0;
    $hasCustomerId = isset($input['customerId']) && intval($input['customerId']) > 0;
    $hasProjectName = isset($input['projectName']) && trim(sl_str($input['projectName'])) !== '';
    if (!$hasDealId && !$hasCustomerId && !$hasProjectName) {
        sl_out($conn, 400, array('error' => 'At least one of dealId, customerId, projectName is required'));
    }

    $dealId            = isset($input['dealId'])            ? intval($input['dealId'])            : 0;
    $customerId        = isset($input['customerId'])        ? intval($input['customerId'])        : 0;
    $workHistoryDealId = isset($input['workHistoryDealId']) ? intval($input['workHistoryDealId']) : $dealId;
    $workDate = (isset($input['workDate']) && sl_is_ymd(sl_str($input['workDate']))) ? sl_str($input['workDate']) : null;
    $status = isset($input['status']) ? $input['status'] : 'in-progress';
    if ($status !== 'in-progress' && $status !== 'completed') $status = 'in-progress';

    $vals = array(
        $dealId, $customerId, $workHistoryDealId,
        isset($input['projectName']) ? sl_str($input['projectName']) : '',
        isset($input['serviceType']) ? sl_str($input['serviceType']) : '',
        $workDate, $status,
        isset($input['quotationAmount']) ? intval($input['quotationAmount']) : 0,
        isset($input['taxAmount']) ? intval($input['taxAmount']) : 0,
        isset($input['netRevenue']) ? intval($input['netRevenue']) : 0,
        isset($input['workerAssignments']) ? json_encode($input['workerAssignments']) : null,
        isset($input['mealCost']) ? intval($input['mealCost']) : 0,
        isset($input['transportCost']) ? intval($input['transportCost']) : 0,
        isset($input['otherCost']) ? intval($input['otherCost']) : 0,
        isset($input['aiSuggestion']) ? sl_str($input['aiSuggestion']) : '',
        !empty($input['aiApplied']) ? 1 : 0,
        isset($input['memo']) ? sl_str($input['memo']) : '',
    );
    $sql = "INSERT INTO airtor_projects
        (deal_id, customer_id, work_history_dealid, project_name, service_type, work_date,
         status, quotation_amount, tax_amount, net_revenue,
         worker_assignments, meal_cost, transport_cost, other_cost,
         ai_suggestion, ai_applied, memo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    sl_lock($conn);
    if (!sl_exec($conn, $sql, 'iiissssiiisiiisis', $vals, 'projects_post')) sl_out($conn, 500, array('error' => 'Insert failed'));
    $newId = intval($conn->insert_id);

    if ($status === 'completed') {
        $reason = isset($input['completedReason']) ? $input['completedReason'] : '';
        if ($reason !== 'manual' && $reason !== 'report_sent') $reason = 'manual';
        sl_exec($conn, 'UPDATE airtor_projects SET completed_at = NOW(), completed_reason = ? WHERE id = ?', 'si', array($reason, $newId), 'projects_post_complete');
    }
    if (!sl_recompute_project($conn, $newId)) {
        sl_out($conn, 500, array('success' => false, 'id' => $newId, 'error' => 'Project created but derived metrics recompute failed.', 'project_persisted' => true, 'persisted' => true));
    }
    sl_out($conn, 200, array('success' => true, 'id' => $newId));
}

// ============================================================
// PUT — 프로젝트 부분 수정 (인력·비용·메모·상태·AI 항목). 공유 항목은 무시.
// ============================================================
if ($method === 'PUT') {
    $input = sl_input();
    if (!$input || !isset($input['id'])) sl_out($conn, 400, array('error' => 'Invalid JSON or missing id'));
    $projectId = intval($input['id']);

    // 딜·고객 작업이력이 정하는 항목 — 여기서 바꾸면 세 곳이 어긋난다
    $shared = array('dealId', 'customerId', 'workHistoryDealId', 'projectName', 'serviceType', 'workDate', 'quotationAmount', 'taxAmount', 'netRevenue');
    $ignored = array();
    foreach ($shared as $k) {
        if (array_key_exists($k, $input)) {
            $ignored[] = $k;
            unset($input[$k]);
        }
    }

    // ENUM 검증 — 잘못된 값은 입력에서 제거 (v1 과 같다)
    if (isset($input['status']) && $input['status'] !== 'in-progress' && $input['status'] !== 'completed') unset($input['status']);
    if (isset($input['completedReason']) && $input['completedReason'] !== '' && $input['completedReason'] !== 'manual' && $input['completedReason'] !== 'report_sent') unset($input['completedReason']);
    if (isset($input['aiStatus']) && !in_array($input['aiStatus'], array('pending', 'generating', 'success', 'failed', 'manual'), true)) unset($input['aiStatus']);
    if (isset($input['aiInfluence']) && $input['aiInfluence'] !== '' && !in_array($input['aiInfluence'], array('high', 'medium', 'low', 'none'), true)) unset($input['aiInfluence']);

    $fields = array(
        'status'            => array('status',               's', 'str'),
        'completedReason'   => array('completed_reason',     's', 'str'),
        'workerAssignments' => array('worker_assignments',   's', 'json'),
        'mealCost'          => array('meal_cost',            'i', 'int'),
        'transportCost'     => array('transport_cost',       'i', 'int'),
        'otherCost'         => array('other_cost',           'i', 'int'),
        'aiSuggestion'      => array('ai_suggestion',        's', 'str'),
        'aiApplied'         => array('ai_applied',           'i', 'int'),
        'aiStatus'          => array('ai_status',            's', 'str'),
        'aiAttemptedAt'     => array('ai_attempted_at',      's', 'str'),
        'aiError'           => array('ai_error',             's', 'str'),
        'aiInfluence'       => array('ai_influence',         's', 'str'),
        'memo'              => array('memo',                 's', 'str'),
    );
    $set = array();
    $updated = array();
    foreach ($fields as $inKey => $meta) {
        if (!array_key_exists($inKey, $input)) continue;
        $raw = $input[$inKey];
        $updated[] = $inKey;
        if ($meta[2] === 'int') {
            $set[$meta[0]] = array('i', intval($raw));
        } elseif ($meta[2] === 'json') {
            $set[$meta[0]] = array('s', json_encode($raw));
        } elseif (($inKey === 'aiAttemptedAt' || $inKey === 'completedReason' || $inKey === 'aiInfluence') && sl_str($raw) === '') {
            $set[$meta[0]] = array('s', null); // DATETIME·ENUM 에 빈 문자열 대신 NULL
        } else {
            $set[$meta[0]] = array('s', sl_str($raw));
        }
    }

    sl_lock($conn);
    // 'completed' 첫 전환이면 completed_at 스탬프, 사유가 없으면 manual
    if (isset($input['status']) && $input['status'] === 'completed') {
        $cur = sl_rows($conn, 'SELECT status FROM airtor_projects WHERE id = ' . $projectId);
        $curStatus = ($cur && count($cur) > 0) ? $cur[0]['status'] : '';
        if ($curStatus !== 'completed' && !isset($set['completed_reason'])) $set['completed_reason'] = array('s', 'manual');
        if ($curStatus !== 'completed') $stampCompleted = true;
    }
    if (count($set) === 0) {
        sl_out($conn, 200, array('success' => true, 'note' => 'no fields to update', 'updated_fields' => array(), 'ignored_fields' => $ignored));
    }
    if (!sl_update($conn, 'airtor_projects', 'id', $projectId, $set, 'projects_put', '')) sl_out($conn, 500, array('error' => 'Update failed'));
    if (!empty($stampCompleted)) {
        sl_exec($conn, 'UPDATE airtor_projects SET completed_at = NOW() WHERE id = ?', 'i', array($projectId), 'projects_put_complete');
    }
    if (!sl_recompute_project($conn, $projectId)) {
        sl_out($conn, 500, array('success' => false, 'error' => 'Project updated but derived metrics recompute failed.', 'project_persisted' => true, 'persisted' => true));
    }
    sl_out($conn, 200, array('success' => true, 'updated_fields' => $updated, 'ignored_fields' => $ignored));
}

// ============================================================
// DELETE — 프로젝트 삭제 (단건). 딜이 다시 수주로 바뀔 때만 새로 만들어진다.
// ============================================================
if ($method === 'DELETE') {
    $input = sl_input();
    if (!$input || !isset($input['id'])) sl_out($conn, 400, array('error' => 'Missing id'));
    sl_lock($conn);
    if (!sl_exec($conn, 'DELETE FROM airtor_projects WHERE id = ? LIMIT 1', 'i', array(intval($input['id'])), 'projects_delete')) {
        sl_out($conn, 500, array('error' => 'Delete failed'));
    }
    sl_out($conn, 200, array('success' => true));
}

sl_out($conn, 405, array('error' => 'Method not allowed'));
