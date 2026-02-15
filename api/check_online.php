<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$conn = new mysqli('localhost', 'airtor2014', 'aesd1122!', 'airtor2014');
if ($conn->connect_error) {
    echo json_encode(array('error' => 'DB connection failed'));
    exit;
}
$conn->set_charset('utf8mb4');

// 1. 테이블 구조 확인
$columns = array();
$result = $conn->query('DESCRIBE Gn_Online');
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $columns[] = $row['Field'];
    }
}

// 2. 파일 컬럼 존재 여부
$fileColumns = array_filter($columns, function($col) {
    return strpos($col, 'userfile') !== false;
});

// 3. 파일이 있는 레코드 확인
$fileData = array();
if (!empty($fileColumns)) {
    $sample = $conn->query("SELECT on_num, on_subject,
        on_userfile1_oname, on_userfile1_rname,
        on_userfile2_oname, on_userfile2_rname,
        on_userfile3_oname, on_userfile3_rname
        FROM Gn_Online
        WHERE on_site = 'airtor2014'
        AND (on_userfile1_rname != '' OR on_userfile2_rname != '' OR on_userfile3_rname != '')
        ORDER BY on_num DESC LIMIT 10");
    if ($sample) {
        while ($row = $sample->fetch_assoc()) {
            $fileData[] = $row;
        }
    }
}

echo json_encode(array(
    'all_columns' => $columns,
    'file_columns' => array_values($fileColumns),
    'file_data_sample' => $fileData
), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

$conn->close();
