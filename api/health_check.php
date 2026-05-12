<?php
/**
 * ⚠️ 카페24 PHP 5.2.x 호환 코드 — 모던 문법 금지
 *    상세: api/COMPATIBILITY.md
 *
 * 데이터 정합성 헬스체크 — airtoradmin 전용
 *
 * GET /api/health_check.php
 *   → 200 + {"healthy":true, ...}  (모든 검사 통과)
 *   → 503 + {"healthy":false, "issues":[...]}  (부정합 발견)
 *
 * 검사 항목:
 *   1) success/confirmed 딜인데 정규화 매칭되는 customer가 없음 (자동등록 실패 시그니처)
 *   2) customer.deals >= 1 인데 workHistory가 빈 배열 (JSON 손실 시그니처)
 *   3) customer.customerStatus가 deals 카운트 규칙과 어긋남 (라벨 부정합)
 *
 * 의도된 사용:
 *   - 배포 직후 수동 호출로 빠르게 정합 확인
 *   - 외부 모니터링(cron, UptimeRobot 등)으로 주기적 호출, healthy=false 발견 시 알림
 *   - 별도 인증 없음 (읽기 전용 + 부정합 통계만 노출, 개별 행 내용은 최대 10개 샘플만)
 */
error_reporting(0);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ============================================================
// 회사명 정규화 — deals_api.php / src/lib/company.ts와 동일 규칙
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
        echo json_encode(array('healthy' => false, 'error' => 'DB connection failed'));
        exit;
    }
    $conn->set_charset('utf8');
}

$issues = array();

// ============================================================
// 검사 1: success/confirmed 딜인데 customer 매칭 없음
// ============================================================
$success_deals = array();
$res = $conn->query(
    "SELECT on_num, on_subject, on_regist, on_option3, on_option4 " .
    "FROM Gn_Online " .
    "WHERE on_site='airtor2014' " .
    "  AND (on_option3='confirmed' OR on_option4='success')"
);
if ($res) {
    while ($row = $res->fetch_assoc()) {
        $reg = '';
        if (is_numeric($row['on_regist'])) {
            $reg = date('Y-m-d', intval($row['on_regist']));
        }
        $success_deals[] = array(
            'id' => intval($row['on_num']),
            'company' => $row['on_subject'],
            'registrationDate' => $reg,
        );
    }
    $res->free();
}

$cust_norms = array();
$res = $conn->query("SELECT company FROM airtor_customers");
if ($res) {
    while ($row = $res->fetch_assoc()) {
        $norm = normalizeCompanyName($row['company']);
        if ($norm !== '') $cust_norms[$norm] = true;
    }
    $res->free();
}

$missing_customers = array();
foreach ($success_deals as $d) {
    $norm = normalizeCompanyName($d['company']);
    if ($norm === '') continue;
    if (!isset($cust_norms[$norm])) {
        $missing_customers[] = $d;
    }
}

if (count($missing_customers) > 0) {
    $issues[] = array(
        'type' => 'success_deal_no_customer',
        'severity' => 'high',
        'description' => '수주확정/성공 딜이지만 정규화 매칭되는 고객이 없음 (자동 등록 실패 시그니처)',
        'count' => count($missing_customers),
        'samples' => array_slice($missing_customers, 0, 10),
        'remediation' => '영업관리에서 해당 딜을 다시 PUT 트리거 (값 변경 없이도 됨) → syncDealToCustomer가 INSERT 재시도',
    );
}

// ============================================================
// 검사 2: customer.deals >= 1 인데 workHistory가 비어있음
// ============================================================
$empty_wh = array();
$res = $conn->query(
    "SELECT id, company, deals, total_amount, customer_status " .
    "FROM airtor_customers " .
    "WHERE deals >= 1 " .
    "  AND (work_history IS NULL OR work_history='' OR work_history='[]' OR work_history='null')"
);
if ($res) {
    while ($row = $res->fetch_assoc()) {
        $empty_wh[] = array(
            'id' => intval($row['id']),
            'company' => $row['company'],
            'deals' => intval($row['deals']),
            'totalAmount' => intval($row['total_amount']),
            'customerStatus' => $row['customer_status'],
        );
    }
    $res->free();
}

if (count($empty_wh) > 0) {
    $issues[] = array(
        'type' => 'customer_empty_workhistory',
        'severity' => 'high',
        'description' => 'customer.deals>=1 인데 workHistory가 빈 배열 (JSON 손실 시그니처)',
        'count' => count($empty_wh),
        'samples' => array_slice($empty_wh, 0, 10),
        'remediation' => '해당 회사의 success 딜을 PUT 재트리거 또는 수동 복구 PUT',
    );
}

// ============================================================
// 검사 3: customerStatus 규칙 부정합
//   deals >= 3 이어야 '충성고객'
//   deals == 2 이어야 '재구매'
//   (deals 0/1은 어떤 라벨이든 허용 — 사용자 수기 분류 보존)
// ============================================================
$status_violations = array();
$res = $conn->query("SELECT id, company, deals, customer_status FROM airtor_customers");
if ($res) {
    while ($row = $res->fetch_assoc()) {
        $d = intval($row['deals']);
        $cs = $row['customer_status'];
        $expected = null;
        if ($d >= 3 && $cs !== '충성고객') {
            $expected = '충성고객';
        } else if ($d === 2 && $cs !== '재구매') {
            $expected = '재구매';
        }
        if ($expected !== null) {
            $status_violations[] = array(
                'id' => intval($row['id']),
                'company' => $row['company'],
                'deals' => $d,
                'current' => $cs,
                'expected' => $expected,
            );
        }
    }
    $res->free();
}

if (count($status_violations) > 0) {
    $issues[] = array(
        'type' => 'customer_status_violation',
        'severity' => 'medium',
        'description' => 'customerStatus가 deals 카운트 규칙과 어긋남',
        'count' => count($status_violations),
        'samples' => array_slice($status_violations, 0, 10),
        'remediation' => 'PUT /api/customers_api.php with {id, customerStatus: expected} per violation',
    );
}

// ============================================================
// 결과 직렬화 및 응답
// ============================================================
$total = 0;
foreach ($issues as $i) {
    $total += intval($i['count']);
}
$healthy = ($total === 0);

http_response_code($healthy ? 200 : 503);
echo json_encode(array(
    'healthy' => $healthy,
    'timestamp' => date('Y-m-d H:i:s'),
    'total_issues' => $total,
    'checks_run' => 3,
    'issues' => $issues,
));

$conn->close();
