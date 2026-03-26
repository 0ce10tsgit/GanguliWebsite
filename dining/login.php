<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dining · Login</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      font-family: Arial, sans-serif;
    }
    .card {
      background: #111;
      border: 2px solid #e64f4f;
      padding: 40px 48px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      min-width: 300px;
    }
    h1 {
      color: #e64f4f;
      font-size: 28px;
      margin: 0 0 8px;
    }
    input[type="password"] {
      width: 100%;
      padding: 10px 14px;
      background: #000;
      border: 1px solid #e64f4f;
      color: #fff;
      font-size: 16px;
      outline: none;
    }
    input[type="password"]:focus {
      border-color: #ff7070;
    }
    button {
      width: 100%;
      padding: 10px;
      background: transparent;
      border: 2px solid #e64f4f;
      color: #e64f4f;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    button:hover {
      background: #e64f4f;
      color: #000;
    }
    .error {
      color: #ff7070;
      font-size: 14px;
    }
    a {
      color: #e64f4f;
      font-size: 13px;
      text-decoration: none;
    }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>RPI Dining</h1>
    <?php if (!empty($_GET['error'])): ?>
      <p class="error">Wrong password.</p>
    <?php endif; ?>
    <form method="POST" action="/dining/auth.php">
      <input type="password" name="password" placeholder="Password" autofocus required>
      <br><br>
      <button type="submit">Enter</button>
    </form>
    <a href="/">Back</a>
  </div>
</body>
</html>
