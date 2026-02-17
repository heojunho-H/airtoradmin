<?php
/**
 * 파일 다운로드 — Prepared Statement 적용
 * 기존 eregi(), sql_fetch() 등 deprecated 함수 제거
 */

require_once __DIR__ . '/db_config.php';

$on_num = isset($_GET['on_num']) ? intval($_GET['on_num']) : 0;
$idx = isset($_GET['idx']) ? intval($_GET['idx']) : 0;

if ($on_num <= 0 || $idx <= 0) {
    http_response_code(400);
    die('잘못된 요청입니다.');
}

// 허용 컬럼 화이트리스트 (idx 1~3만 허용)
if ($idx < 1 || $idx > 3) {
    http_response_code(400);
    die('잘못된 파일 인덱스입니다.');
}

$oname_col = "on_userfile{$idx}_oname";
$rname_col = "on_userfile{$idx}_rname";

// Prepared Statement 사용
$stmt = $conn->prepare("SELECT {$oname_col}, {$rname_col} FROM Gn_Online WHERE on_num = ? LIMIT 1");
$stmt->bind_param('i', $on_num);
$stmt->execute();
$result = $stmt->get_result();
$row = $result->fetch_assoc();
$stmt->close();
$conn->close();

if (!$row) {
    http_response_code(404);
    die('데이터를 찾을 수 없습니다.');
}

$file_oname = $row[$oname_col];
$file_rname = $row[$rname_col];

if (empty($file_rname)) {
    http_response_code(404);
    die('파일이 존재하지 않습니다.');
}

// 경로 조작 방지: 파일명에 디렉토리 구분자 포함 시 차단
if (strpos($file_rname, '/') !== false || strpos($file_rname, '\\') !== false || strpos($file_rname, '..') !== false) {
    http_response_code(400);
    die('잘못된 파일 경로입니다.');
}

$fileDir = $_SERVER['DOCUMENT_ROOT'] . '/online/data/' . $file_rname;

if (!is_file($fileDir)) {
    http_response_code(404);
    die('해당 파일이나 경로가 존재하지 않습니다.');
}

// IE 브라우저 파일명 인코딩 처리
$ua = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '';
$is_ie = (strpos($ua, 'MSIE') !== false || strpos($ua, 'Trident') !== false);

if ($is_ie) {
    $file_oname = iconv('UTF-8', 'EUC-KR//IGNORE', $file_oname);
}

header('Content-Type: application/octet-stream');
header('Content-Length: ' . filesize($fileDir));
header('Content-Disposition: attachment; filename="' . $file_oname . '"');
header('Content-Transfer-Encoding: binary');
header('Pragma: no-cache');
header('Expires: 0');

readfile($fileDir);
exit;
