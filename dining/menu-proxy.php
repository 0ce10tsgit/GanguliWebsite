<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$hall = $_GET['hall'] ?? '';
$date = $_GET['date'] ?? date('Y-m-d');

$ids = [
  'commons' => ['locationId' => 22374, 'menuId' => 9000007],
  'sage'    => ['locationId' => 22375, 'menuId' => 9000007],
];

if (!isset($ids[$hall])) {
  http_response_code(400);
  echo json_encode(['error' => 'Unknown hall']);
  exit;
}

$locationId = $ids[$hall]['locationId'];
$menuId     = $ids[$hall]['menuId'];
$url = "https://rpi.sodexomyway.com/api/menu?menuId={$menuId}&locationId={$locationId}&date={$date}";

$ch = curl_init($url);
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_TIMEOUT        => 8,
  CURLOPT_HTTPHEADER     => ['Accept: application/json'],
  CURLOPT_USERAGENT      => 'Mozilla/5.0',
]);

$body = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($body === false || $code !== 200) {
  http_response_code(502);
  echo json_encode(['error' => 'Upstream failed', 'code' => $code]);
  exit;
}

echo $body;
