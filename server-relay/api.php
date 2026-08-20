<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$config = require dirname(__DIR__, 4) . '/browserking-relay-config.php';
$token = (string)($config['token'] ?? '');
$dataDir = __DIR__ . '/data';
$stateFile = $dataDir . '/state.json';
if (!is_dir($dataDir)) mkdir($dataDir, 0700, true);

function reply(int $status, array $payload): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function authorization(): string {
    $value = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($value === '' && function_exists('getallheaders')) {
        $headers = getallheaders();
        $value = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }
    return (string)$value;
}

function adminAuthorized(): bool {
    $user = (string)($_SERVER['PHP_AUTH_USER'] ?? '');
    $password = (string)($_SERVER['PHP_AUTH_PW'] ?? '');
    if ($user === '' && preg_match('/^(?:Basic|Bearer)\s+(.+)$/i', authorization(), $match)) {
        $decoded = base64_decode($match[1], true);
        if (is_string($decoded) && str_contains($decoded, ':')) [$user, $password] = explode(':', $decoded, 2);
        elseif (str_contains($match[1], ':')) [$user, $password] = explode(':', $match[1], 2);
    }
    return hash_equals('reactfly', $user) && password_verify($password, '$2y$10$.thp9r3ks/oJaPJOcGXwfelG4PJBDq8aRtzwLAKboHvdoKyJ/A8sS');
}

function route(): string {
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $marker = '/extencao/';
    $position = strpos($uri, $marker);
    return trim($position === false ? $uri : substr($uri, $position + strlen($marker)), '/');
}

function defaultState(): array {
    return ['nextCommandId' => 1, 'nextEventId' => 1, 'commands' => [], 'events' => [], 'extensionLastSeen' => 0,
        'capabilities' => ['tools' => false, 'skills' => false, 'plugins' => false, 'apps' => false, 'updatedAt' => 0],
        'tabs' => [], 'tabsUpdatedAt' => 0, 'androidDeviceId' => '',
        'nextLicenseId' => 1, 'nextActivationId' => 1, 'nextDeviceId' => 1,
        'licenses' => [], 'activationCodes' => [], 'devices' => [], 'auditLogs' => [],
        'graphify' => ['revision' => 0, 'updatedAt' => 0, 'devices' => [], 'state' => null]];
}

function licenseCode(): string {
    $bytes = random_bytes(10);
    $raw = strtoupper(substr(bin2hex($bytes), 0, 16));
    return implode('-', str_split($raw, 4));
}

function codeHash(string $code): string { return hash('sha256', strtoupper(trim($code))); }

function audit(array &$state, string $action, array $metadata = []): void {
    $state['auditLogs'][] = ['timestamp' => (int)(microtime(true) * 1000), 'action' => $action, 'metadata' => $metadata];
    $state['auditLogs'] = array_slice($state['auditLogs'], -500);
}

function stateRead(string $file): array {
    if (!is_file($file)) return defaultState();
    $handle = fopen($file, 'rb');
    if (!$handle) return defaultState();
    flock($handle, LOCK_SH);
    $raw = stream_get_contents($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    $decoded = json_decode($raw ?: '', true);
    return is_array($decoded) ? array_merge(defaultState(), $decoded) : defaultState();
}

function stateMutate(string $file, callable $mutator): array {
    $handle = fopen($file, 'c+');
    if (!$handle) reply(500, ['error' => 'State unavailable']);
    flock($handle, LOCK_EX);
    rewind($handle);
    $decoded = json_decode(stream_get_contents($handle) ?: '', true);
    $state = is_array($decoded) ? array_merge(defaultState(), $decoded) : defaultState();
    $result = $mutator($state);
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    return $result;
}

function body(): array {
    $decoded = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($decoded)) reply(400, ['error' => 'Invalid JSON']);
    return $decoded;
}

function normalizeAttachments(array $payload): array {
    $attachments = $payload['attachments'] ?? [];
    if (!is_array($attachments)) return [];
    $result = [];
    foreach ($attachments as $item) {
        if (!is_array($item)) continue;
        $base64Data = trim((string)($item['base64Data'] ?? ''));
        if ($base64Data === '') continue;
        $result[] = [
            'type' => 'image',
            'fileName' => trim((string)($item['fileName'] ?? 'telegram-image.jpg')),
            'mimeType' => trim((string)($item['mimeType'] ?? 'image/jpeg')),
            'base64Data' => $base64Data,
            'bytes' => (int)($item['bytes'] ?? 0) ?: null,
        ];
    }
    return $result;
}

function graphRecords(array $left, array $right, string $counter): array {
    $records = [];
    foreach (array_merge($left, $right) as $item) {
        if (!is_array($item) || !isset($item['id']) || !is_string($item['id']) || $item['id'] === '') continue;
        $id = substr($item['id'], 0, 240);
        $item['id'] = $id;
        if (!isset($records[$id])) { $records[$id] = $item; continue; }
        $existing = $records[$id];
        $newer = (int)($item['updatedAt'] ?? 0) >= (int)($existing['updatedAt'] ?? 0) ? $item : $existing;
        $older = $newer === $item ? $existing : $item;
        $merged = array_merge($older, $newer);
        $merged[$counter] = max(1, (int)($existing[$counter] ?? 1), (int)($item[$counter] ?? 1));
        $merged['createdAt'] = min((int)($existing['createdAt'] ?? time() * 1000), (int)($item['createdAt'] ?? time() * 1000));
        $records[$id] = $merged;
    }
    return array_values($records);
}

function normalizeGraphState(array $state): array {
    $projects = [];
    $graphs = [];
    foreach (array_slice(is_array($state['projects'] ?? null) ? $state['projects'] : [], 0, 100) as $project) {
        if (!is_array($project) || !is_string($project['id'] ?? null) || trim($project['id']) === '') continue;
        $id = substr($project['id'], 0, 160);
        if ($id === 'route-test') continue;
        $projects[] = ['id' => $id, 'name' => substr(trim((string)($project['name'] ?? 'Projeto importado')), 0, 80),
            'createdAt' => (int)($project['createdAt'] ?? time() * 1000), 'updatedAt' => (int)($project['updatedAt'] ?? time() * 1000)];
        $raw = is_array($state['graphs'][$id] ?? null) ? $state['graphs'][$id] : [];
        $nodes = array_slice(is_array($raw['nodes'] ?? null) ? $raw['nodes'] : [], -500);
        $validNodes = [];
        $nodeIds = [];
        foreach ($nodes as $node) {
            if (!is_array($node) || !is_string($node['id'] ?? null) || $node['id'] === '') continue;
            $node['id'] = substr($node['id'], 0, 240); $node['projectId'] = $id;
            if (isset($node['text'])) $node['text'] = substr((string)$node['text'], 0, 4000);
            $validNodes[] = $node; $nodeIds[$node['id']] = true;
        }
        $validEdges = [];
        foreach (array_slice(is_array($raw['edges'] ?? null) ? $raw['edges'] : [], -1200) as $edge) {
            if (!is_array($edge) || !isset($nodeIds[$edge['source'] ?? ''], $nodeIds[$edge['target'] ?? ''])) continue;
            $edge['id'] = substr((string)($edge['id'] ?? hash('sha256', ($edge['source'] ?? '') . '|' . ($edge['relation'] ?? '') . '|' . ($edge['target'] ?? ''))), 0, 240);
            $edge['projectId'] = $id; $validEdges[] = $edge;
        }
        $graphs[$id] = ['nodes' => $validNodes, 'edges' => $validEdges];
    }
    if (!$projects) reply(400, ['error' => 'Graph state has no valid projects']);
    $active = (string)($state['activeProjectId'] ?? $projects[0]['id']);
    if (!isset($graphs[$active])) $active = $projects[0]['id'];
    return ['version' => 1, 'activeProjectId' => $active, 'projects' => $projects, 'graphs' => $graphs];
}

function mergeGraphStates(?array $left, array $right): array {
    if (!$left) return normalizeGraphState($right);
    $left = normalizeGraphState($left); $right = normalizeGraphState($right);
    $projects = [];
    foreach (array_merge($left['projects'], $right['projects']) as $project) $projects[$project['id']] = array_merge($projects[$project['id']] ?? [], $project);
    $merged = ['version' => 1, 'activeProjectId' => $right['activeProjectId'], 'projects' => array_values($projects), 'graphs' => []];
    foreach ($merged['projects'] as $project) {
        $id = $project['id']; $a = $left['graphs'][$id] ?? ['nodes' => [], 'edges' => []]; $b = $right['graphs'][$id] ?? ['nodes' => [], 'edges' => []];
        $nodes = array_slice(graphRecords($a['nodes'], $b['nodes'], 'count'), -500);
        $nodeIds = array_fill_keys(array_column($nodes, 'id'), true);
        $edges = array_values(array_filter(graphRecords($a['edges'], $b['edges'], 'weight'), fn($edge) => isset($nodeIds[$edge['source']], $nodeIds[$edge['target']])));
        $merged['graphs'][$id] = ['nodes' => $nodes, 'edges' => array_slice($edges, -1200)];
    }
    return $merged;
}

function poll(string $file, string $key, int $since): never {
    $deadline = microtime(true) + 20;
    do {
        $state = stateRead($file);
        $items = array_values(array_filter($state[$key], fn($item) => (int)$item['id'] > $since));
        if ($items) reply(200, ['items' => $items]);
        usleep(100000);
    } while (microtime(true) < $deadline);
    reply(200, ['items' => []]);
}

$route = route();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$adminRoute = preg_match('#^(admin/|licenses$|licenses/[^/]+/activation-codes$)#', $route) === 1;
if ($adminRoute) {
    if (!adminAuthorized()) { header('WWW-Authenticate: Basic realm="HatClaw Admin"'); reply(401, ['error' => 'Admin authentication required']); }
} elseif ($route !== 'extension/device-heartbeat' && ($token === '' || !hash_equals('Bearer ' . $token, authorization()))) {
    reply(401, ['error' => 'Invalid pairing token']);
}

if ($method === 'GET' && $route === 'health') {
    $state = stateRead($stateFile);
    reply(200, ['ok' => true, 'extensionOnline' => (time() - (int)$state['extensionLastSeen']) < 35]);
}
if ($method === 'GET' && $route === 'extension/bootstrap') {
    $result = stateMutate($stateFile, function (&$state) {
        $state['extensionLastSeen'] = time();
        if (($payload['type'] ?? '') === 'tabs_snapshot' && is_array($payload['tabs'] ?? null)) {
            $state['tabs'] = array_values($payload['tabs']);
            $state['tabsUpdatedAt'] = (int)(microtime(true) * 1000);
        }
        return ['token' => null, 'commandCursor' => (int)$state['nextCommandId'] - 1];
    });
    reply(200, $result);
}
if ($method === 'GET' && $route === 'extension/poll') {
    stateMutate($stateFile, function (&$state) { $state['extensionLastSeen'] = time(); return []; });
    poll($stateFile, 'commands', (int)($_GET['since'] ?? 0));
}
if ($method === 'POST' && $route === 'extension/event') {
    $payload = body();
    stateMutate($stateFile, function (&$state) use ($payload) {
        $state['extensionLastSeen'] = time();
        $payload['id'] = $state['nextEventId']++;
        $payload['timestamp'] = (int)(microtime(true) * 1000);
        $state['events'][] = $payload;
        $state['events'] = array_slice($state['events'], -100);
        return [];
    });
    reply(202, ['ok' => true]);
}
if ($method === 'POST' && $route === 'extension/device-heartbeat') {
    $payload = body(); $deviceId = substr(trim((string)($payload['deviceId'] ?? '')), 0, 160);
    if ($deviceId === '') reply(400, ['error' => 'deviceId is required']);
    stateMutate($stateFile, function (&$state) use ($payload, $deviceId) {
        $existing = $state['devices'][$deviceId] ?? ['id' => $deviceId, 'licenseId' => null, 'status' => 'DETECTED', 'activatedAt' => null];
        $state['devices'][$deviceId] = array_merge($existing, ['deviceId' => $deviceId, 'extensionVersion' => substr((string)($payload['extensionVersion'] ?? ''), 0, 40), 'lastSeenAt' => (int)(microtime(true) * 1000), 'userAgent' => substr((string)($payload['userAgent'] ?? ''), 0, 240)]);
        $state['extensionLastSeen'] = time();
        audit($state, 'DEVICE_HEARTBEAT', ['deviceId' => $deviceId]); return [];
    });
    reply(202, ['ok' => true, 'deviceId' => $deviceId]);
}

if ($method === 'POST' && $route === 'licenses') {
    $payload = body();
    $result = stateMutate($stateFile, function (&$state) use ($payload) {
        $id = 'lic_' . $state['nextLicenseId']++;
        $license = ['id' => $id, 'customerId' => substr(trim((string)($payload['customerId'] ?? '')), 0, 160),
            'plan' => substr(trim((string)($payload['plan'] ?? 'basic')), 0, 40), 'status' => 'ACTIVE',
            'expiresAt' => (int)($payload['expiresAt'] ?? (time() + 30 * 86400) * 1000),
            'deviceLimit' => max(1, min(100, (int)($payload['deviceLimit'] ?? 1))), 'createdAt' => (int)(microtime(true) * 1000), 'updatedAt' => (int)(microtime(true) * 1000)];
        $state['licenses'][$id] = $license;
        foreach ((array)($payload['deviceIds'] ?? []) as $deviceId) {
            $deviceId = (string)$deviceId;
            if (isset($state['devices'][$deviceId])) {
                $state['devices'][$deviceId]['licenseId'] = $id;
                $state['devices'][$deviceId]['status'] = 'ACTIVE';
                $state['devices'][$deviceId]['activatedAt'] = $state['devices'][$deviceId]['activatedAt'] ?? (int)(microtime(true) * 1000);
            }
        }
        audit($state, 'LICENSE_CREATED', ['licenseId' => $id, 'deviceIds' => array_values((array)($payload['deviceIds'] ?? []))]);
        return $license;
    });
    reply(201, ['license' => $result]);
}

if ($method === 'GET' && $route === 'admin/licenses') {
    $state = stateRead($stateFile); reply(200, ['licenses' => array_values($state['licenses']), 'activationCodes' => array_values($state['activationCodes'])]);
}
if ($method === 'GET' && $route === 'admin/customers') {
    $state = stateRead($stateFile); $customers = [];
    foreach ($state['licenses'] as $license) { $id = $license['customerId'] ?: 'sem-cliente'; $customers[$id] = ['customerId' => $id, 'licenses' => ($customers[$id]['licenses'] ?? 0) + 1, 'lastStatus' => $license['status']]; }
    reply(200, ['customers' => array_values($customers)]);
}
if ($method === 'GET' && $route === 'admin/devices') {
    $state = stateRead($stateFile); $now = (int)(microtime(true) * 1000); $devices = array_map(function ($device) use ($now) { $device['online'] = ($now - (int)($device['lastSeenAt'] ?? 0)) < 90000; return $device; }, array_values($state['devices'])); reply(200, ['devices' => $devices]);
}
if ($method === 'GET' && $route === 'admin/audit-logs') {
    $state = stateRead($stateFile); reply(200, ['auditLogs' => array_reverse($state['auditLogs'])]);
}
if ($method === 'POST' && preg_match('#^admin/licenses/([^/]+)/action$#', $route, $match)) {
    $payload = body(); $licenseId = $match[1]; $action = strtoupper((string)($payload['action'] ?? ''));
    if (!in_array($action, ['SUSPEND', 'REACTIVATE', 'REVOKE', 'RENEW'], true)) reply(400, ['error' => 'Unsupported action']);
    $result = stateMutate($stateFile, function (&$state) use ($licenseId, $action, $payload) {
        if (!isset($state['licenses'][$licenseId])) reply(404, ['error' => 'License not found']);
        $license =& $state['licenses'][$licenseId];
        if ($action === 'SUSPEND') $license['status'] = 'SUSPENDED';
        if ($action === 'REACTIVATE') $license['status'] = 'ACTIVE';
        if ($action === 'REVOKE') $license['status'] = 'REVOKED';
        if ($action === 'RENEW') $license['expiresAt'] = (int)($payload['expiresAt'] ?? ((int)$license['expiresAt'] + 30 * 86400000));
        $license['updatedAt'] = (int)(microtime(true) * 1000); audit($state, 'LICENSE_' . $action, ['licenseId' => $licenseId]); return $license;
    });
    reply(200, ['license' => $result]);
}
if ($method === 'POST' && preg_match('#^admin/devices/([^/]+)/action$#', $route, $match)) {
    $payload = body(); $deviceId = $match[1]; $action = strtoupper((string)($payload['action'] ?? ''));
    if (!in_array($action, ['BLOCK', 'UNBLOCK', 'REVOKE', 'GENERATE_TOKEN'], true)) reply(400, ['error' => 'Unsupported action']);
    $result = stateMutate($stateFile, function (&$state) use ($deviceId, $action) {
        if (!isset($state['devices'][$deviceId])) reply(404, ['error' => 'Device not found']);
        if ($action === 'GENERATE_TOKEN') {
            $token = bin2hex(random_bytes(32));
            $state['devices'][$deviceId]['installationTokenHash'] = hash('sha256', $token);
            $state['devices'][$deviceId]['tokenIssuedAt'] = (int)(microtime(true) * 1000);
            audit($state, 'INSTALLATION_TOKEN_GENERATED', ['deviceId' => $deviceId]);
            return ['device' => $state['devices'][$deviceId], 'installationToken' => $token];
        }
        $state['devices'][$deviceId]['status'] = $action === 'BLOCK' ? 'BLOCKED' : ($action === 'UNBLOCK' ? 'ACTIVE' : 'REVOKED');
        audit($state, 'DEVICE_' . $action, ['deviceId' => $deviceId]); return $state['devices'][$deviceId];
    });
    reply(200, ['device' => $result]);
}

if ($method === 'POST' && preg_match('#^licenses/([^/]+)/activation-codes$#', $route, $match)) {
    $licenseId = $match[1];
    $result = stateMutate($stateFile, function (&$state) use ($licenseId) {
        $license = $state['licenses'][$licenseId] ?? null;
        if (!$license) reply(404, ['error' => 'License not found']);
        $code = licenseCode(); $id = 'act_' . $state['nextActivationId']++;
        $state['activationCodes'][$id] = ['id' => $id, 'licenseId' => $licenseId, 'codeHash' => codeHash($code), 'status' => 'ACTIVE', 'expiresAt' => $license['expiresAt'], 'usedAt' => null, 'createdAt' => (int)(microtime(true) * 1000)];
        audit($state, 'ACTIVATION_CODE_CREATED', ['licenseId' => $licenseId, 'activationId' => $id]);
        return ['id' => $id, 'code' => $code, 'expiresAt' => $license['expiresAt']];
    });
    reply(201, $result);
}

if ($method === 'POST' && $route === 'licenses/activate') {
    $payload = body(); $code = (string)($payload['code'] ?? ''); $deviceId = substr(trim((string)($payload['deviceId'] ?? '')), 0, 160);
    if ($code === '' || $deviceId === '') reply(400, ['error' => 'code and deviceId are required']);
    $result = stateMutate($stateFile, function (&$state) use ($code, $deviceId, $payload) {
        foreach ($state['activationCodes'] as $id => &$activation) {
            if ($activation['status'] !== 'ACTIVE' || !hash_equals($activation['codeHash'], codeHash($code))) continue;
            $license = $state['licenses'][$activation['licenseId']] ?? null;
            if (!$license || $license['status'] !== 'ACTIVE' || (int)$license['expiresAt'] < (int)(microtime(true) * 1000)) reply(403, ['error' => 'License expired or inactive']);
            $activeDevices = array_filter($state['devices'], fn($device) => $device['licenseId'] === $license['id'] && $device['status'] === 'ACTIVE');
            $existing = $state['devices'][$deviceId] ?? null;
            if (!$existing && count($activeDevices) >= $license['deviceLimit']) reply(409, ['error' => 'Device limit exceeded']);
            $state['devices'][$deviceId] = ['id' => $deviceId, 'licenseId' => $license['id'], 'extensionVersion' => substr((string)($payload['extensionVersion'] ?? ''), 0, 40), 'status' => 'ACTIVE', 'activatedAt' => $existing['activatedAt'] ?? (int)(microtime(true) * 1000), 'lastSeenAt' => (int)(microtime(true) * 1000)];
            $activation['status'] = 'USED'; $activation['usedAt'] = (int)(microtime(true) * 1000); audit($state, 'ACTIVATION_CODE_USED', ['licenseId' => $license['id'], 'deviceId' => $deviceId]);
            return ['license' => $license, 'device' => $state['devices'][$deviceId], 'installationToken' => bin2hex(random_bytes(32))];
        }
        reply(403, ['error' => 'Invalid activation code']);
    });
    reply(200, $result);
}

if ($method === 'POST' && $route === 'licenses/validate') {
    $payload = body(); $deviceId = (string)($payload['deviceId'] ?? ''); $device = $state = stateRead($stateFile)['devices'][$deviceId] ?? null;
    if (!$device) reply(404, ['valid' => false, 'error' => 'Device not registered']);
    $state = stateRead($stateFile); $license = $state['licenses'][$device['licenseId']] ?? null;
    $valid = $license && $device['status'] === 'ACTIVE' && $license['status'] === 'ACTIVE' && (int)$license['expiresAt'] >= (int)(microtime(true) * 1000);
    reply(200, ['valid' => (bool)$valid, 'license' => $license, 'device' => $device]);
}
if ($method === 'POST' && $route === 'extension/capabilities') {
    $payload = body();
    $capabilities = stateMutate($stateFile, function (&$state) use ($payload) {
        $state['extensionLastSeen'] = time();
        $state['capabilities'] = [
            'tools' => ($payload['tools'] ?? false) === true,
            'skills' => ($payload['skills'] ?? false) === true,
            'plugins' => ($payload['plugins'] ?? false) === true,
            'apps' => ($payload['apps'] ?? false) === true,
            'providers' => (int)($payload['providers'] ?? 0),
            'updatedAt' => (int)(microtime(true) * 1000),
        ];
        return $state['capabilities'];
    });
    reply(202, ['ok' => true, 'capabilities' => $capabilities]);
}
if ($method === 'POST' && $route === 'graph/sync') {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 4000000) reply(413, ['error' => 'Graph payload too large']);
    $payload = body();
    if (!is_array($payload['state'] ?? null)) reply(400, ['error' => 'Graph state is required']);
    $deviceId = substr(trim((string)($payload['deviceId'] ?? 'unknown')), 0, 160);
    $result = stateMutate($stateFile, function (&$state) use ($payload, $deviceId) {
        $current = is_array($state['graphify'] ?? null) ? $state['graphify'] : defaultState()['graphify'];
        $current['state'] = mergeGraphStates(is_array($current['state'] ?? null) ? $current['state'] : null, $payload['state']);
        $current['revision'] = (int)($current['revision'] ?? 0) + 1;
        $current['updatedAt'] = (int)(microtime(true) * 1000);
        $current['devices'][$deviceId] = $current['updatedAt'];
        $current['devices'] = array_slice($current['devices'], -20, null, true);
        $state['graphify'] = $current;
        return ['ok' => true, 'revision' => $current['revision'], 'updatedAt' => $current['updatedAt'], 'state' => $current['state']];
    });
    reply(200, $result);
}
if ($method === 'GET' && $route === 'android/status') {
    $deviceId = substr(trim((string)($_GET['deviceId'] ?? '')), 0, 160);
    $state = stateRead($stateFile);
    if ($deviceId === '') reply(400, ['error' => 'Android device id is required']);
    $bound = (string)($state['androidDeviceId'] ?? '');
    if ($bound !== '' && !hash_equals($bound, $deviceId)) reply(409, ['error' => 'Este token já está vinculado a outro dispositivo Android']);
    if ($bound === '') { $state['androidDeviceId'] = $deviceId; file_put_contents($stateFile, json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX); }
    reply(200, ['ok' => true, 'extensionOnline' => (time() - (int)$state['extensionLastSeen']) < 35,
        'eventCursor' => (int)$state['nextEventId'] - 1, 'capabilities' => $state['capabilities'],
        'tabs' => $state['tabs'], 'tabsUpdatedAt' => (int)$state['tabsUpdatedAt']]);
}
if ($method === 'POST' && $route === 'android/command') {
    $payload = body();
    $text = trim((string)($payload['text'] ?? ''));
    if ($text === '') reply(400, ['error' => 'Command text is required']);
    $result = stateMutate($stateFile, function (&$state) use ($text, $payload) {
        $command = ['id' => $state['nextCommandId']++, 'type' => 'prompt', 'text' => $text, 'timestamp' => (int)(microtime(true) * 1000),
            'approvalMode' => (($payload['approvalMode'] ?? '') === 'ask') ? 'ask' : 'auto'];
        $attachments = normalizeAttachments($payload);
        if ($attachments) $command['attachments'] = $attachments;
        $state['commands'][] = $command;
        $state['commands'] = array_slice($state['commands'], -100);
        return ['commandId' => $command['id']];
    });
    reply(202, ['ok' => true] + $result);
}
if ($method === 'POST' && $route === 'android/tab/activate') {
    $payload = body();
    $tabId = filter_var($payload['tabId'] ?? null, FILTER_VALIDATE_INT);
    if ($tabId === false || $tabId < 0) reply(400, ['error' => 'Valid tabId is required']);
    $result = stateMutate($stateFile, function (&$state) use ($tabId) {
        $command = ['id' => $state['nextCommandId']++, 'type' => 'activate_tab', 'tabId' => $tabId, 'timestamp' => (int)(microtime(true) * 1000)];
        $state['commands'][] = $command;
        $state['commands'] = array_slice($state['commands'], -100);
        return ['commandId' => $command['id']];
    });
    reply(202, ['ok' => true] + $result);
}
if ($method === 'GET' && $route === 'android/events') poll($stateFile, 'events', (int)($_GET['since'] ?? 0));

reply(404, ['error' => 'Not found']);
