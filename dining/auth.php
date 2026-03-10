<?php
session_start();

$env = parse_ini_file(__DIR__ . '/.env');
$hash = $env['DINING_PASSWORD_HASH'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = $_POST['password'] ?? '';
    if (password_verify($input, $hash)) {
        $_SESSION['dining_authed'] = true;
        header('Location: /dining/home.php');
    } else {
        header('Location: /dining/login.php?error=1');
    }
    exit;
}

header('Location: /dining/login.php');
exit;
