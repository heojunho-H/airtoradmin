<?php
/**
 * 첨부파일 다운로드 API
 * 기존 Gnuboard /online/download.php로 리다이렉트
 *
 * 사용: GET /api/file_download.php?id={on_num}&file={1|2|3}
 */

$id = isset($_GET['id']) ? intval($_GET['id']) : 0;
$fileNum = isset($_GET['file']) ? intval($_GET['file']) : 0;

if ($id <= 0 || $fileNum < 1 || $fileNum > 3) {
    header('HTTP/1.1 400 Bad Request');
    echo 'Invalid parameters';
    exit;
}

header('Location: /online/download.php?on_num=' . $id . '&idx=' . $fileNum);
exit;
