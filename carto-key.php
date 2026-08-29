<?php
header('Content-Type: application/javascript');
header('Cache-Control: no-store');

$env = parse_ini_file(__DIR__ . '/.env') ?: [];
$key = $env['CARTO_KEY'] ?? '';

echo 'export const CARTO_KEY = ' . json_encode($key) . ';';
