<?php
/**
 * ⚠️ 카페24 PHP 5.2.x 호환 코드 — 모던 문법 금지
 *    상세: api/COMPATIBILITY.md
 *    - 클로저, 2-인자 json_encode, JSON_UNESCAPED_UNICODE, __DIR__, 단축 배열 금지
 *
 * 006 마이그레이션 웹 러너 — 스티비 뉴스레터 연동 컬럼 추가
 * (카페24가 MySQL 웹어드민(phpMyAdmin)을 종료해 SQL 파일을 직접 실행할 수 없어
 *  002_backfill_projects.php와 같은 방식의 일회성 PHP 러너로 적용한다.)
 *
 * 수행 내용 (006_add_newsletter_fields.sql과 동일):
 *   1) 백업 테이블 airtor_customers_backup_pre_newsletter 생성 (이미 있으면 skip)
 *   2) ALTER TABLE airtor_customers — newsletter_status / stibee_synced_at / contacts 추가 (이미 있으면 skip)
 *   3) 기존 행 contacts 백필 — 단일 담당자 필드 → JSON 배열 1건 (json_encode 사용, 이스케이프 안전)
 *   4) 검증 출력
 *
 * 멱등성: 각 단계가 현재 상태를 확인하고 이미 적용된 경우 건너뛴다. 재실행해도 안전.
 *
 * 실행:
 *   - 브라우저 dry-run: /api/migrations/006_run_newsletter_fields.php?confirm_migrate=YES_RUN_NOW&dry_run=1
 *   - 브라우저 실행:    /api/migrations/006_run_newsletter_fields.php?confirm_migrate=YES_RUN_NOW
 *   - CLI:             php api/migrations/006_run_newsletter_fields.php [--dry-run]
 *
 * 실행 후: 이 파일을 서버에서 삭제할 것 (DDL 실행 권한이 있는 공개 URL이므로).
 */
error_reporting(0);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// ============================================================
// 보호 가드
// ============================================================
$_argv = isset($argv) ? $argv : array();
$isCli = (php_sapi_name() === 'cli');
$webConfirmed = isset($_GET['confirm_migrate']) && $_GET['confirm_migrate'] === 'YES_RUN_NOW';
if (!$isCli && !$webConfirmed) {
    header('Content-Type: text/plain; charset=utf-8');
    die("006 마이그레이션 러너입니다. CLI에서 실행하거나 ?confirm_migrate=YES_RUN_NOW 파라미터를 붙이세요. (dry_run=1 로 미리보기)\n");
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

echo "=== 006 마이그레이션: 스티비 뉴스레터 연동 컬럼 ===\n";
echo $isDryRun ? "[DRY RUN] 변경 없이 상태만 확인합니다.\n\n" : "[실행 모드]\n\n";

// ============================================================
// DB 연결 — customers_api.php와 동일한 폴백 패턴 (db_config.php는 ../)
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

function tableExists($conn, $table) {
    $res = $conn->query("SHOW TABLES LIKE '" . $conn->real_escape_string($table) . "'");
    if (!$res) return false;
    $exists = $res->num_rows > 0;
    $res->free();
    return $exists;
}

function columnExists($conn, $table, $column) {
    $res = $conn->query("SHOW COLUMNS FROM `" . $table . "` LIKE '" . $conn->real_escape_string($column) . "'");
    if (!$res) return false;
    $exists = $res->num_rows > 0;
    $res->free();
    return $exists;
}

function scalar($conn, $sql) {
    $res = $conn->query($sql);
    if (!$res) return null;
    $row = $res->fetch_row();
    $res->free();
    return $row ? $row[0] : null;
}

$errors = 0;

// ============================================================
// 0) 현재 상태
// ============================================================
$total = scalar($conn, "SELECT COUNT(*) FROM airtor_customers");
echo "airtor_customers 행 수: " . intval($total) . "\n";
$hasStatus   = columnExists($conn, 'airtor_customers', 'newsletter_status');
$hasSyncedAt = columnExists($conn, 'airtor_customers', 'stibee_synced_at');
$hasContacts = columnExists($conn, 'airtor_customers', 'contacts');
echo "컬럼 존재 여부 — newsletter_status: " . ($hasStatus ? 'Y' : 'N')
   . ", stibee_synced_at: " . ($hasSyncedAt ? 'Y' : 'N')
   . ", contacts: " . ($hasContacts ? 'Y' : 'N') . "\n\n";

// ============================================================
// 1) 백업 테이블
// ============================================================
echo "[1] 백업 테이블 airtor_customers_backup_pre_newsletter\n";
if (tableExists($conn, 'airtor_customers_backup_pre_newsletter')) {
    echo "    이미 존재 — skip\n";
} elseif ($isDryRun) {
    echo "    (dry-run) CREATE TABLE ... AS SELECT * FROM airtor_customers 예정\n";
} else {
    if ($conn->query("CREATE TABLE airtor_customers_backup_pre_newsletter AS SELECT * FROM airtor_customers")) {
        echo "    생성 완료 (" . intval(scalar($conn, "SELECT COUNT(*) FROM airtor_customers_backup_pre_newsletter")) . "행)\n";
    } else {
        echo "    ERROR: " . $conn->error . "\n";
        $errors++;
    }
}

// ============================================================
// 2) ALTER TABLE — 컬럼별로 개별 실행 (부분 적용 상태에서도 멱등)
// ============================================================
echo "\n[2] ALTER TABLE airtor_customers\n";
$alters = array(
    array('newsletter_status', "ALTER TABLE airtor_customers ADD COLUMN newsletter_status ENUM('none','subscribed','unsubscribed','bounced') NOT NULL DEFAULT 'none' AFTER reminder_status"),
    array('stibee_synced_at',  "ALTER TABLE airtor_customers ADD COLUMN stibee_synced_at DATETIME DEFAULT NULL AFTER newsletter_status"),
    array('contacts',          "ALTER TABLE airtor_customers ADD COLUMN contacts TEXT DEFAULT NULL AFTER email"),
);
foreach ($alters as $a) {
    $col = $a[0];
    $sql = $a[1];
    if (columnExists($conn, 'airtor_customers', $col)) {
        echo "    $col: 이미 존재 — skip\n";
        continue;
    }
    if ($isDryRun) {
        echo "    $col: (dry-run) 추가 예정\n";
        continue;
    }
    if ($conn->query($sql)) {
        echo "    $col: 추가 완료\n";
    } else {
        echo "    $col: ERROR " . $conn->error . "\n";
        $errors++;
    }
}

// ============================================================
// 3) contacts 백필 — PHP에서 json_encode로 안전하게 생성
//    대상: contacts가 NULL/빈값이고, 담당자명·이메일·전화 중 하나라도 있는 행
// ============================================================
echo "\n[3] contacts 백필\n";
if (!columnExists($conn, 'airtor_customers', 'contacts')) {
    echo "    contacts 컬럼 없음 — " . ($isDryRun ? "(dry-run) 컬럼 추가 후 백필 예정" : "skip") . "\n";
    if ($isDryRun) {
        $cnt = scalar($conn, "SELECT COUNT(*) FROM airtor_customers WHERE IFNULL(contact_name,'') != '' OR IFNULL(email,'') != '' OR IFNULL(phone,'') != ''");
        echo "    백필 대상 예상: " . intval($cnt) . "행\n";
    }
} else {
    $res = $conn->query(
        "SELECT id, contact_name, contact_position, phone, email " .
        "FROM airtor_customers " .
        "WHERE (contacts IS NULL OR contacts = '') " .
        "  AND (IFNULL(contact_name,'') != '' OR IFNULL(email,'') != '' OR IFNULL(phone,'') != '')"
    );
    if (!$res) {
        echo "    ERROR: 대상 조회 실패: " . $conn->error . "\n";
        $errors++;
    } else {
        $targets = array();
        while ($row = $res->fetch_assoc()) $targets[] = $row;
        $res->free();
        echo "    백필 대상: " . count($targets) . "행\n";

        if ($isDryRun) {
            $preview = array_slice($targets, 0, 3);
            foreach ($preview as $t) {
                $json = json_encode(array(array(
                    'name' => (string)$t['contact_name'],
                    'position' => (string)$t['contact_position'],
                    'phone' => (string)$t['phone'],
                    'email' => (string)$t['email'],
                )));
                echo "    (dry-run) id=" . $t['id'] . " → " . $json . "\n";
            }
        } else {
            $stmt = $conn->prepare("UPDATE airtor_customers SET contacts = ? WHERE id = ? AND (contacts IS NULL OR contacts = '')");
            if (!$stmt) {
                echo "    ERROR: prepare 실패: " . $conn->error . "\n";
                $errors++;
            } else {
                $done = 0;
                foreach ($targets as $t) {
                    $json = json_encode(array(array(
                        'name' => (string)$t['contact_name'],
                        'position' => (string)$t['contact_position'],
                        'phone' => (string)$t['phone'],
                        'email' => (string)$t['email'],
                    )));
                    $id = intval($t['id']);
                    $stmt->bind_param('si', $json, $id);
                    if ($stmt->execute()) {
                        $done++;
                    } else {
                        echo "    ERROR id=" . $id . ": " . $stmt->error . "\n";
                        $errors++;
                    }
                }
                $stmt->close();
                echo "    백필 완료: " . $done . "행\n";
            }
        }
    }
}

// ============================================================
// 4) 검증
// ============================================================
echo "\n[4] 검증\n";
$hasStatus   = columnExists($conn, 'airtor_customers', 'newsletter_status');
$hasSyncedAt = columnExists($conn, 'airtor_customers', 'stibee_synced_at');
$hasContacts = columnExists($conn, 'airtor_customers', 'contacts');
echo "    newsletter_status: " . ($hasStatus ? 'Y' : 'N')
   . ", stibee_synced_at: " . ($hasSyncedAt ? 'Y' : 'N')
   . ", contacts: " . ($hasContacts ? 'Y' : 'N') . "\n";
if ($hasContacts) {
    $filled = scalar($conn, "SELECT COUNT(*) FROM airtor_customers WHERE contacts IS NOT NULL AND contacts != ''");
    echo "    contacts 채워진 행: " . intval($filled) . " / " . intval($total) . "\n";
    $res = $conn->query("SELECT id, company, email, contacts, newsletter_status FROM airtor_customers ORDER BY id DESC LIMIT 3");
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            echo "    id=" . $row['id'] . " " . $row['company'] . " | " . $row['email'] . " | " . $row['contacts'] . " | " . $row['newsletter_status'] . "\n";
        }
        $res->free();
    }
}

echo "\n";
if ($isDryRun) {
    echo "DRY RUN 종료 — 변경 없음.\n";
} elseif ($errors > 0) {
    echo "완료 (오류 " . $errors . "건 — 위 로그 확인). 재실행은 안전합니다.\n";
} else {
    echo "완료 — 오류 없음. 이 파일을 서버에서 삭제하세요.\n";
}
$conn->close();
