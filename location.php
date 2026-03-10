<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
$goto = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'];
$url = "http://ip-api.com/json/$goto";
$data = file_get_contents($url);
echo $data;
?>