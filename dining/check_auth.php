<?php
session_start();
if (empty($_SESSION['dining_authed'])) {
    header('Location: /dining/login.php');
    exit;
}
