<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$hall = $_GET['hall'] ?? '';
$allowed = ['commons', 'sage'];

if (!in_array($hall, $allowed, true)) {
  http_response_code(400);
  echo json_encode(['error' => 'Unknown hall']);
  exit;
}

$file = __DIR__ . "/data/{$hall}.json";
if (!is_readable($file)) {
  http_response_code(404);
  echo json_encode(['error' => 'No cached menu data — scraper may not have run yet']);
  exit;
}

readfile($file);
