<?php
/**
 * ⚠️ 카페24 PHP 5.2.x 호환 코드 — 모던 문법 금지
 *    상세: api/COMPATIBILITY.md
 *
 * 역할별 월별 단가 API — airtoradmin 전용
 * 테이블: airtor_labor_rates
 *
 * [컬럼 매핑]
 * id          → id
 * year_month  → yearMonth (YYYY-MM)
 * role        → role ('lead'|'member'|'support')
 * daily_rate  → dailyRate (원, INT)
 * updated_by  → updatedBy
 * updated_at  → updatedAt
 *
 * [안전 규칙]
 * - SELECT: 변형 없이 읽기만
 * - INSERT: ON DUPLICATE KEY UPDATE로 멱등 (uk_month_role)
 * - UPDATE: id 또는 (yearMonth+role)로 행 식별 후 부분 업데이트
 * - DELETE: id 단건만 (LIMIT 1)
 * - role/yearMonth는 화이트리스트/regex로 sanitize
 * - 모든 쿼리는 prepared statement
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
// 직전 월 계산 — '2026-05' → '2026-04', '2026-01' → '2025-12'
// 형식 깨지면 빈 문자열 반환
// ============================================================
function prevYearMonth($yearMonth) {
    if (!preg_match('/^(\d{4})-(\d{2})$/', $yearMonth, $m)) return '';
    $y = intval($m[1]);
    $mo = intval($m[2]);
    $mo--;
    if ($mo < 1) {
        $mo = 12;
        $y--;
    }
    return sprintf('%04d-%02d', $y, $mo);
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
// GET — 단가 목록 조회 (필터: ?year_month= / ?role=)
// year_month 컬럼은 MySQL INTERVAL 키워드와 충돌 가능 → 백틱 사용
// ============================================================
if ($method === 'GET') {
    $where = array();
    if (isset($_GET['year_month'])) {
        $ym = $_GET['year_month'];
        if (preg_match('/^\d{4}-\d{2}$/', $ym)) {
            $where[] = "`year_month` = '" . $conn->real_escape_string($ym) . "'";
        }
    }
    if (isset($_GET['role'])) {
        $r = $_GET['role'];
        if ($r === 'lead' || $r === 'member' || $r === 'support') {
            $where[] = "role = '" . $conn->real_escape_string($r) . "'";
        }
    }
    $whereClause = empty($where) ? '1=1' : implode(' AND ', $where);

    $sql = "SELECT id, `year_month`, role, daily_rate, updated_by, updated_at
            FROM airtor_labor_rates
            WHERE " . $whereClause . "
            ORDER BY `year_month` DESC, role ASC";

    $result = $conn->query($sql);
    if (!$result) {
        http_response_code(500);
        echo json_encode(array('error' => 'Query failed: ' . $conn->error));
        $conn->close();
        exit;
    }

    $rates = array();
    while ($row = $result->fetch_assoc()) {
        $rates[] = array(
            'id'        => intval($row['id']),
            'yearMonth' => $row['year_month'],
            'role'      => $row['role'],
            'dailyRate' => intval($row['daily_rate']),
            'updatedBy' => $row['updated_by'] ? $row['updated_by'] : '',
            'updatedAt' => $row['updated_at'] ? $row['updated_at'] : '',
        );
    }

    echo json_encode(array('success' => true, 'data' => $rates));
    $conn->close();
    exit;
}

// ============================================================
// POST — 두 가지 모드
//   1) 일반 INSERT (?action 없음): {yearMonth, role, dailyRate, updatedBy}
//      ON DUPLICATE KEY UPDATE로 멱등 (uk_month_role)
//      응답에 mode: 'inserted'|'updated'|'unchanged'
//   2) 직전 월 복사 (?action=copy_prev): {yearMonth, updatedBy}
//      prevMonth의 3개 역할 단가를 INSERT IGNORE — 기존 (target, role)은 보존
// ============================================================
if ($method === 'POST') {
    $action = isset($_GET['action']) ? $_GET['action'] : '';

    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(array('error' => 'Invalid JSON'));
        $conn->close();
        exit;
    }

    // -------- 2) copy_prev 분기 --------
    if ($action === 'copy_prev') {
        if (!isset($input['yearMonth']) || !preg_match('/^\d{4}-\d{2}$/', $input['yearMonth'])) {
            http_response_code(400);
            echo json_encode(array('error' => 'Invalid or missing yearMonth (YYYY-MM)'));
            $conn->close();
            exit;
        }
        $targetMonth = $input['yearMonth'];
        $updatedBy = isset($input['updatedBy']) ? (string)$input['updatedBy'] : '';
        $prevMonth = prevYearMonth($targetMonth);
        if ($prevMonth === '') {
            http_response_code(400);
            echo json_encode(array('error' => 'Cannot derive previous month'));
            $conn->close();
            exit;
        }

        // 직전 월의 모든 역할 단가 조회
        $rowsToCopy = array();
        $sel = $conn->prepare("SELECT role, daily_rate FROM airtor_labor_rates WHERE `year_month` = ?");
        if (!$sel) {
            http_response_code(500);
            echo json_encode(array('error' => 'Prev select prepare failed: ' . $conn->error));
            $conn->close();
            exit;
        }
        $sel->bind_param('s', $prevMonth);
        if (!$sel->execute()) {
            http_response_code(500);
            echo json_encode(array('error' => 'Prev select execute failed: ' . $sel->error));
            $sel->close();
            $conn->close();
            exit;
        }
        $foundRole = '';
        $foundRate = 0;
        $sel->bind_result($foundRole, $foundRate);
        while ($sel->fetch()) {
            $rowsToCopy[] = array('role' => $foundRole, 'rate' => intval($foundRate));
        }
        $sel->close();

        if (empty($rowsToCopy)) {
            echo json_encode(array(
                'success' => true,
                'copied' => 0,
                'from' => $prevMonth,
                'to' => $targetMonth,
                'note' => 'No rates found in previous month',
            ));
            $conn->close();
            exit;
        }

        // INSERT IGNORE — 같은 (target, role) 행이 이미 있으면 건너뜀
        $ins = $conn->prepare("INSERT IGNORE INTO airtor_labor_rates (`year_month`, role, daily_rate, updated_by) VALUES (?, ?, ?, ?)");
        if (!$ins) {
            http_response_code(500);
            echo json_encode(array('error' => 'Insert prepare failed: ' . $conn->error));
            $conn->close();
            exit;
        }
        $copied = 0;
        foreach ($rowsToCopy as $rr) {
            $roleStr = $rr['role'];
            $rateInt = intval($rr['rate']);
            $ins->bind_param('ssis', $targetMonth, $roleStr, $rateInt, $updatedBy);
            if (!$ins->execute()) {
                error_log('[copy_prev] insert failed (yearMonth=' . $targetMonth . ', role=' . $roleStr . '): ' . $ins->error);
                continue;
            }
            // INSERT IGNORE: 신규 행만 affected_rows=1, 중복 무시는 0
            if ($ins->affected_rows > 0) {
                $copied++;
            }
        }
        $ins->close();

        echo json_encode(array(
            'success' => true,
            'copied' => $copied,
            'from' => $prevMonth,
            'to' => $targetMonth,
        ));
        $conn->close();
        exit;
    }

    // -------- 1) 일반 INSERT (멱등) --------
    if (!isset($input['yearMonth']) || !preg_match('/^\d{4}-\d{2}$/', $input['yearMonth'])) {
        http_response_code(400);
        echo json_encode(array('error' => 'Invalid or missing yearMonth (YYYY-MM)'));
        $conn->close();
        exit;
    }
    $role = isset($input['role']) ? $input['role'] : '';
    $validRoles = array('lead', 'member', 'support');
    if (!in_array($role, $validRoles)) {
        http_response_code(400);
        echo json_encode(array('error' => 'Invalid role'));
        $conn->close();
        exit;
    }

    $yearMonth = $input['yearMonth'];
    $dailyRate = isset($input['dailyRate']) ? intval($input['dailyRate']) : 0;
    $updatedBy = isset($input['updatedBy']) ? (string)$input['updatedBy'] : '';

    $sql = "INSERT INTO airtor_labor_rates (`year_month`, role, daily_rate, updated_by)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE daily_rate = VALUES(daily_rate), updated_by = VALUES(updated_by)";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(array('error' => 'Prepare failed: ' . $conn->error));
        $conn->close();
        exit;
    }
    $stmt->bind_param('ssis', $yearMonth, $role, $dailyRate, $updatedBy);
    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode(array('error' => 'Insert failed: ' . $stmt->error));
        $stmt->close();
        $conn->close();
        exit;
    }
    // ON DUPLICATE KEY UPDATE의 affected_rows 매핑:
    //   1 = 신규 INSERT, 2 = 기존 UPDATE (값 변경), 0 = no change (같은 값)
    $aff = $stmt->affected_rows;
    $newId = $conn->insert_id;
    $stmt->close();

    // ON DUPLICATE 경로에서는 insert_id가 0일 수 있어 (yearMonth, role)로 폴백 조회
    if ($newId === 0) {
        $sel = $conn->prepare("SELECT id FROM airtor_labor_rates WHERE `year_month` = ? AND role = ?");
        if ($sel) {
            $sel->bind_param('ss', $yearMonth, $role);
            if ($sel->execute()) {
                $foundId = 0;
                $sel->bind_result($foundId);
                if ($sel->fetch()) {
                    $newId = intval($foundId);
                }
            }
            $sel->close();
        }
    }

    $mode = 'unchanged';
    if ($aff === 1) {
        $mode = 'inserted';
    } else if ($aff === 2) {
        $mode = 'updated';
    }

    echo json_encode(array(
        'success' => true,
        'id' => $newId,
        'mode' => $mode,
    ));
    $conn->close();
    exit;
}

// ============================================================
// PUT — 부분 업데이트
// 행 식별: id 우선, 없으면 (yearMonth + role) 조합으로 SELECT 후 사용
// 매핑된 필드만 SET (customers_api.php 동적 빌더 패턴)
// ============================================================
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        http_response_code(400);
        echo json_encode(array('error' => 'Invalid JSON'));
        $conn->close();
        exit;
    }

    // 행 식별
    $rowId = 0;
    if (isset($input['id']) && intval($input['id']) > 0) {
        $rowId = intval($input['id']);
    } else if (isset($input['yearMonth']) && isset($input['role'])) {
        $ymLookup = $input['yearMonth'];
        $roleLookup = $input['role'];
        if (!preg_match('/^\d{4}-\d{2}$/', $ymLookup)) {
            http_response_code(400);
            echo json_encode(array('error' => 'Invalid yearMonth format'));
            $conn->close();
            exit;
        }
        if ($roleLookup !== 'lead' && $roleLookup !== 'member' && $roleLookup !== 'support') {
            http_response_code(400);
            echo json_encode(array('error' => 'Invalid role'));
            $conn->close();
            exit;
        }
        $sel = $conn->prepare("SELECT id FROM airtor_labor_rates WHERE `year_month` = ? AND role = ?");
        if (!$sel) {
            http_response_code(500);
            echo json_encode(array('error' => 'Lookup prepare failed: ' . $conn->error));
            $conn->close();
            exit;
        }
        $sel->bind_param('ss', $ymLookup, $roleLookup);
        if ($sel->execute()) {
            $foundId = 0;
            $sel->bind_result($foundId);
            if ($sel->fetch()) {
                $rowId = intval($foundId);
            }
        }
        $sel->close();
    }

    if ($rowId === 0) {
        http_response_code(404);
        echo json_encode(array('error' => 'Row not found by id or (yearMonth, role)'));
        $conn->close();
        exit;
    }

    // ENUM/format sanitize — 잘못된 값은 unset (omit과 동등)
    if (isset($input['role']) && $input['role'] !== 'lead' && $input['role'] !== 'member' && $input['role'] !== 'support') {
        unset($input['role']);
    }
    if (isset($input['yearMonth']) && !preg_match('/^\d{4}-\d{2}$/', $input['yearMonth'])) {
        unset($input['yearMonth']);
    }

    // 키 → (DB 컬럼, bind 타입, 변환종류 'str'|'int') 매핑
    // 클로저 금지 — 카페24 PHP 환경 호환을 위해 문자열 식별자 디스패치 (customers_api.php와 동일).
    $fields = array(
        'yearMonth' => array('`year_month`', 's', 'str'),
        'role'      => array('role',         's', 'str'),
        'dailyRate' => array('daily_rate',   'i', 'int'),
        'updatedBy' => array('updated_by',   's', 'str'),
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
        } else {
            $values[] = (string)$raw;
        }
    }

    if (empty($setClauses)) {
        echo json_encode(array('success' => true, 'id' => $rowId, 'note' => 'no fields to update'));
        $conn->close();
        exit;
    }

    $sql = "UPDATE airtor_labor_rates SET " . implode(', ', $setClauses) . " WHERE id = ?";
    $types .= 'i';
    $values[] = $rowId;

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(array('error' => 'Prepare failed: ' . $conn->error));
        $conn->close();
        exit;
    }
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

    echo json_encode(array(
        'success' => true,
        'id' => $rowId,
        'updated_fields' => array_keys(array_intersect_key($input, $fields)),
    ));
    $conn->close();
    exit;
}

// ============================================================
// DELETE — 단가 행 삭제 (단건만, LIMIT 1)
// ============================================================
if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['id'])) {
        http_response_code(400);
        echo json_encode(array('error' => 'Missing id'));
        $conn->close();
        exit;
    }

    $sql = "DELETE FROM airtor_labor_rates WHERE id = ? LIMIT 1";
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
