const NATIVE_HOST = 'com.browserking.windows_controller';

let port = null;
const pending = new Map();

function connect() {
  if (port) return port;
  port = chrome.runtime.connectNative(NATIVE_HOST);
  port.onMessage.addListener(message => {
    const waiter = pending.get(message?.requestId);
    if (!waiter) return;
    pending.delete(message.requestId);
    message.ok ? waiter.resolve(message) : waiter.reject(new Error(message.error || 'Native action failed'));
  });
  port.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message || 'Windows controller disconnected';
    for (const waiter of pending.values()) waiter.reject(new Error(reason));
    pending.clear();
    port = null;
  });
  return port;
}

function invoke(action, params = {}) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    pending.set(requestId, { resolve, reject });
    try { connect().postMessage({ requestId, action, params }); }
    catch (error) { pending.delete(requestId); reject(error); }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== 'browserking-windows') return false;
  // Only extension-owned pages and the bundled HatClaw UI may call the bridge.
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: 'Untrusted sender' });
    return false;
  }
  invoke(message.action, message.params).then(sendResponse).catch(error => {
    sendResponse({ ok: false, error: error.message });
  });
  return true;
});
