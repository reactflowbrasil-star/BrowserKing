// Load shared provider registry and the isolated Codex router first.
import './provider-registry.js';
import './codex-smart-router.js';
// Load API adapter first to intercept fetch calls
import './api-adapter.js';
// Load auth bypass to mock profile/OAuth API calls
import './auth-bypass.js';
// Load provider config to initialize settings and bypass auth
import './provider-config.js';
// Load the original service worker
import './assets/service-worker.ts-3CRyLSDu.js';
// Secure, audited Windows native-control bridge.
import './native-controller-service.js';

// Open the side panel directly when the toolbar icon is clicked.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.action.onClicked.addListener((tab) => {
  if (tab?.windowId != null) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});

const DEVICE_HEARTBEAT_ALARM = 'hatclaw-device-heartbeat';
async function registerDeviceHeartbeat() {
  try {
    const stored = await chrome.storage.local.get('hatclawDeviceId');
    const deviceId = stored.hatclawDeviceId || `chrome-${crypto.randomUUID()}`;
    await chrome.storage.local.set({ hatclawDeviceId: deviceId });
    await fetch('https://hatclaw.com/extencao/extension/device-heartbeat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, extensionVersion: chrome.runtime.getManifest().version, userAgent: navigator.userAgent })
    });
  } catch (_) {}
}
chrome.alarms.create(DEVICE_HEARTBEAT_ALARM, { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === DEVICE_HEARTBEAT_ALARM) registerDeviceHeartbeat();
});
chrome.runtime.onInstalled.addListener(() => registerDeviceHeartbeat());
chrome.runtime.onStartup.addListener(() => registerDeviceHeartbeat());
registerDeviceHeartbeat();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'HATCLAW_HEARTBEAT') {
    registerDeviceHeartbeat();
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === 'HATCLAW_IDENTIFY_TAB') {
    sendResponse({ tabId: sender.tab?.id || null });
    return false;
  }
  return false;
});

const AUTO_REMOTE_ALARM = 'browserking-auto-remote-session';
const AUTO_REMOTE_LOCK = 'browserking-auto-remote-lock';
let autoSessionStarting = false;

async function ensureAutoRemoteSession() {
  if (autoSessionStarting) return;
  autoSessionStarting = true;
  try {
    const extensionBase = chrome.runtime.getURL('sidepanel.html');
    const windows = await chrome.windows.getAll({ populate: true });
    const existingTabs = windows.flatMap(window => window.tabs || []);
    if (existingTabs.some(tab => tab.url?.startsWith(extensionBase) && tab.url.includes('autoRemote=1'))) return;

    // Service workers can be restarted between the check and windows.create.
    // Keep a short persistent lock so alarms/startup events cannot race.
    const lockState = await chrome.storage.local.get(AUTO_REMOTE_LOCK);
    const lockAt = Number(lockState[AUTO_REMOTE_LOCK] || 0);
    if (Date.now() - lockAt < 30_000) return;

    const target = existingTabs.find(tab => /^https?:\/\//.test(tab.url || ''));
    if (!target?.id) return;
    await chrome.storage.local.set({ [AUTO_REMOTE_LOCK]: Date.now() });
    const url = `${extensionBase}?tabId=${target.id}&autoRemote=1`;
    await chrome.windows.create({ url, type: 'popup', state: 'minimized', focused: false });
  } catch (error) {
    await chrome.storage.local.remove(AUTO_REMOTE_LOCK).catch(() => {});
    throw error;
  } finally {
    autoSessionStarting = false;
  }
}

// Sessões remotas são abertas sob demanda pelo Side Panel; nunca criamos pop-ups
// automaticamente no startup/alarme, evitando janelas duplicadas no Windows.
