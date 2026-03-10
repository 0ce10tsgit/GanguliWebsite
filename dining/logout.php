<?php
session_start();
session_destroy();
header('Location: /dining/login.php');
exit;
