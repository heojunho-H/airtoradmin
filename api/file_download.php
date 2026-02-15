<?php
/**
 * 첨부파일 다운로드 API
 * Gnuboard Gn_Online 테이블의 첨부파일을 안전하게 다운로드
 *
 * 사용: GET /api/file_download.php?id={on_num}&file={1|2|3}
 */

header('Access-Control-Allow-Origin: *');

$id = isset($_GET['id']) ? intval($_GET['id']) : 0;
$fileNum = isset($_GET['file']) ? intval($_GET['file']) : 0;

if ($id <= 0 || $fileNum < 1 || $fileNum > 3) {
    http_response_code(400);
    echo 'Invalid parameters';
    exit;
}

$conn = new mysqli('localhost', 'airtor2014', 'aesd1122!', 'airtor2014');
if ($conn->connect_error) {
    http_response_code(500);
    echo 'DB connection failed';
    exit;
}
$conn->set_charset('utf8mb4');

$onameCol = "on_userfile{$fileNum}_oname";
$rnameCol = "on_userfile{$fileNum}_rname";

$stmt = $conn->prepare("SELECT {$onameCol}, {$rnameCol} FROM Gn_Online WHERE on_num = ?");
$stmt->bind_param('i', $id);
$stmt->execute();
$stmt->bind_result($oname, $rname);

if (!$stmt->fetch()) {
    http_response_code(404);
    echo 'Deal not found';
    $stmt->close();
    $conn->close();
    exit;
}

$stmt->close();
$conn->close();

if (!$rname) {
    http_response_code(404);
    echo 'File not found';
    exit;
}

// Gnuboard 표준 온라인 상담 파일 경로
$fileDirs = array(
    $_SERVER['DOCUMENT_ROOT'] . '/data/file/online/',
    $_SERVER['DOCUMENT_ROOT'] . '/data/online/',
    $_SERVER['DOCUMENT_ROOT'] . '/data/file/',
);

$filePath = '';
foreach ($fileDirs as $dir) {
    if (file_exists($dir . $rname)) {
        $filePath = $dir . $rname;
        break;
    }
}

if (!$filePath) {
    http_response_code(404);
    echo 'File not found on disk';
    exit;
}

// 경로 조작 방지
$realPath = realpath($filePath);
$allowed = false;
foreach ($fileDirs as $dir) {
    $realDir = realpath($dir);
    if ($realDir && strpos($realPath, $realDir) === 0) {
        $allowed = true;
        break;
    }
}

if (!$allowed) {
    http_response_code(403);
    echo 'Access denied';
    exit;
}

// 다운로드 헤더
$downloadName = $oname ? $oname : $rname;
$mimeType = function_exists('mime_content_type') ? mime_content_type($filePath) : '';
if (!$mimeType) $mimeType = 'application/octet-stream';

header('Content-Type: ' . $mimeType);
header('Content-Disposition: attachment; filename="' . rawurlencode($downloadName) . '"; filename*=UTF-8\'\'' . rawurlencode($downloadName));
header('Content-Length: ' . filesize($filePath));
header('Cache-Control: no-cache');

readfile($filePath);
exit;
