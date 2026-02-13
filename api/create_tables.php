<?php
// 임시 스크립트 — 테이블 생성 후 삭제할 것
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$conn = new mysqli('localhost', 'airtor2014', 'aesd1122!', 'airtor2014');
if ($conn->connect_error) {
    echo json_encode(array('error' => 'DB connection failed: ' . $conn->connect_error));
    exit;
}
$conn->set_charset('utf8');

$results = array();

// 1. 고객 테이블
$sql1 = "CREATE TABLE IF NOT EXISTS airtor_customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company VARCHAR(255) NOT NULL DEFAULT '',
    grade VARCHAR(10) NOT NULL DEFAULT 'B',
    customer_status VARCHAR(30) NOT NULL DEFAULT '',
    contact_name VARCHAR(100) NOT NULL DEFAULT '',
    contact_position VARCHAR(100) NOT NULL DEFAULT '',
    deals INT NOT NULL DEFAULT 0,
    last_work_date VARCHAR(20) NOT NULL DEFAULT '',
    total_quantity INT NOT NULL DEFAULT 0,
    total_amount BIGINT NOT NULL DEFAULT 0,
    management_cycle INT NOT NULL DEFAULT 30,
    next_management_date VARCHAR(20) NOT NULL DEFAULT '',
    reminder_status VARCHAR(30) NOT NULL DEFAULT '',
    account_manager VARCHAR(100) NOT NULL DEFAULT '',
    phone VARCHAR(50) NOT NULL DEFAULT '',
    email VARCHAR(100) NOT NULL DEFAULT '',
    address VARCHAR(255) NOT NULL DEFAULT '',
    field_manager VARCHAR(100) NOT NULL DEFAULT '',
    memo TEXT,
    detailed_quantity TEXT,
    work_history TEXT,
    email_history TEXT,
    internal_notes TEXT,
    created_at DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8";

if ($conn->query($sql1)) {
    $results['airtor_customers'] = 'OK';
} else {
    $results['airtor_customers'] = 'FAIL: ' . $conn->error;
}

// 2. 고객책임자 테이블
$sql2 = "CREATE TABLE IF NOT EXISTS airtor_customer_managers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL DEFAULT '',
    position VARCHAR(50) NOT NULL DEFAULT '',
    phone VARCHAR(50) NOT NULL DEFAULT '',
    email VARCHAR(100) NOT NULL DEFAULT '',
    address VARCHAR(255) NOT NULL DEFAULT '',
    assigned_area VARCHAR(100) NOT NULL DEFAULT '',
    join_date VARCHAR(20) NOT NULL DEFAULT '',
    assigned_customers INT NOT NULL DEFAULT 0,
    active_projects INT NOT NULL DEFAULT 0,
    completed_projects INT NOT NULL DEFAULT 0,
    total_sales_amount BIGINT NOT NULL DEFAULT 0,
    performance_rating FLOAT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    repurchase_rate FLOAT NOT NULL DEFAULT 0,
    new_customers INT NOT NULL DEFAULT 0,
    repurchase_customers INT NOT NULL DEFAULT 0,
    specialties TEXT,
    recent_activities TEXT,
    created_at DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8";

if ($conn->query($sql2)) {
    $results['airtor_customer_managers'] = 'OK';
} else {
    $results['airtor_customer_managers'] = 'FAIL: ' . $conn->error;
}

// 3. 작업팀장/하청 테이블
$sql3 = "CREATE TABLE IF NOT EXISTS airtor_subcontractors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL DEFAULT '',
    company VARCHAR(255) NOT NULL DEFAULT '',
    phone VARCHAR(50) NOT NULL DEFAULT '',
    email VARCHAR(100) NOT NULL DEFAULT '',
    address VARCHAR(255) NOT NULL DEFAULT '',
    assigned_area VARCHAR(100) NOT NULL DEFAULT '',
    registration_date VARCHAR(20) NOT NULL DEFAULT '',
    specialization VARCHAR(100) NOT NULL DEFAULT '',
    team_size INT NOT NULL DEFAULT 0,
    grade VARCHAR(10) NOT NULL DEFAULT 'B',
    age INT NOT NULL DEFAULT 0,
    ongoing_projects INT NOT NULL DEFAULT 0,
    completed_projects INT NOT NULL DEFAULT 0,
    total_contract_amount BIGINT NOT NULL DEFAULT 0,
    performance_rating FLOAT NOT NULL DEFAULT 0,
    cooperation_score FLOAT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'available',
    memo TEXT,
    repurchase_count INT NOT NULL DEFAULT 0,
    base_score FLOAT NOT NULL DEFAULT 0,
    certifications TEXT,
    evaluation_history TEXT,
    recent_projects TEXT,
    recent_activities TEXT,
    created_at DATETIME NOT NULL DEFAULT '0000-00-00 00:00:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8";

if ($conn->query($sql3)) {
    $results['airtor_subcontractors'] = 'OK';
} else {
    $results['airtor_subcontractors'] = 'FAIL: ' . $conn->error;
}

echo json_encode($results);
$conn->close();
