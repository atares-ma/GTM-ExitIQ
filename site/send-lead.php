<?php
/**
 * ExitIQ lead notification - Strato shared hosting endpoint.
 *
 * Upload to the same domain that serves ExitIQ, e.g.
 *   https://exitiq.globaltechmergers.com/send-lead.php
 * then set LEAD_ENDPOINT in "ExitIQ GTM.dc.html" to that URL.
 *
 * Requires nothing beyond PHP, which Strato hosting packages include.
 * Credentials never touch the browser: mail() relays through Strato's
 * own MTA, so the From address only has to be a mailbox on this domain.
 */

declare(strict_types=1);

const FALLBACK_RECIPIENT = 'contact@globaltechmergers.com';
// Per-partner routing. Keys match the ExitIQ partner dropdown; fill in the real
// addresses. Anything unknown or empty falls back to GTM central.
const PARTNER_RECIPIENTS = [
    'absolvo'    => '',                             // Hungary
    'atares'     => 'exitiq@atares.team',           // Germany
    'ceres'      => '',                             // Sweden
    'venture'    => '',                             // United Kingdom
    'whitecrown' => '',                             // France
    'any'        => 'contact@globaltechmergers.com',
];
// Must be a real mailbox on the sending domain, or Strato/SPF will reject it.
const SENDER    = 'noreply@globaltechmergers.com';
const SENDER_NAME = 'ExitIQ';

// Restrict to the domain that serves the tool.
const ALLOWED_ORIGINS = [
    'https://globaltechmergers.com',
    'https://www.globaltechmergers.com',
    'https://exitiq.globaltechmergers.com',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

$raw = file_get_contents('php://input') ?: '';
if (strlen($raw) > 20000) {
    http_response_code(413);
    echo json_encode(['error' => 'payload too large']);
    exit;
}

$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid json']);
    exit;
}

/** Single-line, header-injection-safe field. */
function field(array $d, string $key, int $max = 200): string
{
    $v = isset($d[$key]) ? (string) $d[$key] : '';
    $v = str_replace(["\r", "\n", "\0"], ' ', $v);
    $v = trim(preg_replace('/\s+/', ' ', $v) ?? '');
    return mb_substr($v, 0, $max);
}

$name  = field($data, 'name');
$email = field($data, 'email');

if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['error' => 'name and a valid email are required']);
    exit;
}

$rows = [
    'Name'                    => $name,
    'Email'                   => $email,
    'Company'                 => field($data, 'company'),
    'Sector'                  => field($data, 'sector'),
    'Country'                 => field($data, 'country'),
    'Revenue'                 => field($data, 'revenue'),
    'Exit readiness'          => field($data, 'exitReadiness', 8) . '/100',
    'Value creation potential'=> field($data, 'valuePotential', 8) . '/100',
    'Zone'                    => field($data, 'zone'),
    'Submitted'               => field($data, 'submittedAt', 40),
];

// The emailed notification lists only who completed the assessment - not the
// scored result (that stays on the respondent's screen). $rows keeps the full
// set, including scores, for the local audit log below.
$notifyLabels = ['Name', 'Email', 'Company', 'Sector', 'Country', 'Revenue', 'Submitted'];
$lines = ['New ExitIQ lead: someone completed the self-assessment and left their contact details.', ''];
foreach ($notifyLabels as $label) {
    $value = $rows[$label] ?? '';
    $lines[] = str_pad($label . ':', 26) . ($value === '' ? '-' : $value);
}
$lines[] = '';
$lines[] = 'Source IP: ' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
$lines[] = 'This is a notification only. The assessment result was shown to the respondent';
$lines[] = 'on screen and is not included here. Reply directly to this email to reach them.';
$body = implode("\n", $lines);

$partnerKey = field($data, 'partnerKey', 40);
$recipient  = PARTNER_RECIPIENTS[$partnerKey] ?? '';
if ($recipient === '' || !filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
    $recipient = FALLBACK_RECIPIENT;
}

$company = $rows['Company'] !== '' ? $rows['Company'] : 'new lead';
// The client sends a ready-made subject/body for introduction requests.
$clientSubject = field($data, 'subject', 200);
$clientBody    = isset($data['message']) ? (string) $data['message'] : '';
$subject = $clientSubject !== '' ? $clientSubject : sprintf('New ExitIQ lead - %s (%s)', $company, $name);
if (trim($clientBody) !== '') {
    $body = str_replace(["\0"], '', mb_substr($clientBody, 0, 8000));
}

$headers = [
    'From'         => sprintf('%s <%s>', SENDER_NAME, SENDER),
    'Reply-To'     => sprintf('%s <%s>', $name, $email),
    'MIME-Version' => '1.0',
    'Content-Type' => 'text/plain; charset=UTF-8',
    'X-Mailer'     => 'ExitIQ',
];
$headerLines = [];
foreach ($headers as $k => $v) {
    $headerLines[] = $k . ': ' . $v;
}

$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$ok = mail($recipient, $encodedSubject, $body, implode("\r\n", $headerLines), '-f' . SENDER);

// Local audit trail, in case a mail is ever lost.
@file_put_contents(
    __DIR__ . '/leads.log',
    date('c') . ' ' . ($ok ? 'SENT' : 'FAIL') . ' -> ' . $recipient . ' ' . json_encode($rows, JSON_UNESCAPED_UNICODE) . "\n",
    FILE_APPEND | LOCK_EX
);

if (!$ok) {
    http_response_code(502);
    echo json_encode(['error' => 'mail relay failed']);
    exit;
}

echo json_encode(['ok' => true]);
