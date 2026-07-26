<?php
declare(strict_types=1);

/**
 * public/api/contact.php  v1.2
 *
 * Contact-form endpoint for ngplustrailers.com. Accepts a JSON (or
 * form-encoded) POST, appends it to an append-only log OUTSIDE the document
 * root, then tries to email it. The log write happens first and on its own:
 * if mail() fails the submission is still captured, so a lead is never lost
 * to an SMTP problem.
 *
 * The live form (src/routes/index.tsx) sends: name, game, email, steam,
 * requirements, timeline. All six are forwarded; email is required and
 * requirements is treated as the message body.
 *
 * Deliberately FIELD-AGNOSTIC. It requires a valid email address and some
 * non-empty content, and forwards every other scalar field it receives. That
 * means the client can send whatever shape it likes and this does not need
 * to change when the form gains or renames a field.
 *
 * Lives in public/ so Vite copies it into .output/public during build and it
 * ships with the normal scp deploy. It is a real file on disk, so the SPA
 * rewrite in .htaccess passes it through untouched (the standard
 * "RewriteCond %{REQUEST_FILENAME} !-f" guard) - verify with:
 *   curl -sS -X POST https://ngplustrailers.com/api/contact.php \
 *     -H 'Content-Type: application/json' --data '{"email":"x@y.com","message":"probe"}'
 *
 * CONFIG - every value has a working default, so this file is drop-in and
 * needs NO .htaccess change and no edits. To override any of them, add
 * SetEnv lines to public/.htaccess IN THE REPO (cPanel honours SetEnv for
 * PHP). Never edit public_html/.htaccess on the server: it is repo-owned and
 * overwritten on the next deploy.
 *
 *   SetEnv CONTACT_TO        "someone-else@yourdomain.com"
 *   SetEnv CONTACT_FROM      "noreply@ngplustrailers.com"
 *   SetEnv CONTACT_SUBJECT   "NG+ site enquiry"
 *   SetEnv CONTACT_LOG_DIR   "/home/ngplus"
 *   SetEnv CONTACT_RATE_MAX  "10"
 *   SetEnv CONTACT_ORIGINS   "https://ngplustrailers.com,https://www.ngplustrailers.com"
 *
 * CONTACT_TO defaults to hello@ngplustrailers.com - the address already
 * published in the site footer, so nothing secret is baked in here.
 *
 * CONTACT_FROM must be an address ON this domain or the mail is likely to be
 * rejected or spam-filed. The submitter's address goes in Reply-To, never in
 * From.
 *
 * Anti-spam, in order of cheapness: request-size cap, origin check, honeypot
 * field, submit-timing floor, per-IP hourly rate limit. No CAPTCHA, no third
 * party, no JS dependency.
 */

// ---------------------------------------------------------------- constants

const MAX_BODY_BYTES   = 65536;   // 64 KB
const MAX_FIELD_CHARS  = 8000;
const MAX_FIELDS       = 40;
const MIN_SUBMIT_MS    = 2000;    // faster than this is a bot
const RATE_WINDOW_SECS = 3600;

// ------------------------------------------------------------------ helpers

function cfg(string $name, string $default = ''): string
{
    $v = getenv($name);
    if ($v === false || trim((string) $v) === '') {
        return $default;
    }
    return trim((string) $v);
}

/** Emit JSON and stop. */
function respond(int $status, array $payload, array $extraHeaders = []): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    foreach ($extraHeaders as $h) {
        header($h);
    }
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Silent accept. Used for spam so a bot cannot tell rejection from success
 * and start probing for the rule it tripped.
 */
function silentAccept(): void
{
    respond(200, ['ok' => true]);
}

/** Strip anything that could break out of a mail header. */
function headerSafe(string $s): string
{
    return trim(str_replace(["\r", "\n", "\0"], ' ', $s));
}

function clientIp(): string
{
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'] as $k) {
        if (!empty($_SERVER[$k])) {
            $ip = trim(explode(',', (string) $_SERVER[$k])[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
    }
    return '0.0.0.0';
}

/**
 * Flatten the payload to scalar string fields, capped in count and length.
 * Nested structures are JSON-encoded rather than dropped, so nothing is lost
 * silently.
 */
function normalizeFields(array $raw): array
{
    $out = [];
    foreach ($raw as $key => $value) {
        if (count($out) >= MAX_FIELDS) {
            break;
        }
        $key = substr(preg_replace('/[^A-Za-z0-9_.\- ]/', '', (string) $key) ?? '', 0, 60);
        if ($key === '') {
            continue;
        }
        if (is_bool($value)) {
            $value = $value ? 'true' : 'false';
        } elseif (is_null($value)) {
            $value = '';
        } elseif (is_array($value) || is_object($value)) {
            $value = json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        }
        $out[$key] = substr((string) $value, 0, MAX_FIELD_CHARS);
    }
    return $out;
}

/** First non-empty value among the given candidate keys, case-insensitively. */
function pick(array $fields, array $candidates): string
{
    $lower = [];
    foreach ($fields as $k => $v) {
        $lower[strtolower($k)] = $v;
    }
    foreach ($candidates as $c) {
        $c = strtolower($c);
        if (isset($lower[$c]) && trim((string) $lower[$c]) !== '') {
            return trim((string) $lower[$c]);
        }
    }
    return '';
}

/**
 * Per-IP hourly limit, kept in a small JSON file. Fails OPEN: if the counter
 * cannot be read or written we accept the submission rather than lose a real
 * enquiry to a permissions problem.
 */
function rateLimited(string $dir, string $ip, int $max): bool
{
    if ($max <= 0) {
        return false;
    }
    $path = rtrim($dir, '/') . '/contact-ratelimit.json';
    $now  = time();

    $fh = @fopen($path, 'c+');
    if ($fh === false) {
        return false;
    }
    if (!@flock($fh, LOCK_EX)) {
        fclose($fh);
        return false;
    }

    $size = (int) (@filesize($path) ?: 0);
    $data = [];
    if ($size > 0) {
        $decoded = json_decode((string) @fread($fh, $size), true);
        if (is_array($decoded)) {
            $data = $decoded;
        }
    }

    // Drop expired entries so the file cannot grow without bound.
    foreach ($data as $k => $entry) {
        if (!is_array($entry) || ($entry['first'] ?? 0) < $now - RATE_WINDOW_SECS) {
            unset($data[$k]);
        }
    }

    $key   = hash('sha256', $ip);
    $entry = $data[$key] ?? ['first' => $now, 'count' => 0];
    $entry['count'] = (int) $entry['count'] + 1;
    $data[$key] = $entry;

    @ftruncate($fh, 0);
    @rewind($fh);
    @fwrite($fh, (string) json_encode($data));
    @fflush($fh);
    @flock($fh, LOCK_UN);
    @fclose($fh);

    return $entry['count'] > $max;
}

// --------------------------------------------------------------------- main

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    header('Allow: POST');
    respond(204, []);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, ['ok' => false, 'error' => 'Method not allowed.']);
}

$to        = cfg('CONTACT_TO', 'hello@ngplustrailers.com');
$from      = cfg('CONTACT_FROM', 'noreply@' . (string) ($_SERVER['HTTP_HOST'] ?? 'localhost'));
$subject   = cfg('CONTACT_SUBJECT', 'Website enquiry');
$logDir    = cfg('CONTACT_LOG_DIR', dirname((string) ($_SERVER['DOCUMENT_ROOT'] ?? __DIR__)));
$rateMax   = (int) cfg('CONTACT_RATE_MAX', '10');
$originCsv = cfg('CONTACT_ORIGINS');

// Size cap before reading anything into memory.
$declared = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($declared > MAX_BODY_BYTES) {
    respond(413, ['ok' => false, 'error' => 'Message too large.']);
}

// Same-origin only. Absent Origin AND Referer is treated as suspicious;
// browsers send at least one on a real fetch or form post.
if ($originCsv !== '') {
    $allowed = array_filter(array_map('trim', explode(',', $originCsv)));
    $seen    = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($seen === '' && !empty($_SERVER['HTTP_REFERER'])) {
        $parts = parse_url((string) $_SERVER['HTTP_REFERER']);
        if (!empty($parts['scheme']) && !empty($parts['host'])) {
            $seen = $parts['scheme'] . '://' . $parts['host'];
        }
    }
    if ($seen === '' || !in_array($seen, $allowed, true)) {
        silentAccept();
    }
}

$body = (string) file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
if (strlen($body) > MAX_BODY_BYTES) {
    respond(413, ['ok' => false, 'error' => 'Message too large.']);
}

$raw  = null;
$type = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));

if (strpos($type, 'application/json') !== false || (isset($body[0]) && $body[0] === '{')) {
    $decoded = json_decode($body, true);
    if (is_array($decoded)) {
        $raw = $decoded;
    }
}
if ($raw === null && $body !== '') {
    parse_str($body, $parsed);
    if (is_array($parsed) && $parsed !== []) {
        $raw = $parsed;
    }
}
if ($raw === null && !empty($_POST)) {
    $raw = $_POST;
}
if (!is_array($raw) || $raw === []) {
    respond(400, ['ok' => false, 'error' => 'Empty or unreadable submission.']);
}

$fields = normalizeFields($raw);

// Honeypot: any of these filled means a bot walked the DOM.
foreach (['_gotcha', '_honey', 'website_url', 'url_field'] as $trap) {
    if (pick($fields, [$trap]) !== '') {
        silentAccept();
    }
}

// Submit-timing floor. Client may send _t as epoch milliseconds at render.
$rendered = (float) pick($fields, ['_t', '_rendered_at']);
if ($rendered > 0) {
    $elapsed = (microtime(true) * 1000.0) - $rendered;
    if ($elapsed >= 0 && $elapsed < MIN_SUBMIT_MS) {
        silentAccept();
    }
}

$email = pick($fields, ['email', 'e-mail', 'from', 'replyto', 'reply_to', 'contact_email']);
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(422, ['ok' => false, 'error' => 'A valid email address is required.']);
}

$message = pick($fields, [
    'requirements',   // the live form's textarea
    'message', 'details', 'project', 'description', 'body', 'notes', 'comments',
]);
$content = trim(implode(' ', array_map('strval', $fields)));
if ($message === '' && strlen($content) < 3) {
    respond(422, ['ok' => false, 'error' => 'Please include a message.']);
}

$ip = clientIp();
if (rateLimited($logDir, $ip, $rateMax)) {
    respond(429, ['ok' => false, 'error' => 'Too many submissions. Please try again later.']);
}

// ------------------------------------------------------- durable log first

$name = pick($fields, ['name', 'full_name', 'fullname', 'contact_name', 'studio', 'company']);

$record = [
    'at'         => gmdate('c'),
    'ip'         => $ip,
    'user_agent' => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300),
    'fields'     => $fields,
];

$logPath  = rtrim($logDir, '/') . '/contact-submissions.log';
$logged   = false;
$logLine  = json_encode($record, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if ($logLine !== false) {
    $logged = @file_put_contents($logPath, $logLine . "\n", FILE_APPEND | LOCK_EX) !== false;
}

// ------------------------------------------------------------------- email

$mailSent = false;
$mailNote = 'not attempted';

if ($to === '') {
    $mailNote = 'CONTACT_TO not configured';
} else {
    $lines = [];
    foreach ($fields as $k => $v) {
        if ($k === '' || $k[0] === '_') {
            continue; // internal fields
        }
        $lines[] = $k . ': ' . $v;
    }
    $lines[] = '';
    $lines[] = '--';
    $lines[] = 'Received: ' . gmdate('c');
    $lines[] = 'IP: ' . $ip;
    $lines[] = 'Logged: ' . ($logged ? $logPath : 'FAILED');

    $game  = pick($fields, ['game', 'game_title', 'title']);
    $suffix = '';
    if ($name !== '' && $game !== '') {
        $suffix = ' - ' . $name . ' (' . $game . ')';
    } elseif ($name !== '' || $game !== '') {
        $suffix = ' - ' . ($name !== '' ? $name : $game);
    }
    $subjectLine = headerSafe($subject . $suffix);

    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'From: ' . headerSafe($from),
        'Reply-To: ' . headerSafe($email),
        'X-Mailer: ngplustrailers-contact/1.0',
    ];

    $mailSent = @mail(
        headerSafe($to),
        $subjectLine,
        implode("\n", $lines),
        implode("\r\n", $headers),
        '-f' . headerSafe($from)
    );
    $mailNote = $mailSent ? 'sent' : 'mail() returned false';
}

// The submission is safe if EITHER path worked. Only both failing is an error
// the visitor needs to see, because only then is their message actually gone.
if (!$logged && !$mailSent) {
    respond(500, ['ok' => false, 'error' => 'Could not record your message. Please email us directly.']);
}

if (!$mailSent) {
    error_log('[contact.php] mail not sent: ' . $mailNote . ' (submission logged to ' . $logPath . ')');
}

respond(200, ['ok' => true], ['X-Mail-Status: ' . ($mailSent ? 'sent' : 'logged-only')]);
