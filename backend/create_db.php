<?php
try {
    $pdo = new PDO('mysql:host=127.0.0.1', 'root', '');
    $pdo->exec('CREATE DATABASE IF NOT EXISTS lms_sma15 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    echo "Database 'lms_sma15' created successfully!\n";
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
