<?php
declare(strict_types=1);

/**
 * Contact form handler — uses PHP mail().
 * Adjust RECIPIENT / FROM_* if needed. On XAMPP, configure sendmail or use a host with working mail().
 */

header('X-Content-Type-Options: nosniff');

const RECIPIENT_EMAIL = 'info@futurlatamcorp.com';
const FROM_EMAIL = 'info@futurlatamcorp.com';
const FROM_NAME = 'Futur Latam Corp Website';

function is_ajax_request(): bool
{
    return !empty($_SERVER['HTTP_X_REQUESTED_WITH'])
        && strtolower((string) $_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest';
}

function respond_json(bool $success, string $message, int $http = 200): never
{
    http_response_code($http);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['success' => $success, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function respond_redirect(bool $success): never
{
    if ($success) {
        header('Location: contact.html?sent=1');
    } else {
        header('Location: contact.html?error=1');
    }
    exit;
}

function header_safe_line(string $value): string
{
    return str_replace(["\r", "\n"], '', $value);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    if (is_ajax_request()) {
        respond_json(false, 'Method not allowed.', 405);
    }
    header('Location: contact.html');
    exit;
}

// Honeypot — leave empty in real browsers
if (!empty($_POST['website'])) {
    if (is_ajax_request()) {
        respond_json(true, 'Thank you.');
    }
    respond_redirect(true);
}

$name = trim((string) ($_POST['name'] ?? ''));
$email = trim((string) ($_POST['email'] ?? ''));
$company = trim((string) ($_POST['company'] ?? ''));
$phone = trim((string) ($_POST['phone'] ?? ''));
$topic = trim((string) ($_POST['topic'] ?? ''));
$message = trim((string) ($_POST['message'] ?? ''));

if ($name === '' || strlen($name) > 200) {
    if (is_ajax_request()) {
        respond_json(false, 'Please enter a valid name.', 400);
    }
    respond_redirect(false);
}

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    if (is_ajax_request()) {
        respond_json(false, 'Please enter a valid email address.', 400);
    }
    respond_redirect(false);
}

if ($message === '' || strlen($message) > 8000) {
    if (is_ajax_request()) {
        respond_json(false, 'Please enter a message (max 8000 characters).', 400);
    }
    respond_redirect(false);
}

foreach ([$company, $phone, $topic] as $f) {
    if (strlen($f) > 500) {
        if (is_ajax_request()) {
            respond_json(false, 'One of the fields is too long.', 400);
        }
        respond_redirect(false);
    }
}

$subject = 'New inquiry — Futur Latam Corp';
if ($topic !== '') {
    $subject .= ' [' . header_safe_line($topic) . ']';
}

$bodyLines = [
    'Name: ' . $name,
    'Email: ' . $email,
];
if ($company !== '') {
    $bodyLines[] = 'Company: ' . $company;
}
if ($phone !== '') {
    $bodyLines[] = 'Phone: ' . $phone;
}
if ($topic !== '') {
    $bodyLines[] = 'Topic: ' . $topic;
}
$bodyLines[] = '';
$bodyLines[] = $message;
$body = implode("\n", $bodyLines);

$replyTo = header_safe_line($email);

$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'From: "' . header_safe_line(FROM_NAME) . '" <' . FROM_EMAIL . '>',
    'Reply-To: ' . $replyTo,
    'X-Mailer: PHP/' . PHP_VERSION,
];

$headerStr = implode("\r\n", $headers);

$sent = @mail(RECIPIENT_EMAIL, $subject, $body, $headerStr);

if (!$sent) {
    if (is_ajax_request()) {
        respond_json(
            false,
            'The message could not be sent from this server. Please try again later or email us directly.',
            500
        );
    }
    respond_redirect(false);
}

if (is_ajax_request()) {
    respond_json(true, 'Thank you — we received your message and will reply soon.');
}

respond_redirect(true);
