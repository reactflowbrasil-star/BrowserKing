const http = require('http');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.BROWSERKING_REMOTE_PORT || 17840);
const CONFIG_PATH = path.join(__dirname, '.browserking-remote.json');

function loadConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (parsed.token) return parsed;
  } catch (_) {}
  const config = { token: crypto.randomBytes(9).toString('base64url') };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
  return config;
}

const config = loadConfig();
let nextCommandId = 1;
let nextEventId = 1;
const commands = [];
const events = [];
const waiters = { extension: new Set(), android: new Set() };
let extensionLastSeen = 0;
let capabilities = { tools: false, skills: false, plugins: false, apps: false, updatedAt: 0 };
let tabsSnapshot = [];
let tabsUpdatedAt = 0;

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 256000) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (_) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function normalizeAttachments(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const base64Data = String(item.base64Data || '').trim();
      const mimeType = String(item.mimeType || 'image/jpeg').trim();
      if (!base64Data) return null;
      return {
        type: 'image',
        fileName: String(item.fileName || 'telegram-image.jpg').trim(),
        mimeType,
        base64Data,
        bytes: Number(item.bytes || 0) || undefined
      };
    })
    .filter(Boolean);
}

function authorized(req) {
  return req.headers.authorization === `Bearer ${config.token}`;
}

function isLoopback(req) {
  const address = req.socket.remoteAddress || '';
  return address === '127.0.0.1' || address === '::1' || address.endsWith('::ffff:127.0.0.1');
}

function flush(kind) {
  for (const wake of waiters[kind]) wake();
  waiters[kind].clear();
}

function longPoll(kind, list, since, res) {
  const send = () => {
    const items = list.filter(item => item.id > since);
    if (!items.length) return false;
    json(res, 200, { items });
    return true;
  };
  if (send()) return;
  let finished = false;
  const wake = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    if (!send()) json(res, 200, { items: [] });
  };
  waiters[kind].add(wake);
  const timer = setTimeout(wake, 25000);
  res.on('close', () => {
    finished = true;
    clearTimeout(timer);
    waiters[kind].delete(wake);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    if (!authorized(req)) return json(res, 401, { error: 'Invalid pairing token' });
    return json(res, 200, { ok: true, extensionOnline: Date.now() - extensionLastSeen < 35000 });
  }
  if (req.method === 'GET' && url.pathname === '/extension/bootstrap') {
    if (!isLoopback(req)) return json(res, 403, { error: 'Loopback only' });
    extensionLastSeen = Date.now();
    return json(res, 200, { token: config.token, commandCursor: nextCommandId - 1 });
  }
  if (!authorized(req)) return json(res, 401, { error: 'Invalid pairing token' });

  try {
    if (req.method === 'GET' && url.pathname === '/android/status') {
      return json(res, 200, { ok: true, extensionOnline: Date.now() - extensionLastSeen < 35000, eventCursor: nextEventId - 1, capabilities, tabs: tabsSnapshot, tabsUpdatedAt });
    }
    if (req.method === 'GET' && url.pathname === '/extension/poll') {
      extensionLastSeen = Date.now();
      return longPoll('extension', commands, Number(url.searchParams.get('since') || 0), res);
    }
    if (req.method === 'POST' && url.pathname === '/extension/event') {
      extensionLastSeen = Date.now();
      const payload = await readBody(req);
      if (payload.type === 'tabs_snapshot' && Array.isArray(payload.tabs)) {
        tabsSnapshot = payload.tabs;
        tabsUpdatedAt = Date.now();
      }
      events.push({ id: nextEventId++, timestamp: Date.now(), ...payload });
      while (events.length > 100) events.shift();
      flush('android');
      return json(res, 202, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/extension/capabilities') {
      extensionLastSeen = Date.now();
      const payload = await readBody(req);
      capabilities = {
        tools: payload.tools === true,
        skills: payload.skills === true,
        plugins: payload.plugins === true,
        apps: payload.apps === true,
        providers: Number(payload.providers || 0),
        updatedAt: Date.now()
      };
      return json(res, 202, { ok: true, capabilities });
    }
    if (req.method === 'POST' && url.pathname === '/android/command') {
      const payload = await readBody(req);
      const text = String(payload.text || '').trim();
      if (!text) return json(res, 400, { error: 'Command text is required' });
      const command = {
        id: nextCommandId++, type: 'prompt', text, timestamp: Date.now(),
        approvalMode: payload.approvalMode === 'ask' ? 'ask' : 'auto'
      };
      const attachments = normalizeAttachments(payload.attachments);
      if (attachments.length > 0) {
        command.attachments = attachments;
      }
      commands.push(command);
      while (commands.length > 100) commands.shift();
      flush('extension');
      return json(res, 202, { ok: true, commandId: command.id });
    }
    if (req.method === 'POST' && url.pathname === '/android/tab/activate') {
      const payload = await readBody(req);
      const tabId = Number(payload.tabId);
      if (!Number.isInteger(tabId) || tabId < 0) return json(res, 400, { error: 'Valid tabId is required' });
      const command = { id: nextCommandId++, type: 'activate_tab', tabId, timestamp: Date.now() };
      commands.push(command);
      while (commands.length > 100) commands.shift();
      flush('extension');
      return json(res, 202, { ok: true, commandId: command.id });
    }
    if (req.method === 'GET' && url.pathname === '/android/events') {
      return longPoll('android', events, Number(url.searchParams.get('since') || 0), res);
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
});

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter(Boolean)
    .filter(entry => entry.family === 'IPv4' && !entry.internal)
    .map(entry => entry.address);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nHatClaw Remote Relay');
  console.log(`Token: ${config.token}`);
  console.log(`Porta: ${PORT}`);
  lanAddresses().forEach(address => console.log(`Android: http://${address}:${PORT}`));
  console.log('\nMantenha esta janela aberta enquanto usar o app.\n');
});
