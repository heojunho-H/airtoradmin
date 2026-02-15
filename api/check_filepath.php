<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

// DB에서 파일명 확인
$conn = new mysqli('localhost', 'airtor2014', 'aesd1122!', 'airtor2014');
$conn->set_charset('utf8mb4');

$stmt = $conn->prepare("SELECT on_userfile1_rname FROM Gn_Online WHERE on_num = 333");
$stmt->execute();
$stmt->bind_result($rname);
$stmt->fetch();
$stmt->close();
$conn->close();

$docRoot = $_SERVER['DOCUMENT_ROOT'];

// 가능한 경로들을 모두 검사
$paths = array(
    $docRoot . '/data/file/online/' . $rname,
    $docRoot . '/data/online/' . $rname,
    $docRoot . '/data/file/' . $rname,
    $docRoot . '/data/' . $rname,
    $docRoot . '/online/data/' . $rname,
    $docRoot . '/skin/online/data/' . $rname,
    $docRoot . '/admin/online/data/' . $rname,
);

$result = array(
    'rname' => $rname,
    'document_root' => $docRoot,
    'paths_checked' => array()
);

foreach ($paths as $p) {
    $result['paths_checked'][] = array(
        'path' => $p,
        'exists' => file_exists($p)
    );
}

// data 디렉토리 내용도 확인
$dataDirs = array(
    $docRoot . '/data/',
    $docRoot . '/data/file/',
    $docRoot . '/data/online/',
    $docRoot . '/data/file/online/',
    $docRoot . '/online/',
    $docRoot . '/online/data/',
);

// /online/ 디렉토리 내용 확인
$onlineDir = $docRoot . '/online/';
$result['online_dir_contents'] = array();
if (is_dir($onlineDir)) {
    $dh = opendir($onlineDir);
    if ($dh) {
        $count = 0;
        while (($file = readdir($dh)) !== false && $count < 20) {
            if ($file !== '.' && $file !== '..') {
                $result['online_dir_contents'][] = $file;
                $count++;
            }
        }
        closedir($dh);
    }
    // 직접 파일 확인
    $result['file_in_online'] = file_exists($onlineDir . $rname);
}

// /online/data/ 디렉토리 확인
$onlineDataDir = $docRoot . '/online/data/';
$result['file_in_online_data'] = file_exists($onlineDataDir . $rname);
$result['online_data_contents'] = array();
if (is_dir($onlineDataDir)) {
    $dh2 = opendir($onlineDataDir);
    if ($dh2) {
        $count2 = 0;
        while (($file2 = readdir($dh2)) !== false && $count2 < 20) {
            if ($file2 !== '.' && $file2 !== '..') {
                $result['online_data_contents'][] = $file2;
                $count2++;
            }
        }
        closedir($dh2);
    }
}

$result['existing_dirs'] = array();
foreach ($dataDirs as $d) {
    if (is_dir($d)) {
        $result['existing_dirs'][] = $d;
    }
}

echo json_encode($result);
