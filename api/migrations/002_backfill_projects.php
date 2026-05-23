<?php
/**
 * ⚠️ 카페24 PHP 5.2.x 호환 코드 — 모던 문법 금지
 *    상세: api/COMPATIBILITY.md
 *    - 클로저, 2-인자 json_encode, JSON_UNESCAPED_UNICODE, __DIR__, 단축 배열 금지
 *
 * 일회성 백필 스크립트 — Phase 1
 * 기존 success/confirmed 딜을 airtor_projects 테이블로 옮긴다.
 *
 * 실행 전 조건:
 *   - 001_create_projects_and_labor_rates.sql 이 카페24 MySQL에 적용된 상태여야 함
 *   - airtor_customers 가 이미 채워져 있어야 함 (회사명 매칭에 사용)
 *
 * 실행:
 *   - CLI:    php api/migrations/002_backfill_projects.php             (실제 실행)
 *   - CLI:    php api/migrations/002_backfill_projects.php --dry-run   (영향 건수만)
 *   - 브라우저: /api/migrations/002_backfill_projects.php?confirm_backfill=YES_RUN_NOW
 *   - 브라우저 dry-run: ...?confirm_backfill=YES_RUN_NOW&dry_run=1
 *
 * 실행 후:
 *   - 파일 자체를 삭제하거나 .htaccess로 접근 차단 권장
 *   - syncDealToProject (Phase 4) 가 새 success 딜은 자동 처리하므로 본 스크립트 재실행 불필요
 */
error_reporting(0);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// ============================================================
// 보호 가드 — CLI 또는 명시 확인 파라미터가 있을 때만 진행
// 스펙 원안의 boolean 표현은 연산자 우선순위 함정이 있어 명확한 변수 분리로 작성.
// ============================================================
$_argv = isset($argv) ? $argv : array();
$isCli = (php_sapi_name() === 'cli');
$webConfirmed = isset($_GET['confirm_backfill']) && $_GET['confirm_backfill'] === 'YES_RUN_NOW';
if (!$isCli && !$webConfirmed) {
    header('Content-Type: text/plain; charset=utf-8');
    die("이 스크립트는 백필 전용입니다. CLI에서 실행하거나 ?confirm_backfill=YES_RUN_NOW 파라미터를 붙이세요.\n");
}

$isDryRun = false;
if ($isCli) {
    $isDryRun = in_array('--dry-run', $_argv);
} else {
    $isDryRun = isset($_GET['dry_run']) && $_GET['dry_run'] === '1';
}

if (!$isCli) {
    header('Content-Type: text/plain; charset=utf-8');
}

// ============================================================
// deals_api.php와 동일한 헬퍼 — 회사명 정규화 / 견적금액 파싱
// 본 스크립트는 일회성이므로 인라인 복사 (라이브 API와의 의존 분리).
// 단, 규칙은 deals_api.php / health_check.php / src/lib/company.ts 와 동일해야 함.
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

// on_link2(확정작업일) 문자열을 DATE로 정규화 — 형식이 깨졌으면 NULL 반환
function normalizeWorkDate($v) {
    if (!$v) return null;
    if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $v, $m)) return $m[1];
    return null;
}

// ============================================================
// DB 연결 — customers_api.php와 동일한 폴백 패턴
// (마이그레이션 디렉토리는 api/migrations/ 이므로 db_config.php는 ../에 있음)
// ============================================================
$_dbConfigPath = dirname(__FILE__) . '/../db_config.php';
if (file_exists($_dbConfigPath)) {
    require_once $_dbConfigPath;
} else {
    $conn = new mysqli('localhost', 'airtor2014', 'aesd1122!', 'airtor2014');
    if ($conn->connect_error) {
        echo "DB connection failed: " . $conn->connect_error . "\n";
        exit(1);
    }
    $conn->set_charset('utf8');
}

// ============================================================
// 1) success/confirmed 딜 로드
// ============================================================
$deals = array();
$res = $conn->query(
    "SELECT on_num, on_subject, on_regist, on_option1, on_option2, " .
    "       on_link1, on_link2, on_visit_date " .
    "FROM Gn_Online " .
    "WHERE on_site='airtor2014' " .
    "  AND (on_option3='confirmed' OR on_option4='success')"
);
if (!$res) {
    echo "ERROR: success/confirmed 딜 조회 실패: " . $conn->error . "\n";
    $conn->close();
    exit(1);
}
while ($row = $res->fetch_assoc()) {
    $deals[] = $row;
}
$res->free();

// ============================================================
// 2) 고객 매핑 — 정규화된 회사명 → customer_id
// ============================================================
$cust_map = array();
$res = $conn->query("SELECT id, company FROM airtor_customers");
if (!$res) {
    echo "ERROR: airtor_customers 조회 실패: " . $conn->error . "\n";
    $conn->close();
    exit(1);
}
while ($row = $res->fetch_assoc()) {
    $norm = normalizeCompanyName($row['company']);
    if ($norm !== '') {
        // 동일 정규화 이름이 여러 customer에 있으면 가장 낮은 id를 채택 (먼저 등록된 쪽)
        if (!isset($cust_map[$norm]) || intval($row['id']) < $cust_map[$norm]) {
            $cust_map[$norm] = intval($row['id']);
        }
    }
}
$res->free();

// ============================================================
// 3) 이미 백필된 projects 매핑 — 중복 INSERT 방지
// ============================================================
$existing = array();
$res = $conn->query("SELECT deal_id FROM airtor_projects");
if (!$res) {
    echo "ERROR: airtor_projects 조회 실패 (테이블 미생성?): " . $conn->error . "\n";
    echo "→ 먼저 api/migrations/001_create_projects_and_labor_rates.sql 을 실행하세요.\n";
    $conn->close();
    exit(1);
}
while ($row = $res->fetch_assoc()) {
    $existing[intval($row['deal_id'])] = true;
}
$res->free();

// ============================================================
// 4) 각 딜을 순회하며 INSERT
// ============================================================
$totalDeals = count($deals);
$inserted = 0;
$skippedExisting = 0;
$skippedNoCustomer = 0;
$failedInsert = 0;
$missingSamples = array();

foreach ($deals as $d) {
    $dealId = intval($d['on_num']);
    $company = isset($d['on_subject']) ? $d['on_subject'] : '';
    $norm = normalizeCompanyName($company);

    // 고객 매칭 실패 → skip
    if ($norm === '' || !isset($cust_map[$norm])) {
        $skippedNoCustomer++;
        if (count($missingSamples) < 10) {
            $missingSamples[] = '#' . $dealId . ' "' . $company . '"';
        }
        continue;
    }

    // 이미 백필됨 → skip
    if (isset($existing[$dealId])) {
        $skippedExisting++;
        continue;
    }

    $customerId = $cust_map[$norm];
    $service = isset($d['on_option1']) && $d['on_option1'] !== '' ? $d['on_option1'] : '';
    $projectName = $service !== '' ? $service : ('프로젝트 #' . $dealId);

    // work_date — on_link2 (확정작업일) 우선, 형식 깨지면 NULL
    $workDate = normalizeWorkDate(isset($d['on_link2']) ? $d['on_link2'] : null);

    // 매출 계산 — 견적금액에서 부가세 역산
    $quotation = parseQuotationAmount(isset($d['on_link1']) ? $d['on_link1'] : '');
    $tax = (int)round($quotation * 10 / 110);
    $netRev = $quotation - $tax;

    if ($isDryRun) {
        $inserted++; // dry-run에서는 카운트만
        continue;
    }

    // 실제 INSERT — 인력/비용/파생지표는 모두 0 (사용자 입력 대기)
    $sql = "INSERT INTO airtor_projects " .
           "(deal_id, customer_id, work_history_dealid, project_name, service_type, work_date, " .
           " status, quotation_amount, tax_amount, net_revenue, " .
           " labor_cost, meal_cost, transport_cost, other_cost, " .
           " total_cost, labor_cost_ratio, net_profit, profit_ratio, ai_applied) " .
           "VALUES (?, ?, ?, ?, ?, ?, 'in-progress', ?, ?, ?, " .
           "        0, 0, 0, 0, 0, 0.00, 0, 0.00, 0)";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        error_log('[backfill] prepare failed (dealId=' . $dealId . '): ' . $conn->error);
        $failedInsert++;
        continue;
    }
    // mysqli는 PHP null을 SQL NULL로 정상 바인딩 — workDate가 NULL이어도 안전
    $stmt->bind_param(
        'iiisssiii',
        $dealId, $customerId, $dealId, $projectName, $service, $workDate,
        $quotation, $tax, $netRev
    );
    if (!$stmt->execute()) {
        error_log('[backfill] execute failed (dealId=' . $dealId . '): ' . $stmt->error);
        $stmt->close();
        $failedInsert++;
        continue;
    }
    $stmt->close();
    $inserted++;
}

// ============================================================
// 5) 통계 출력
// ============================================================
echo "================================================================\n";
echo ($isDryRun ? "[DRY-RUN] " : "") . "백필 결과 (" . date('Y-m-d H:i:s') . ")\n";
echo "================================================================\n";
echo "총 success/confirmed 딜:    " . $totalDeals . "\n";
echo "INSERT " . ($isDryRun ? '(예정)' : '완료') . ":              " . $inserted . "\n";
echo "skip (이미 projects 존재):  " . $skippedExisting . "\n";
echo "skip (고객 매칭 실패):      " . $skippedNoCustomer . "\n";
if (!$isDryRun) {
    echo "INSERT 실패 (error_log 참조): " . $failedInsert . "\n";
}

if ($skippedNoCustomer > 0) {
    echo "\n고객 매칭 실패 샘플 (최대 10건):\n";
    foreach ($missingSamples as $s) {
        echo "  - " . $s . "\n";
    }
    echo "→ 위 회사들은 airtor_customers에 해당 정규화 이름이 없습니다.\n";
    echo "   영업관리에서 해당 딜을 PUT 재트리거하면 syncDealToCustomer가 신규 등록합니다.\n";
}

if ($isDryRun) {
    echo "\n[DRY-RUN] 실제 변경 없음. --dry-run 빼고 다시 실행하세요.\n";
}

$conn->close();
