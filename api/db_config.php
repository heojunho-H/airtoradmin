<?php
/**
 * DB 접속 설정 — airtoradmin 전용
 * 모든 API에서 require_once 'db_config.php'; 로 사용
 */

$db_host = 'localhost';
$db_user = 'airtor2014';
$db_pass = 'aesd1122!';
$db_name = 'airtor2014';

$conn = new mysqli($db_host, $db_user, $db_pass, $db_name);
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(array('error' => 'DB connection failed'));
    exit;
}
$conn->set_charset('utf8');
