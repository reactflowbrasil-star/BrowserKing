(function() {
  'use strict';

  const RELAY = 'https://hatclaw.com/extencao';
  const STORAGE_KEY = 'browserKingRemoteBridge';
  const TELEGRAM_ATTACHMENTS_STORAGE_KEY = 'browserKingTelegramAttachments';
  let token = '';
  let commandCursor = 0;
  let lastSnapshot = '';
  let stopped = false;
  let lastTabsSignature = '';

  async function request(path, options) {
    const headers = new Headers(options?.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options?.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${RELAY}${path}`, { ...options, headers });
    if (!response.ok) throw new Error(`Relay ${response.status}`);
    return response.json();
  }

  async function bootstrap() {
    const saved = await chrome.storage.local.get(STORAGE_KEY);
    token = saved?.[STORAGE_KEY]?.token || '';
    if (!token) {
      const response = await chrome.runtime.sendMessage({
        target: 'browserking-windows',
        action: 'relay.token',
        params: {}
      });
      if (response?.ok && response?.result?.token) {
        token = String(response.result.token).trim();
      }
    }
    if (!token) throw new Error('Relay token unavailable');
    const data = await request('/extension/bootstrap');
    token = data.token || token;
    commandCursor = Number(data.commandCursor || 0);
    await chrome.storage.local.set({ [STORAGE_KEY]: { token } });
    await publishCapabilities().catch(() => {});
  }

  async function publishCapabilities() {
    const stored = await chrome.storage.local.get(null);
    const serialized = JSON.stringify(stored).toLowerCase();
    const providerState = stored.browserKingProviderState?.providers || {};
    const enabledProviders = Object.values(providerState).filter(provider => provider?.enabled).length;
    await request('/extension/capabilities', {
      method: 'POST',
      body: JSON.stringify({
        tools: true,
        skills: /\"skills?\"|skill:/.test(serialized),
        plugins: /\"plugins?\"|plugin:/.test(serialized),
        apps: /connector|connectedapps|mcpserver|oauth/.test(serialized),
        providers: enabledProviders
      })
    });
  }

  async function queueTelegramAttachments(command) {
    const attachments = Array.isArray(command?.attachments) ? command.attachments : [];
    if (attachments.length === 0) {
      return;
    }

    await chrome.storage.local.set({
      [TELEGRAM_ATTACHMENTS_STORAGE_KEY]: {
        commandId: command.id || null,
        queuedAt: Date.now(),
        attachments
      }
    });
  }

  async function sendPrompt(text, approvalMode = 'auto') {
    const editor = document.querySelector('[data-test-id="message-input"]');
    if (!editor) throw new Error('Message editor is not available');
    editor.focus();
    document.execCommand('selectAll', false);
    if (!document.execCommand('insertText', false, String(text))) {
      editor.textContent = String(text);
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const button = document.querySelector('button[aria-label="Enviar mensagem"], button[aria-label="Send message"]');
      if (button && !button.disabled) {
        button.click();
        if (approvalMode === 'auto') {
          autoApprovePlan();
        }
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Send button is not ready');
  }

  async function autoApprovePlan() {
    for (let attempt = 0; attempt < 50 && !stopped; attempt += 1) {
      const approval = [...document.querySelectorAll('button')]
        .find(candidate => candidate.textContent?.trim() === 'Aprovar plano');
      if (approval && !approval.disabled) {
        approval.click();
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async function publishSnapshot(status) {
    const text = latestAssistantText();
    if (!text || text === lastSnapshot) return;
    lastSnapshot = text;
    await request('/extension/event', {
      method: 'POST',
      body: JSON.stringify({ type: 'assistant_message', status: status || 'updated', text })
    });
  }

  async function publishTabsSnapshot() {
    const tabs = await chrome.tabs.query({});
    const normalized = tabs
      .filter(tab => tab.id != null)
      .map(tab => ({
        id: tab.id,
        windowId: tab.windowId,
        title: String(tab.title || 'Sem título').slice(0, 180),
        url: String(tab.url || '').slice(0, 500),
        active: tab.active === true,
        status: tab.status || 'unknown'
      }));
    const signature = JSON.stringify(normalized);
    if (signature === lastTabsSignature) return;
    lastTabsSignature = signature;
    await request('/extension/event', {
      method: 'POST',
      body: JSON.stringify({ type: 'tabs_snapshot', tabs: normalized, updatedAt: Date.now() })
    });
  }

  function latestAssistantText() {
    const selectors = [
      '[data-message-author-role="assistant"]',
      '[data-testid*="assistant"]',
      '[data-test-id*="assistant"]',
      '[class*="assistant-message"]',
      '[class*="font-claude-response"]'
    ];
    const candidates = selectors.flatMap(selector => [...document.querySelectorAll(selector)])
      .filter((element, index, list) => list.indexOf(element) === index)
      .filter(element => element.getClientRects().length > 0)
      .map(element => String(element.innerText || element.textContent || '').trim())
      .filter(text => text.length > 0);
    return candidates.at(-1) || '';
  }

  async function poll() {
    while (!stopped) {
      try {
        const data = await request(`/extension/poll?since=${commandCursor}`);
        for (const command of data.items || []) {
          commandCursor = Math.max(commandCursor, command.id || 0);
          try {
            if (command.type === 'activate_tab') {
              const tabId = Number(command.tabId);
              if (!Number.isInteger(tabId)) throw new Error('Invalid tab id');
              const tab = await chrome.tabs.get(tabId);
              await chrome.windows.update(tab.windowId, { focused: true });
              await chrome.tabs.update(tabId, { active: true });
              await publishTabsSnapshot();
              continue;
            }
            await queueTelegramAttachments(command);
            await sendPrompt(command.text, command.approvalMode || 'auto');
            await publishSnapshot('sent');
          } catch (error) {
            await request('/extension/event', {
              method: 'POST',
              body: JSON.stringify({ type: 'error', message: error.message })
            });
          }
        }
      } catch (_) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  const observer = new MutationObserver(() => {
    clearTimeout(observer.timer);
    observer.timer = setTimeout(() => publishSnapshot('streaming').catch(() => {}), 150);
  });

  async function start() {
    try {
      await bootstrap();
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      await publishSnapshot('connected');
      await publishTabsSnapshot();
      chrome.tabs.onActivated.addListener(() => publishTabsSnapshot().catch(() => {}));
      chrome.tabs.onUpdated.addListener(() => publishTabsSnapshot().catch(() => {}));
      chrome.tabs.onRemoved.addListener(() => publishTabsSnapshot().catch(() => {}));
      setInterval(() => publishTabsSnapshot().catch(() => {}), 5000);
      poll();
    } catch (_) {
      setTimeout(start, 500);
    }
  }

  window.addEventListener('unload', () => { stopped = true; observer.disconnect(); });
  start();
})();
